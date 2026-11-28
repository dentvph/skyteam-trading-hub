import { createSession, endSession, requireMember, sessionSubject, startChallenge, verifyChallenge } from "./auth";
import { betaStatus } from "./beta";
import { Env, HttpError, clientIp, email, json, nowIso, rateLimit, readJson, str, text } from "./util";

const UID = /^[A-Za-z0-9-]{3,64}$/;

export async function accessRequest(env: Env, request: Request): Promise<Response> {
  const body = await readJson(request);
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });   // honeypot: bots fill it
  if (body.consent !== true) throw new HttpError(400, "Please confirm the consent box.");
  const name = str(body.name, "Name", { min: 2, max: 120, required: true });
  const address = email(body.email);
  const uid = str(body.uid, "VT Markets UID", { min: 3, max: 64, required: true });
  if (!UID.test(uid)) throw new HttpError(400, "Your UID should only contain letters, numbers or dashes.");
  // Anti-spam: only complete requests count. 10 per hour from one connection, 3 per hour for one email.
  // The team (signed in to the CRM in the same browser) can test without hitting the connection limit.
  const team = await sessionSubject(env, request, "team").catch(() => null);
  try {
    if (!team) await rateLimit(env, `access:${clientIp(request)}`, 10, 3600);
    await rateLimit(env, `access-email:${address}`, 3, 3600);
  } catch (err) {
    if (err instanceof HttpError && err.status === 429) {
      throw new HttpError(429, "We already have several requests from you. Please wait about an hour before sending another; the team will review the one you sent.");
    }
    throw err;
  }

  const existing = await env.DB.prepare(
    "SELECT id, email, vt_uid, status FROM members WHERE email = ?1 OR vt_uid = ?2",
  ).bind(address, uid).all<{ id: number; email: string; vt_uid: string; status: string }>();
  const received = { ok: true, status: "received", message: "Thanks! Dennis or Coach Jong will review your UID and referral." };
  const exact = existing.results.find((r) => r.email === address && r.vt_uid === uid);
  if (exact) {
    // Only someone who knows BOTH the email and the UID learns the status.
    return json(exact.status === "approved"
      ? { ok: true, status: "approved", message: "You're already approved. Use Member sign-in." }
      : { ok: true, status: "received", message: "Your request is already with the team. We'll be in touch." });
  }
  if (existing.results.length) {
    // The email or the UID is already on another member record. Don't reveal anything about that record;
    // file the request in CRM Contacts so the team can sort it out (wrong email, shared UID, typo...).
    const clash = existing.results.some((r) => r.vt_uid === uid) ? "UID already registered to another email" : "email already registered with another UID";
    const now = nowIso();
    const note = `Member access request: ${clash}. Submitted UID: ${uid}. Check before approving.`;
    // A resubmission of the same request (same email + UID) is not filed twice.
    const dup = await env.DB.prepare(
      "SELECT id FROM leads WHERE source = 'Member access request (needs review)' AND email = ?1 AND notes LIKE ?2 AND status != 'archived'",
    ).bind(address, `%Submitted UID: ${uid}.%`).first();
    if (dup) return json(received);
    await env.DB.prepare(
      `INSERT INTO leads (request_id, name, email, phone, country, city, consent_version, consent_at,
         email_opt_in, sms_opt_in, source, notes, created_at, updated_at)
       VALUES (?1, ?2, ?3, '', '', NULL, 'member-request', ?4, 0, 0, 'Member access request (needs review)', ?5, ?4, ?4)`,
    ).bind(`member-req-${crypto.randomUUID()}`, name, address, now, note).run();
    return json(received);
  }
  await env.DB.prepare(
    "INSERT INTO members (name, email, vt_uid, status, consent_at, created_at) VALUES (?1, ?2, ?3, 'pending', ?4, ?4)",
  ).bind(name, address, uid, nowIso()).run();
  return json(received);
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
  return json({ member: { name: m.name, email: m.email, uid: m.vt_uid, ...(await betaStatus(env, m.id)) } });
}

// ---- Journal (pre-trade checklist + after-the-decision review) ----

const PRETRADE_FIELDS = ["setup", "invalidation", "position", "lossEstimate", "pause"] as const;
const REVIEW_FIELDS = ["plan", "actual", "rule", "feeling", "lesson"] as const;
const CHECKS = ["context", "calendar", "invalidation", "terms"] as const;
/** Account currencies for the daily P&L calendar (amounts are never converted or mixed). */
export const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "PHP", "JPY", "CHF", "NZD", "SGD"] as const;

function optNumber(v: unknown, label: string, min: number, max: number, integer = false): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new HttpError(400, `Enter a valid ${label}.`);
  return integer ? n : Math.round(n * 100) / 100;
}

function cleanEntry(body: Record<string, unknown>) {
  const kind = body.kind === "review" ? "review" : body.kind === "pretrade" ? "pretrade" : null;
  if (!kind) throw new HttpError(400, "Choose checklist or review.");
  const date = str(body.entryDate, "Date", { max: 10, required: true });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Enter a valid date.");
  const data: Record<string, unknown> = {};
  for (const f of kind === "pretrade" ? PRETRADE_FIELDS : REVIEW_FIELDS) data[f] = text(body[f], f, 2000);
  if (kind === "review") {
    // Optional daily-calendar result: net P&L after fees, trades closed, account currency.
    const net = optNumber(body.net, "net result", -10_000_000, 10_000_000);
    const trades = optNumber(body.trades, "number of trades", 0, 500, true);
    const cur = String(body.currency ?? "USD").toUpperCase();
    if (!(CURRENCIES as readonly string[]).includes(cur)) throw new HttpError(400, "Choose a supported currency.");
    if (net !== null) { data.net = net; data.currency = cur; }
    if (trades !== null) data.trades = trades;
  }
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
    "SELECT id, kind, entry_date, instrument, session, data, updated_at FROM journal WHERE member_id = ?1 ORDER BY entry_date DESC, id DESC LIMIT 1000",
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
