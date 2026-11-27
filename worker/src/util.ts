export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  OWNER_EMAILS: string;
  MANAGER_EMAILS?: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO?: string;
  ALLOWED_ORIGINS?: string;
  RESEND_API_KEY?: string;
  SESSION_SECRET?: string;
  /** Premium Beta: public address of the Smart Terminal (Cloudflare Tunnel), e.g. https://terminal.skyteamtradinghub.com */
  TERMINAL_URL?: string;
  /** Premium Beta: shared secret that signs the hand-off to the terminal (same value in the terminal's config). */
  TERMINAL_SSO_SECRET?: string;
  /** Local development only: return sign-in codes in the API response. */
  DEV_SHOW_CODES?: string;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export const nowIso = () => new Date().toISOString();

const encoder = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return b64url(new Uint8Array(digest));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function hmac(secret: string, value: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(value));
  return b64url(new Uint8Array(sig));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function secret(env: Env): string {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 32) return env.SESSION_SECRET;
  throw new HttpError(503, "The site is still being set up. Please try again shortly.");
}

export async function readJson(request: Request, maxBytes = 16_000): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new HttpError(415, "Send the form as JSON.");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "That request is too large.");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "We could not read that request.");
  }
}

/** Trimmed string with length limits; returns "" for optional empty values. */
export function str(value: unknown, label: string, opts: { min?: number; max: number; required?: boolean }): string {
  const v = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!v) {
    if (opts.required) throw new HttpError(400, `${label} is required.`);
    return "";
  }
  if (opts.min && v.length < opts.min) throw new HttpError(400, `${label} is too short.`);
  if (v.length > opts.max) throw new HttpError(400, `${label} is too long.`);
  return v;
}

/** Multi-line text (journal notes). Keeps line breaks. */
export function text(value: unknown, label: string, max: number): string {
  const v = typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
  if (v.length > max) throw new HttpError(400, `${label} is too long (max ${max} characters).`);
  return v;
}

export function email(value: unknown, required = true): string {
  const v = str(value, "Email", { max: 254, required }).toLowerCase();
  if (!v) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw new HttpError(400, "Enter a valid email address.");
  return v;
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || "local";
}

/** Fixed-window rate limit stored in D1. Throws 429 when exceeded. */
export async function rateLimit(env: Env, key: string, limit: number, windowSeconds: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at <= ?3 THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= ?3 THEN ?2 ELSE rate_limits.reset_at END
     RETURNING count`,
  ).bind(key, now + windowSeconds, now).first<{ count: number }>();
  if (row && row.count > limit) throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function cookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

export function ownerEmails(env: Env): string[] {
  return (env.OWNER_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function managerEmails(env: Env): string[] {
  return (env.MANAGER_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS || "").split(",").map((e) => e.trim()).filter(Boolean);
}

export function maskEmail(value: string): string {
  const [user, domain] = value.split("@");
  if (!domain) return "your approved email";
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`;
}
