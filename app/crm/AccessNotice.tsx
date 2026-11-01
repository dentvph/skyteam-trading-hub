import { chatGPTSignInPath, chatGPTSignOutPath } from '@/app/chatgpt-auth';

export default function AccessNotice({ signedIn = false, ownerOnly = false, returnTo = '/crm' }: { signedIn?: boolean; ownerOnly?: boolean; returnTo?: string }) {
  return <main className="crm-entry"><div className="crm-entry-card">
    <a className="crm-brand" href="/"><img src="/assets/sky-logo.png" alt="Sky Team logo" width="52" height="52"/><span>SKY TEAM<small>PRIVATE WORKSPACE</small></span></a>
    <p className="crm-eyebrow">A CLEARER VIEW OF EVERY CONVERSATION</p>
    <h1>{signedIn ? (ownerOnly ? 'Owner access required.' : 'Your team access starts here.') : 'Your Sky Team workspace.'}</h1>
    <p>{signedIn ? (ownerOnly ? 'Only the Sky Team owner can manage CRM access.' : 'Ask the Sky Team owner to authorize the email you use to sign in with ChatGPT.') : 'Sign in with your authorized ChatGPT account to view community enquiries and follow-ups.'}</p>
    <a className="crm-button" href={signedIn ? chatGPTSignOutPath(returnTo) : chatGPTSignInPath(returnTo)} target="_top">{signedIn ? 'Switch ChatGPT account' : 'Sign in with ChatGPT'} ↗</a>
    <p className="crm-entry-note">Contact records are private to the owner and authorized team. Website visitors can browse freely.</p>
    <a className="crm-text-link" href="/">← Back to Sky Team</a>
  </div></main>;
}
