import { requireChatGPTUser, chatGPTSignOutPath } from '@/app/chatgpt-auth';
import { owner } from '@/lib/leads';
import LeadsDashboard from './LeadsDashboard';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sky Team — Private Lead Manager', robots: { index: false, follow: false } };
export default async function CRMPage() {
  const user = await requireChatGPTUser('/crm');
  if (!await owner()) return <main className="crm-denied"><h1>Owner access required</h1><p>Lead records are private. Sign in with the Sky Team owner account.</p><a href={chatGPTSignOutPath('/crm')} target="_top">Switch account</a><a href="/">Back to the website</a></main>;
  return <LeadsDashboard displayName={user.fullName || 'Sky Team'} signOutPath={chatGPTSignOutPath('/crm')} />;
}
