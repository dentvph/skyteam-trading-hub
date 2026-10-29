import { csvCell, db, json, leadFilter, ownerDenial } from '@/lib/leads';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const denial = await ownerDenial(); if (denial) return denial;
  try {
    const filter = leadFilter(new URL(request.url));
    const result = await db().prepare(`SELECT name, email, phone, country, city, status, notes, source, referrer_code, consent, consent_version, consented_at, created_at FROM leads${filter.sql} ORDER BY created_at DESC LIMIT 10000`).bind(...filter.values).all<Record<string, unknown>>();
    const fields = ['name','email','phone','country','city','status','notes','source','referrer_code','consent','consent_version','consented_at','created_at'];
    const lines = [fields.map(csvCell).join(','), ...result.results.map(row => fields.map(key => csvCell(key.endsWith('_at') ? new Date(Number(row[key])).toISOString() : row[key])).join(','))];
    return new Response('\uFEFF' + lines.join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="sky-team-leads.csv"', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
  } catch { return json({ error: 'The export could not be generated.' }, 503); }
}
