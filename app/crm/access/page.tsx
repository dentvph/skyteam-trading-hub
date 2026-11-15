import { getChatGPTUser } from '@/app/chatgpt-auth';
import { owner } from '@/lib/leads';
import AccessNotice from '../AccessNotice';
import TeamAccess from './TeamAccess';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sky Team — Team Access', robots: { index: false, follow: false } };
export default async function AccessPage() {
  const user = await getChatGPTUser();
  if (!user) return <AccessNotice returnTo="/crm/access"/>;
  if (!await owner()) return <AccessNotice signedIn ownerOnly returnTo="/crm/access"/>;
  return <TeamAccess/>;
}
