import { sendCodeEmail } from "./email";
import {
  Env, HttpError, cookie, getCookie, hmac, json, nowIso, ownerEmails, randomToken, safeEqual, secret, sha256,
} from "./util";

export type Kind = "member" | "team";
export const COOKIE: Record<Kind, string> = { member: "sky_member", team: "sky_team" };
const SESSION_DAYS: Record<Kind, number> = { member: 30, team: 7 };
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export type TeamRole = "owner" | "manager" | "viewer";
export interface TeamUser { email: string; role: TeamRole }
export interface MemberUser { id: number; name: string; email: string; vt_uid: string }

function codeHash(env: Env, challenge: string, code: string) {
  return hmac(secret(env), `${challenge}:${code}`);
}

function sixDigits(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

/**
 * Start a sign-in. `subject`/`to` are null when the identifier didn't match anyone:
 * we still create a challenge so the response looks identical (no account probing).
 */
export async function startChallenge(
  env: Env, kind: Kind, subject: string | null, to: string | null, name: string,
): Promise<Response> {
  const devMode = env.DEV_SHOW_CODES === "1";
  if (!env.RESEND_API_KEY && !devMode) {
    throw new HttpError(503, "Sign-in emails are not switched on yet. Please message SkyTeam on Facebook.");
  }
  const challenge = randomToken(24);
  const code = sixDigits();
  await env.DB.prepare(
    "INSERT INTO auth_codes (challenge, kind, subject, code_hash, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)",
  ).bind(challenge, kind, subject, await codeHash(env, challenge, code), Date.now() + CODE_MINUTES * 60_000).run();

  if (subject && to && env.RESEND_API_KEY) await sendCodeEmail(env, to, name, code, kind);

  const body: Record<string, unknown> = { ok: true, challenge, expiresInMinutes: CODE_MINUTES };
  if (devMode && subject) body.devCode = code;
  return json(body);
}

/** Check a code. Returns the subject on success. */
export async function verifyChallenge(env: Env, kind: Kind, challenge: string, code: string): Promise<string> {
  const generic = new HttpError(400, "That code is not valid or has expired. Request a new code.");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(challenge) || !/^\d{6}$/.test(code)) throw generic;
  const row = await env.DB.prepare(
    "SELECT subject, code_hash, attempts, used, expires_at FROM auth_codes WHERE challenge = ?1 AND kind = ?2",
  ).bind(challenge, kind).first<{ subject: string | null; code_hash: string; attempts: number; used: number; expires_at: number }>();
  if (!row || row.used || row.expires_at < Date.now() || row.attempts >= MAX_ATTEMPTS) throw generic;
  await env.DB.prepare("UPDATE auth_codes SET attempts = attempts + 1 WHERE challenge = ?1").bind(challenge).run();
  const ok = row.subject !== null && safeEqual(await codeHash(env, challenge, code), row.code_hash);
  if (!ok) throw generic;
  await env.DB.prepare("UPDATE auth_codes SET used = 1 WHERE challenge = ?1").bind(challenge).run();
  // Housekeeping: drop old codes and sessions.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_codes WHERE expires_at < ?1").bind(Date.now() - 86_400_000),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(Date.now()),
  ]);
  return row.subject!;
}

export async function createSession(env: Env, request: Request, kind: Kind, subject: string, body: unknown): Promise<Response> {
  const token = randomToken(32);
  const days = SESSION_DAYS[kind];
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, kind, subject, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
  ).bind(await sha256(token), kind, subject, Date.now() + days * 86_400_000, nowIso()).run();
  const secure = new URL(request.url).protocol === "https:";
  return json(body, 200, { "set-cookie": cookie(COOKIE[kind], token, days * 86_400, secure) });
}

export async function endSession(env: Env, request: Request, kind: Kind): Promise<Response> {
  const token = getCookie(request, COOKIE[kind]);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256(token)).run();
  const secure = new URL(request.url).protocol === "https:";
  return json({ ok: true }, 200, { "set-cookie": cookie(COOKIE[kind], "", 0, secure) });
}

async function sessionSubject(env: Env, request: Request, kind: Kind): Promise<string | null> {
  const token = getCookie(request, COOKIE[kind]);
  if (!token || token.length > 100) return null;
  const row = await env.DB.prepare(
    "SELECT subject FROM sessions WHERE token_hash = ?1 AND kind = ?2 AND expires_at > ?3",
  ).bind(await sha256(token), kind, Date.now()).first<{ subject: string }>();
  return row?.subject ?? null;
}

/** Owner list comes from configuration; managers/viewers from the team table. Checked on every request. */
export async function teamRole(env: Env, emailAddress: string): Promise<TeamRole | null> {
  if (ownerEmails(env).includes(emailAddress)) return "owner";
  const row = await env.DB.prepare("SELECT role FROM team WHERE email = ?1").bind(emailAddress).first<{ role: TeamRole }>();
  return row?.role ?? null;
}

export async function requireTeam(env: Env, request: Request, roles: TeamRole[]): Promise<TeamUser> {
  const subject = await sessionSubject(env, request, "team");
  if (!subject) throw new HttpError(401, "Please sign in to the CRM.");
  const role = await teamRole(env, subject);
  if (!role) throw new HttpError(403, "Your CRM access has been removed.");
  if (!roles.includes(role)) throw new HttpError(403, "Your role cannot do that.");
  return { email: subject, role };
}

export async function requireMember(env: Env, request: Request): Promise<MemberUser> {
  const subject = await sessionSubject(env, request, "member");
  if (!subject) throw new HttpError(401, "Please sign in to the Member Hub.");
  const member = await env.DB.prepare(
    "SELECT id, name, email, vt_uid FROM members WHERE id = ?1 AND status = 'approved'",
  ).bind(Number(subject)).first<MemberUser>();
  if (!member) throw new HttpError(403, "Your membership is not active. Please message SkyTeam.");
  return member;
}
