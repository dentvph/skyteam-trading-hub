import { env } from 'cloudflare:workers';
import { db, json, ownerDenial, readJson, sameOrigin } from '@/lib/leads';
export const dynamic = 'force-dynamic';

function emailField(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid ChatGPT email address.');
  if (email === env.CRM_OWNER_EMAIL?.trim().toLowerCase()) throw new Error('The owner already has permanent access.');
  return email;
}

export async function GET() {
  const denial = await ownerDenial(); if (denial) return denial;
  try {
    const rows = await db().prepare('SELECT email, role, created_at, updated_at FROM crm_access ORDER BY email LIMIT 100').all();
    return json({ items: rows.results });
  } catch { return json({ error: 'Team access could not be loaded.' }, 503); }
}

export async function POST(request: Request) {
  const denial = await ownerDenial(); if (denial) return denial;
  if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
  try {
    const value = await readJson(request);
    let email: string;
    try { email = emailField(value.email); } catch (error) { return json({ error: (error as Error).message }, 400); }
    if (value.role !== 'viewer' && value.role !== 'member') return json({ error: 'Choose read-only or follow-up access.' }, 400);
    const now = Date.now();
    const row = await db().prepare('INSERT INTO crm_access (email, role, created_at, updated_at) SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM crm_access) < 100 OR EXISTS (SELECT 1 FROM crm_access WHERE email = ?) ON CONFLICT(email) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at RETURNING email').bind(email, value.role, now, now, email).first();
    return row ? json({ ok: true }) : json({ error: 'The team access limit is 100 accounts.' }, 400);
  } catch { return json({ error: 'Access could not be saved. Please try again.' }, 503); }
}

export async function DELETE(request: Request) {
  const denial = await ownerDenial(); if (denial) return denial;
  if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
  try {
    const value = await readJson(request);
    let email: string;
    try { email = emailField(value.email); } catch (error) { return json({ error: (error as Error).message }, 400); }
    await db().prepare('DELETE FROM crm_access WHERE email = ?').bind(email).run();
    return json({ ok: true });
  } catch { return json({ error: 'Access could not be removed. Please try again.' }, 503); }
}
