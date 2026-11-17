import { createSession, endSession, requireTeam, startChallenge, teamRole, verifyChallenge } from "./auth";
import { Env, HttpError, clientIp, email, json, managerEmails, nowIso, ownerEmails, rateLimit, readJson, str, text } from "./util";

const LEAD_STATUSES = ["new", "contacted", "registered", "joined", "archived"];
const ALL = ["owner", "manager", "viewer"] as const;
const EDITORS = ["owner", "manager"] as const;

// ---- Sign-in ----

export async function teamAuthRequest(env: Env, request: Request): Promise<Response> {
  await rateLimit(env, `team-code-ip:${clientIp(request)}`, 10, 900);
  const body = await readJson(request);
  const address = email(body.email);
  const role = await teamRole(env, address);
  if (role) await rateLimit(env, `team-code:${address}`, 4, 900);
  return startChallenge(env, "team", role ? address : null, role ? address : null, address);
}

export async function teamAuthVerify(env: Env, request: Request): Promise<Response> {
  await rateLimit(env, `team-verify:${clientIp(request)}`, 20, 900);
  const body = await readJson(request);
  const subject = await verifyChallenge(env, "team", String(body.challenge || ""), String(body.code || "").trim());
  return createSession(env, request, "team", subject, { ok: true });
}

export const teamLogout = (env: Env, request: Request) => endSession(env, request, "team");

export async function teamMe(env: Env, request: Request): Promise<Response> {
  const user = await requireTeam(env, request, [...ALL]);
  return json({ user });
}

// ---- Leads ----

function leadFilters(url: URL) {
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const status = url.searchParams.get("status") || "";
  const where: string[] = [];
  const args: unknown[] = [];
  if (q) {
    where.push("(name LIKE ? OR email LIKE ? OR phone LIKE ? OR country LIKE ? OR city LIKE ?)");
    const like = `%${q.replace(/[%_]/g, "")}%`;
    args.push(like, like, like, like, like);
  }
  if (LEAD_STATUSES.includes(status)) { where.push("status = ?"); args.push(status); }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", args };
}

export async function listLeads(env: Env, request: Request): Promise<Response> {
  await requireTeam(env, request, [...ALL]);
  const url = new URL(request.url);
  const { sql, args } = leadFilters(url);
  const page = Math.max(0, Number(url.searchParams.get("page")) || 0);
  const rows = await env.DB.prepare(
    `SELECT id, name, email, phone, country, city, email_opt_in, sms_opt_in, source, status, notes, created_at, updated_at
     FROM leads ${sql} ORDER BY created_at DESC LIMIT 101 OFFSET ${page * 100}`,
  ).bind(...args).all();
  const counts = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM leads GROUP BY status").all<{ status: string; n: number }>();
  return json({
    leads: rows.results.slice(0, 100),
    more: rows.results.length > 100,
    counts: Object.fromEntries(counts.results.map((c) => [c.status, c.n])),
  });
}

export async function updateLead(env: Env, request: Request, id: number): Promise<Response> {
  await requireTeam(env, request, [...EDITORS]);
  const body = await readJson(request);
  const sets: string[] = [];
  const args: unknown[] = [];
  if (body.status !== undefined) {
    if (!LEAD_STATUSES.includes(String(body.status))) throw new HttpError(400, "Unknown status.");
    sets.push("status = ?"); args.push(body.status);
  }
  if (body.notes !== undefined) { sets.push("notes = ?"); args.push(text(body.notes, "Notes", 4000)); }
  if (!sets.length) throw new HttpError(400, "Nothing to update.");
  sets.push("updated_at = ?"); args.push(nowIso());
  const res = await env.DB.prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id).run();
  if (!res.meta.changes) throw new HttpError(404, "Contact not found.");
  return json({ ok: true });
}

export async function deleteLead(env: Env, request: Request, id: number): Promise<Response> {
  await requireTeam(env, request, ["owner"]);
  await env.DB.prepare("DELETE FROM leads WHERE id = ?1").bind(id).run();
  return json({ ok: true });
}

const csvCell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formulas
  return `"${s.replace(/"/g, '""')}"`;
};

