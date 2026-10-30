import { getChatGPTUser, chatGPTSignOutPath } from '@/app/chatgpt-auth';
import { crmRole } from '@/lib/leads';
import LeadsDashboard from './LeadsDashboard';
import AccessNotice from './AccessNotice';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sky Team — Private Lead Manager', robots: { index: false, follow: false } };
export default async function CRMPage() {
  const user = await getChatGPTUser();
  if (!user) return <AccessNotice/>;
  const role = await crmRole();
  if (!role) return <AccessNotice signedIn/>;
  return <LeadsDashboard displayName={user.fullName || 'Sky Team'} role={role} signOutPath={chatGPTSignOutPath('/crm')} />;
}
