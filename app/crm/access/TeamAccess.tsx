'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
type TeamMember = { email: string; role: 'viewer' | 'member'; created_at: number; updated_at: number };
const label = (role: string) => role === 'member' ? 'Follow-up' : 'Read only';

export default function TeamAccess() {
  const [items, setItems] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/crm/access', { cache: 'no-store' });
      const payload = await response.json() as { items?: TeamMember[]; error?: string };
      if (!response.ok || !Array.isArray(payload.items)) throw new Error(payload.error || 'Team access could not be loaded.');
      setItems(payload.items);
    } catch (problem) { setError((problem as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setFeedback('');
    try {
      const response = await fetch('/api/crm/access', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, role }) });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Access could not be saved.');
      setFeedback(`Access saved for ${email.trim()}. Share the CRM link with them.`); setEmail('');
      await load();
    } catch (problem) { setError((problem as Error).message); }
    finally { setSaving(false); }
  }
  async function revoke(member: TeamMember) {
    if (!window.confirm(`Remove CRM access for ${member.email}?`)) return;
    setSaving(true); setError(''); setFeedback('');
    try {
      const response = await fetch('/api/crm/access', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: member.email }) });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Access could not be removed.');
      setFeedback(`Access removed for ${member.email}.`); await load();
    } catch (problem) { setError((problem as Error).message); }
    finally { setSaving(false); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(new URL('/crm', location.origin).href); setFeedback('CRM link copied.'); }
    catch { setFeedback(`CRM link: ${new URL('/crm', location.origin).href}`); }
  }
  return <main className="crm-access-page">
    <header className="crm-access-header"><a className="crm-brand" href="/crm"><img src="/assets/sky-logo.png" width="48" height="48" alt="Sky Team logo"/><span>SKY TEAM<small>TEAM ACCESS</small></span></a><a className="crm-text-link" href="/crm">← Back to leads</a></header>
    <section className="crm-heading"><div><p className="crm-eyebrow">THE RIGHT ACCESS, FOR YOUR TEAM</p><h1>Team access<span>.</span></h1><p>Authorize the ChatGPT email your teammate uses to sign in. Your owner access is permanent.</p></div><button className="crm-button" onClick={() => void copyLink()}>Copy CRM link ↗</button></section>
    <section className="crm-panel crm-access-card"><h2>Give someone access</h2><p>Authorized teammates can see private contact details. Choose the access they need.</p>
      <form className="crm-access-form" onSubmit={event => void grant(event)}><label className="crm-field">ChatGPT email<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="teammate@example.com" maxLength={254} required autoComplete="off"/></label><label className="crm-field">Access level<select value={role} onChange={event => setRole(event.target.value)}><option value="viewer">Read only — view contacts</option><option value="member">Follow-up — view and update notes/status</option></select></label><button type="submit" className="crm-button" disabled={saving}>{saving ? 'Saving…' : 'Save access'}</button></form>
      <p className="crm-footnote">Only the owner can export or delete contacts, and manage access. No invitation email is sent. Share the CRM link after saving.</p>
      {error && <p className="crm-error" role="alert">{error}</p>}<p className="crm-feedback" role="status">{feedback}</p>
    </section>
    <section className="crm-panel crm-access-card"><div className="crm-panel-head"><div><h2>Your authorized team</h2><p>Access is checked whenever a teammate opens or changes a record.</p></div><button className="crm-refresh" disabled={loading} onClick={() => void load()}>{loading ? 'Loading…' : 'Refresh'}</button></div>
      {!loading && items.length === 0 && <p className="crm-access-empty">Only the owner has access. Add a teammate above when you're ready.</p>}
      {items.map(member => <article className="crm-access-member" key={member.email}><div><strong>{member.email}</strong><small>{label(member.role)} access</small></div><div><button className="crm-refresh" disabled={saving} onClick={() => { setEmail(member.email); setRole(member.role); }}>Edit</button><button className="crm-delete" disabled={saving} onClick={() => void revoke(member)}>Remove access</button></div></article>)}
    </section>
  </main>;
}
