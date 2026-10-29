import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';

export const STATUSES = ['new', 'contacted', 'registered', 'joined', 'archived'] as const;
export type LeadStatus = typeof STATUSES[number];
export const CONSENT_VERSION = '2026-10-29-community-enquiry-v1';
export const CONSENT_TEXT = 'I agree that Sky Team Trading Hub may contact me about my enquiry and community access using the details I provide.';
export function db(): D1Database {
  if (!env.DB) throw new Error('Lead storage is not configured.');
  return env.DB;
}
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return origin === new URL(request.url).origin && request.headers.get('sec-fetch-site') !== 'cross-site';
}
export async function owner() {
  const user = await getChatGPTUser();
  const allowed = env.CRM_OWNER_EMAIL?.trim().toLowerCase();
  return !!allowed && !!user && user.email.trim().toLowerCase() === allowed;
}
export async function ownerDenial() {
  return await owner() ? null : json({ error: 'Sign in with the Sky Team owner account to access the lead manager.' }, 403);
}
export async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('Expected a JSON submission.');
  if (Number(request.headers.get('content-length') || 0) > 12000) throw new Error('Submission is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Submission is empty.');
  const pieces: Uint8Array[] = []; let size = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > 12000) { await reader.cancel(); throw new Error('Submission is too large.'); }
    pieces.push(part.value);
  }
  const joined = new Uint8Array(size); let offset = 0;
  for (const piece of pieces) { joined.set(piece, offset); offset += piece.length; }
  const value = JSON.parse(new TextDecoder().decode(joined));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid submission.');
  return value as Record<string, unknown>;
}
function secret() {
  if (!env.LEAD_FORM_SECRET || env.LEAD_FORM_SECRET.length < 32) throw new Error('Lead submissions are temporarily unavailable.');
  return env.LEAD_FORM_SECRET;
}
async function key() {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function encode(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
function decode(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')), c => c.charCodeAt(0));
}
export async function issueFormToken() {
  const payload = `${Date.now()}.${crypto.randomUUID()}`;
  const signature = await crypto.subtle.sign('HMAC', await key(), new TextEncoder().encode(`lead-form:${payload}`));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}
export async function verifyFormToken(token: string | null) {
  if (!token || token.length > 200) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d{13}$/.test(parts[0]) || !/^[0-9a-f-]{36}$/i.test(parts[1])) return false;
  const age = Date.now() - Number(parts[0]);
  if (age < -60000 || age > 3600000) return false;
  try { return await crypto.subtle.verify('HMAC', await key(), decode(parts[2]), new TextEncoder().encode(`lead-form:${parts[0]}.${parts[1]}`)); }
  catch { return false; }
}
export async function allowSubmission(request: Request) {
  const now = Date.now(); const hour = Math.floor(now / 3600000);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const signed = await crypto.subtle.sign('HMAC', await key(), new TextEncoder().encode(`lead-rate:${ip}:${hour}`));
  const digest = encode(new Uint8Array(signed));
  const row = await db().prepare('INSERT INTO lead_rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < 20 RETURNING count').bind(digest, (hour + 2) * 3600000).first<{ count: number }>();
  await db().prepare('DELETE FROM lead_rate_limits WHERE expires_at < ?').bind(now).run();
  return !!row;
}
export function field(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
export function validateLead(value: Record<string, unknown>) {
  const name = field(value.name, 120); const email = field(value.email, 254).toLowerCase();
  const phone = field(value.phone, 40); const country = field(value.country, 80); const city = field(value.city, 100);
  const digits = phone.replace(/\D/g, ''); const requestId = field(value.requestId, 50);
  if (name.length < 2) throw new Error('Enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (digits.length < 8 || digits.length > 15 || !/^\+?[\d\s().-]+$/.test(phone)) throw new Error('Enter a valid phone number with country code.');
  if (country.length < 2) throw new Error('Enter your country.');
  if (value.consent !== true) throw new Error('Contact consent is required to send this enquiry.');
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('Please reopen the form and try again.');
  return { name, email, phone, country, city, requestId, source: field(value.source, 200) || 'landing-page' };
}
export function leadFilter(url: URL) {
  const search = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const status = url.searchParams.get('status') || '';
  const where: string[] = []; const values: string[] = [];
  if (STATUSES.includes(status as LeadStatus)) { where.push('status = ?'); values.push(status); }
  if (search) { where.push('(instr(lower(name), lower(?)) > 0 OR instr(lower(email), lower(?)) > 0 OR instr(lower(phone), lower(?)) > 0 OR instr(lower(country), lower(?)) > 0 OR instr(lower(city), lower(?)) > 0)'); for (let i = 0; i < 5; i++) values.push(search); }
  return { sql: where.length ? ` WHERE ${where.join(' AND ')}` : '', values };
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
