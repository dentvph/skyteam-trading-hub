import { issueFormToken, json } from '@/lib/leads';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return json({ token: await issueFormToken() }); }
  catch { return json({ error: 'The enquiry form is temporarily unavailable. Please message Sky Team on Facebook.' }, 503); }
}
