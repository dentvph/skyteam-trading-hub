import { allowSubmission, CONSENT_VERSION, db, json, readJson, sameOrigin, validateLead, verifyFormToken } from '@/lib/leads';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: 'Submit the form from the Sky Team website.' }, 403);
  try {
    if (!await verifyFormToken(request.headers.get('x-sky-lead-token'))) return json({ error: 'Your form session expired. Please close and reopen the form.' }, 403);
    const value = await readJson(request);
    if (typeof value.website === 'string' && value.website) return json({ ok: true });
    let lead: ReturnType<typeof validateLead>;
    try { lead = validateLead(value); } catch (error) { return json({ error: (error as Error).message }, 400); }
    if (!await allowSubmission(request)) return json({ error: 'Too many attempts. Please try again later or message Sky Team.' }, 429);
    const now = Date.now();
    await db().prepare('INSERT INTO leads (id, request_id, name, email, phone, country, city, consent, consent_version, consented_at, status, notes, source, referrer_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(request_id) DO NOTHING')
      .bind(crypto.randomUUID(), lead.requestId, lead.name, lead.email, lead.phone, lead.country, lead.city, CONSENT_VERSION, now, 'new', '', lead.source, 'eePfC6mw', now, now).run();
    return json({ ok: true });
  } catch (error) {
    const badInput = error instanceof SyntaxError || /Submission|submission|JSON/.test((error as Error).message || '');
    if (!badInput) console.error('[leads] Storage operation failed:', error instanceof Error ? error.message : 'Unknown storage error');
    return json({ error: badInput ? 'Please check the form and try again.' : 'We could not save your details. Please try again or message Sky Team on Facebook.' }, badInput ? 400 : 503);
  }
}
