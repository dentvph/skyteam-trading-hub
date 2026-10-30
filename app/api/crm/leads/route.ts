import { db, json, leadFilter, crmDenial } from '@/lib/leads';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const denial = await crmDenial(); if (denial) return denial;
  try {
    const url = new URL(request.url); const filter = leadFilter(url);
    const requested = Number(url.searchParams.get('offset') || 0); const offset = Number.isSafeInteger(requested) ? Math.max(0, Math.min(requested, 100000)) : 0;
    const [items, total, counts] = await Promise.all([
      db().prepare(`SELECT id, name, email, phone, country, city, status, notes, source, referrer_code, consent, consent_version, consented_at, created_at, updated_at FROM leads${filter.sql} ORDER BY created_at DESC, id DESC LIMIT 25 OFFSET ?`).bind(...filter.values, offset).all(),
      db().prepare(`SELECT COUNT(*) AS total FROM leads${filter.sql}`).bind(...filter.values).first<{ total: number }>(),
      db().prepare("SELECT COUNT(*) AS total, SUM(status = 'new') AS new, SUM(status = 'contacted') AS contacted, SUM(status = 'registered') AS registered, SUM(status = 'joined') AS joined, SUM(status = 'archived') AS archived FROM leads").first(),
    ]);
    return json({ items: items.results, total: total?.total || 0, counts, offset, limit: 25 });
  } catch (error) {
    console.error('[crm] Lead query failed:', error instanceof Error ? error.message : 'Unknown storage error');
    return json({ error: 'Lead records could not be loaded. Please try again.' }, 503);
  }
}