export async function exportLeads(env: Env, request: Request): Promise<Response> {
  await requireTeam(env, request, ["owner"]);
  const { sql, args } = leadFilters(new URL(request.url));
  const rows = await env.DB.prepare(
    `SELECT id, created_at, name, email, phone, country, city, status, email_opt_in, sms_opt_in, source, notes FROM leads ${sql} ORDER BY created_at DESC`,
  ).bind(...args).all();
  const cols = ["id", "created_at", "name", "email", "phone", "country", "city", "status", "email_opt_in", "sms_opt_in", "source", "notes"];
  const csv = [cols.join(","), ...rows.results.map((r) => cols.map((c) => csvCell((r as Record<string, unknown>)[c])).join(","))].join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="skyteam-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}

// ---- Members (UID review + approvals) ----

export async function listMembers(env: Env, request: Request): Promise<Response> {
  await requireTeam(env, request, [...ALL]);
  const status = new URL(request.url).searchParams.get("status") || "";
  const valid = ["pending", "approved", "rejected", "revoked"].includes(status);
  const rows = await env.DB.prepare(
    `SELECT id, name, email, vt_uid, status, admin_note, created_at, reviewed_at, reviewed_by FROM members
     ${valid ? "WHERE status = ?1" : ""} ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 500`,
  ).bind(...(valid ? [status] : [])).all();
  return json({ members: rows.results });
}

export async function reviewMember(env: Env, request: Request, id: number): Promise<Response> {
  const user = await requireTeam(env, request, [...EDITORS]);
  const body = await readJson(request);
  const map: Record<string, string> = { approve: "approved", reject: "rejected", revoke: "revoked" };
  const status = map[String(body.action)];
  if (!status) throw new HttpError(400, "Unknown action.");
  const note = text(body.note, "Note", 1000);
  const res = await env.DB.prepare(
    "UPDATE members SET status = ?1, admin_note = ?2, reviewed_at = ?3, reviewed_by = ?4 WHERE id = ?5",
  ).bind(status, note, nowIso(), user.email, id).run();
  if (!res.meta.changes) throw new HttpError(404, "Member not found.");
  if (status !== "approved") {
    // End any open member sessions straight away.
    await env.DB.prepare("DELETE FROM sessions WHERE kind = 'member' AND subject = ?1").bind(String(id)).run();
  }
  return json({ ok: true });
}

/** Add an already-verified member directly (e.g. moving members over from the old site). */
export async function addMember(env: Env, request: Request): Promise<Response> {
  const user = await requireTeam(env, request, [...EDITORS]);
  const body = await readJson(request);
  const name = str(body.name, "Name", { min: 2, max: 120, required: true });
  const address = email(body.email);
  const uid = str(body.uid, "VT Markets UID", { min: 3, max: 64, required: true });
  const now = nowIso();
  try {
    await env.DB.prepare(
      `INSERT INTO members (name, email, vt_uid, status, admin_note, consent_at, created_at, reviewed_at, reviewed_by)
       VALUES (?1, ?2, ?3, 'approved', ?4, ?5, ?5, ?5, ?6)`,
    ).bind(name, address, uid, text(body.note, "Note", 1000), now, user.email).run();
  } catch {
    throw new HttpError(409, "That email or UID is already on file. Find it in the list and approve it there.");
  }
  return json({ ok: true });
}

// ---- Team access (owner only) ----

export async function listTeam(env: Env, request: Request): Promise<Response> {
  await requireTeam(env, request, ["owner"]);
  const rows = await env.DB.prepare("SELECT email, role, added_by, created_at FROM team ORDER BY created_at").all();
  return json({ owners: ownerEmails(env), managers: managerEmails(env), team: rows.results });
}

export async function saveTeam(env: Env, request: Request): Promise<Response> {
  const user = await requireTeam(env, request, ["owner"]);
  const body = await readJson(request);
  const address = email(body.email);
  const role = String(body.role);
  if (!["manager", "viewer"].includes(role)) throw new HttpError(400, "Choose manager or viewer.");
  if (ownerEmails(env).includes(address) || managerEmails(env).includes(address)) throw new HttpError(400, "That person already has access in the site settings.");
  await env.DB.prepare(
    "INSERT INTO team (email, role, added_by, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(email) DO UPDATE SET role = ?2",
  ).bind(address, role, user.email, nowIso()).run();
  return json({ ok: true });
}

export async function removeTeam(env: Env, request: Request): Promise<Response> {
  await requireTeam(env, request, ["owner"]);
  const address = email(new URL(request.url).searchParams.get("email"));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM team WHERE email = ?1").bind(address),
    env.DB.prepare("DELETE FROM sessions WHERE kind = 'team' AND subject = ?1").bind(address),
  ]);
  return json({ ok: true });
}
