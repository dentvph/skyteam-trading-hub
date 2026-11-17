import { createSession, endSession, requireMember, startChallenge, verifyChallenge } from "./auth";
import { Env, HttpError, clientIp, email, json, nowIso, rateLimit, readJson, str, text } from "./util";

const UID = /^[A-Za-z0-9-]{3,64}$/;

export async function accessRequest(env: Env, request: Request): Promise<Response> {
  await rateLimit(env, `access:${clientIp(request)}`, 5, 3600);
  const body = await readJson(request);
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });
  if (body.consent !== true) throw new HttpError(400, "Please confirm the consent box.");
  const name = str(body.name, "Name", { min: 2, max: 120, required: true });
  const address = email(body.email);
  const uid = str(body.uid, "VT Markets UID", { min: 3, max: 64, required: true });
  if (!UID.test(uid)) throw new HttpError(400, "Your UID should only contain letters, numbers or dashes.");

  const existing = await env.DB.prepare(
    "SELECT status FROM members WHERE email = ?1 OR vt_uid = ?2",
  ).bind(address, uid).all<{ status: string }>();
  if (existing.results.some((r) => r.status === "approved")) {
    return json({ ok: true, status: "approved", message: "You're already approved. Use Member sign-in." });
  }
  if (existing.results.length) {
    // Already on file; don't create duplicates or reveal which field matched.
    return json({ ok: true, status: "received", message: "Your request is already with the team. We'll be in touch." });
  }
  await env.DB.prepare(
    "INSERT INTO members (name, email, vt_uid, status, consent_at, created_at) VALUES (?1, ?2, ?3, 'pending', ?4, ?4)",
  ).bind(name, address, uid, nowIso()).run();
  return json({ ok: true, status: "received", message: "Thanks! Dennis or Coach Jong will review your UID and referral." });
}

export async function memberAuthRequest(env: Env, request: Request): Promise<Response> {
  await rateLimit(env, `member-code-ip:${clientIp(request)}`, 10, 900);
  const body = await readJson(request);
  const identifier = str(body.identifier, "Email or UID", { min: 3, max: 254, required: true });
  const isEmail = identifier.includes("@");
  const member = await env.DB.prepare(
    `SELECT id, name, email FROM members WHERE status = 'approved' AND ${isEmail ? "email = ?1" : "vt_uid = ?1"}`,
  ).bind(isEmail ? identifier.toLowerCase() : identifier).first<{ id: number; name: string; email: string }>();
  if (member) await rateLimit(env, `member-code:${member.id}`, 4, 900);
  return startChallenge(env, "member", member ? String(member.id) : null, member?.email ?? null, member?.name ?? "");
}

export async function memberAuthVerify(env: Env, request: Request): Promise<Response> {
  await rateLimit(env, `member-verify:${clientIp(request)}`, 20, 900);
  const body = await readJson(request);
  const subject = await verifyChallenge(env, "member", String(body.challenge || ""), String(body.code || "").trim());
  return createSession(env, request, "member", subject, { ok: true });
}

export const memberLogout = (env: Env, request: Request) => endSession(env, request, "member");

export async function memberMe(env: Env, request: Request): Promise<Response> {
  const m = await requireMember(env, request);
  return json({ member: { name: m.name, email: m.email, uid: m.vt_uid } });
}

// ---- Journal (pre-trade checklist + after-the-decision review) ----

const PRETRADE_FIELDS = ["setup", "invalidation", "position", "lossEstimate", "pause"] as const;
const REVIEW_FIELDS = ["plan", "actual", "rule", "feeling", "lesson"] as const;
const CHECKS = ["context", "calendar", "invalidation", "terms"] as const;

function cleanEntry(body: Record<string, unknown>) {
  const kind = body.kind === "review" ? "review" : body.kind === "pretrade" ? "pretrade" : null;
  if (!kind) throw new HttpError(400, "Choose checklist or review.");
  const date = str(body.entryDate, "Date", { max: 10, required: true });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Enter a valid date.");
  const data: Record<string, unknown> = {};
  for (const f of kind === "pretrade" ? PRETRADE_FIELDS : REVIEW_FIELDS) data[f] = text(body[f], f, 2000);
  if (kind === "pretrade") {
    const checks = (body.checks && typeof body.checks === "object" ? body.checks : {}) as Record<string, unknown>;
    data.checks = Object.fromEntries(CHECKS.map((c) => [c, checks[c] === true]));
  }
  return {
    kind,
    date,
    instrument: str(body.instrument, "Instrument", { max: 40 }),
    session: str(body.session, "Session", { max: 60 }),
    data: JSON.stringify(data),
  };
}

export async function listJournal(env: Env, request: Request): Promise<Response> {
  const m = await requireMember(env, request);
  const rows = await env.DB.prepare(
    "SELECT id, kind, entry_date, instrument, session, data, updated_at FROM journal WHERE member_id = ?1 ORDER BY entry_date DESC, id DESC LIMIT 200",
  ).bind(m.id).all();
  return json({ entries: rows.results.map((r) => ({ ...r, data: JSON.parse(String(r.data)) })) });
}

export async function saveJournal(env: Env, request: Request, id?: number): Promise<Response> {
  const m = await requireMember(env, request);
  await rateLimit(env, `journal:${m.id}`, 120, 3600);
  const e = cleanEntry(await readJson(request, 24_000));
  const now = nowIso();
  if (id) {
    const res = await env.DB.prepare(
      "UPDATE journal SET kind=?1, entry_date=?2, instrument=?3, session=?4, data=?5, updated_at=?6 WHERE id=?7 AND member_id=?8",
    ).bind(e.kind, e.date, e.instrument, e.session, e.data, now, id, m.id).run();
    if (!res.meta.changes) throw new HttpError(404, "Entry not found.");
    return json({ ok: true, id });
  }
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM journal WHERE member_id = ?1").bind(m.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 2000) throw new HttpError(400, "Your journal is full. Delete old entries to add more.");
  const row = await env.DB.prepare(
    "INSERT INTO journal (member_id, kind, entry_date, instrument, session, data, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?7) RETURNING id",
  ).bind(m.id, e.kind, e.date, e.instrument, e.session, e.data, now).first<{ id: number }>();
  return json({ ok: true, id: row?.id });
}

export async function deleteJournal(env: Env, request: Request, id: number): Promise<Response> {
  const m = await requireMember(env, request);
  await env.DB.prepare("DELETE FROM journal WHERE id = ?1 AND member_id = ?2").bind(id, m.id).run();
  return json({ ok: true });
}
