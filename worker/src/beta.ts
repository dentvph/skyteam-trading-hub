import { requireMember, requireTeam } from "./auth";
import { Env, HttpError, b64url, hmac, json, nowIso, randomToken, rateLimit, readJson } from "./util";

/** Premium beta is capped: the terminal runs on one PC during the beta. */
export const BETA_LIMIT = 10;
const HANDOFF_SECONDS = 120;

function terminalUrl(env: Env): string {
  return (env.TERMINAL_URL || "").replace(/\/+$/, "");
}

async function isBeta(env: Env, id: number): Promise<boolean> {
  const row = await env.DB.prepare("SELECT beta FROM members WHERE id = ?1 AND status = 'approved'").bind(id).first<{ beta: number }>();
  return !!row?.beta;
}

export async function betaStatus(env: Env, id: number) {
  const beta = await isBeta(env, id);
  return { beta, terminalReady: beta && !!terminalUrl(env) && !!env.TERMINAL_SSO_SECRET };
}

/**
 * Signed, short-lived hand-off to the terminal: base64url(payload).base64url(HMAC-SHA256(secret, payload)).
 * The terminal checks the signature, the expiry and that the one-time id (jti) was never used, then starts a
 * view-only member session. The secret is shared only between this site and the terminal.
 */
export async function openTerminal(env: Env, request: Request): Promise<Response> {
  const m = await requireMember(env, request);
  await rateLimit(env, `terminal:${m.id}`, 30, 3600);
  if (!(await isBeta(env, m.id))) throw new HttpError(403, "The Smart Terminal is for Premium Beta testers only.");
  const base = terminalUrl(env);
  const key = env.TERMINAL_SSO_SECRET || "";
  if (!base || key.length < 32) throw new HttpError(503, "The Smart Terminal isn't switched on yet. Please check back soon.");
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    sub: String(m.id), name: m.name, email: m.email, iat: now, exp: now + HANDOFF_SECONDS, jti: randomToken(16), aud: "skyteam-terminal",
  })));
  const token = `${payload}.${await hmac(key, payload)}`;
  return json({ url: `${base}/sso?t=${encodeURIComponent(token)}` });
}

/**
 * Is the Smart Terminal reachable right now? It runs on Dennis's PC behind a Cloudflare Tunnel, so it is
 * offline whenever the PC, MT5 or start.bat is off. Checked from Cloudflare (no CORS issues), cached 30 s.
 */
let statusCache: { at: number; online: boolean } | null = null;
export async function terminalStatus(env: Env, request: Request): Promise<Response> {
  const m = await requireMember(env, request);
  if (!(await isBeta(env, m.id))) throw new HttpError(403, "The Smart Terminal is for Premium Beta testers only.");
  const base = terminalUrl(env);
  if (!base) return json({ online: false, configured: false });
  if (statusCache && Date.now() - statusCache.at < 30_000) return json({ online: statusCache.online, configured: true });
  let online = false;
  try {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
    online = r.ok && ((await r.json().catch(() => ({}))) as { ok?: boolean }).ok === true;
  } catch { online = false; }
  statusCache = { at: Date.now(), online };
  return json({ online, configured: true });
}

/** Owner only: add or remove a Premium Beta tester (approved members, max BETA_LIMIT). */
export async function setBeta(env: Env, request: Request, id: number): Promise<Response> {
  const user = await requireTeam(env, request, ["owner"]);
  const body = await readJson(request);
  const on = body.on === true;
  const member = await env.DB.prepare("SELECT status, beta FROM members WHERE id = ?1").bind(id).first<{ status: string; beta: number }>();
  if (!member) throw new HttpError(404, "Member not found.");
  if (on) {
    if (member.status !== "approved") throw new HttpError(400, "Approve the member first.");
    if (!member.beta) {
      const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE beta = 1 AND status = 'approved'").first<{ n: number }>();
      if ((c?.n ?? 0) >= BETA_LIMIT) throw new HttpError(409, `The Premium Beta is full (${BETA_LIMIT} testers). Remove someone first.`);
    }
  }
  await env.DB.prepare("UPDATE members SET beta = ?1, beta_at = ?2, beta_by = ?3 WHERE id = ?4")
    .bind(on ? 1 : 0, nowIso(), user.email, id).run();
  return json({ ok: true, ...(await betaCount(env)) });
}

export async function betaCount(env: Env) {
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE beta = 1 AND status = 'approved'").first<{ n: number }>();
  return { betaCount: c?.n ?? 0, betaLimit: BETA_LIMIT };
}
