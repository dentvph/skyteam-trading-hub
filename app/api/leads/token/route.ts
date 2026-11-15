import { issueFormToken } from '@/lib/leads';
import { leadJson, leadOriginAllowed, leadPreflight } from '@/lib/lead-origin';
export const dynamic = 'force-dynamic';
export function OPTIONS(request: Request) { return leadPreflight(request, 'GET'); }
export async function GET(request: Request) {
  const json = (value: unknown, status = 200) => leadJson(request, value, status);
  if (request.headers.has('origin') && !leadOriginAllowed(request)) return json({ error: 'Load registration from the Sky Team website.' }, 403);
  try { return json({ token: await issueFormToken() }); }
  catch { return json({ error: 'The enquiry form is temporarily unavailable. Please message Sky Team on Facebook.' }, 503); }
}
