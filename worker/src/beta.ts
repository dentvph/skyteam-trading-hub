import { requireMember, requireTeam } from "./auth";
import { Env, HttpError, b64url, hmac, json, nowIso, randomToken, rateLimit, readJson, safeEqual } from "./util";

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

/**
 * Closed practice trades from the Smart Terminal → the member's journal (currency "PRACTICE", so they never
 * mix with real results). Signed by the terminal: HMAC-SHA256(TERMINAL_SSO_SECRET, ts + "." + body),
 * ts within 5 minutes. Each trade is stored once (journal_sync), so retries are safe.
 */
export async function practiceJournal(env: Env, request: Request): Promise<Response> {
  const key = env.TERMINAL_SSO_SECRET || "";
  if (key.length < 32) throw new HttpError(503, "Not configured.");
  const ts = request.headers.get("x-sky-ts") || "";
  const sig = request.headers.get("x-sky-sig") || "";
  const raw = await request.text();
  if (raw.length > 200_000) throw new HttpError(413, "Too large.");
  if (!/^\d{9,11}$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new HttpError(401, "Expired.");
  if (!safeEqual(sig, await hmac(key, `${ts}.${raw}`))) throw new HttpError(401, "Bad signature.");
  let body: { member_id?: unknown; trades?: unknown };
  try { body = JSON.parse(raw); } catch { throw new HttpError(400, "Bad JSON."); }
  const id = Number(body.member_id);
  if (!Number.isInteger(id)) throw new HttpError(400, "Bad member.");
  const member = await env.DB.prepare("SELECT id FROM members WHERE id = ?1 AND status = 'approved'").bind(id).first();
  if (!member) return json({ ok: true, stored: 0, skipped: "member not approved" });   // drop quietly; nothing to retry
  await rateLimit(env, `practice:${id}`, 300, 3600);
  const trades = Array.isArray(body.trades) ? body.trades.slice(0, 50) : [];
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  let stored = 0;
  for (const t of trades as Record<string, unknown>[]) {
    const ticket = num(t.ticket), profit = num(t.profit), open = num(t.open), close = num(t.close), vol = num(t.volume), tc = num(t.time_close);
    const to = num(t.time_open);
    if ([ticket, profit, open, close, vol, tc, to].some(Number.isNaN)) continue;
    const symbol = String(t.symbol || "").slice(0, 40);
    const side = t.side === "sell" ? "SELL" : "BUY";
    const reason = String(t.reason || "manual").slice(0, 20);
    const ext = `paper-${ticket}-${to}`;          // ticket + open time: unique even if the terminal's files are recreated
    const seen = await env.DB.prepare("SELECT 1 FROM journal_sync WHERE member_id = ?1 AND ext_id = ?2").bind(id, ext).first();
    if (seen) continue;
    const now = nowIso();
    const data = JSON.stringify({
      net: Math.round(profit * 100) / 100, trades: 1, currency: "PRACTICE", source: "practice",
      plan: "Practice trade in the SKY TEAM Smart Terminal",
      actual: `${side} ${vol} ${symbol} @ ${open} → closed @ ${close} (${reason === "TP" ? "take profit" : reason === "SL" ? "stop loss" : "closed manually"})`,
      rule: "", feeling: "", lesson: "",
    });
    const row = await env.DB.prepare(
      "INSERT INTO journal (member_id, kind, entry_date, instrument, session, data, created_at, updated_at) VALUES (?1, 'review', ?2, ?3, 'Practice account', ?4, ?5, ?5) RETURNING id",
    ).bind(id, day.format(new Date(tc * 1000)), symbol, data, now).first<{ id: number }>();
    await env.DB.prepare("INSERT OR IGNORE INTO journal_sync (member_id, ext_id, journal_id, created_at) VALUES (?1, ?2, ?3, ?4)")
      .bind(id, ext, row?.id ?? null, now).run();
    stored++;
  }
  return json({ ok: true, stored });
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
