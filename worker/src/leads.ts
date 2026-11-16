import { Env, HttpError, clientIp, email, hmac, json, nowIso, rateLimit, readJson, safeEqual, secret, str } from "./util";

const CONSENT_VERSION = "2026-11-contact-v1";
const TOKEN_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** Short-lived signed token so the form can't be posted blind by bots. */
export async function leadToken(env: Env): Promise<Response> {
  const payload = `${Date.now()}.${crypto.randomUUID()}`;
  return json({ token: `${payload}.${await hmac(secret(env), payload)}` });
}

async function checkToken(env: Env, request: Request) {
  const token = request.headers.get("x-sky-lead-token") || "";
  const parts = token.split(".");
  const bad = new HttpError(400, "This form expired. Please refresh the page and try again.");
  if (parts.length !== 3) throw bad;
  const [ts, id, sig] = parts;
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > TOKEN_MAX_AGE_MS) throw bad;
  if (!safeEqual(await hmac(secret(env), `${ts}.${id}`), sig)) throw bad;
}

export async function createLead(env: Env, request: Request): Promise<Response> {
  await checkToken(env, request);
  await rateLimit(env, `lead:${clientIp(request)}`, 8, 3600);
  const body = await readJson(request);
  // Honeypot: bots fill the hidden "website" field. Pretend success.
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });
  if (body.consent !== true) throw new HttpError(400, "Please tick the contact consent box to continue.");

  const requestId = str(body.requestId, "Request ID", { max: 64, required: true });
  if (!/^[A-Za-z0-9-]{8,64}$/.test(requestId)) throw new HttpError(400, "Please refresh the page and try again.");
  const now = nowIso();
  const lead = {
    name: str(body.name, "Name", { min: 2, max: 120, required: true }),
    email: email(body.email),
    phone: str(body.phone, "Phone number", { min: 5, max: 40, required: true }),
    country: str(body.country, "Country", { min: 2, max: 80, required: true }),
    city: str(body.city, "City", { max: 100 }),
    source: str(body.source, "Source", { max: 200 }) || "landing",
  };
  if (!/^[+()0-9 .-]{5,40}$/.test(lead.phone)) throw new HttpError(400, "Enter a valid phone number.");

  // Same requestId twice (double-click, retry) = one record.
  await env.DB.prepare(
    `INSERT INTO leads (request_id, name, email, phone, country, city, consent_version, consent_at,
       email_opt_in, sms_opt_in, source, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?8, ?8)
     ON CONFLICT(request_id) DO NOTHING`,
  ).bind(
    requestId, lead.name, lead.email, lead.phone, lead.country, lead.city || null, CONSENT_VERSION, now,
    body.emailOptIn === true ? 1 : 0, body.smsOptIn === true ? 1 : 0, lead.source,
  ).run();
  return json({ ok: true });
}

/** "Already registered?" – matches name + email to an earlier enquiry, without revealing anything else. */
export async function returningLead(env: Env, request: Request): Promise<Response> {
  await checkToken(env, request);
  await rateLimit(env, `returning:${clientIp(request)}`, 10, 900);
  const body = await readJson(request);
  const name = str(body.name, "Name", { min: 2, max: 120, required: true }).toLowerCase();
  const address = email(body.email);
  const row = await env.DB.prepare(
    "SELECT 1 AS found FROM leads WHERE email = ?1 AND lower(name) = ?2 LIMIT 1",
  ).bind(address, name).first();
  return json({ recognized: Boolean(row) });
}
