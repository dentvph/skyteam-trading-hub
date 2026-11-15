import { db, field, json, ownerDenial, crmDenial, readJson, sameOrigin, STATUSES, type LeadStatus } from '@/lib/leads';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const denial = await crmDenial(true); if (denial) return denial;
  if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Lead not found.' }, 404);
  try {
    const value = await readJson(request);
    const status = field(value.status, 20) as LeadStatus;
    if (!STATUSES.includes(status) || typeof value.notes !== 'string' || value.notes.length > 5000) return json({ error: 'Check the status and notes (maximum 5,000 characters).' }, 400);
    const updated = await db().prepare('UPDATE leads SET status = ?, notes = ?, updated_at = ? WHERE id = ? RETURNING id').bind(status, value.notes, Date.now(), id).first();
    return updated ? json({ ok: true }) : json({ error: 'Lead not found.' }, 404);
  } catch { return json({ error: 'Changes could not be saved. Please try again.' }, 503); }
}
export async function DELETE(request: Request, context: Context) {
  const denial = await ownerDenial(); if (denial) return denial;
  if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Lead not found.' }, 404);
  try {
    await db().prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
    return json({ ok: true });
  } catch { return json({ error: 'The lead could not be deleted.' }, 503); }
}
