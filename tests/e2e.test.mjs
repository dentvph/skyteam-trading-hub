// End-to-end checks against a running local Worker:
//   npx wrangler dev --local   (with DEV_SHOW_CODES=1 and SESSION_SECRET in .dev.vars)
//   BASE=http://127.0.0.1:8787 node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OWNER = process.env.OWNER || 'dennis@skyteamtradinghub.com';
const run = Date.now().toString(36);

function client() {
  const jar = new Map();
  return async function call(path, { method = 'GET', body, headers = {}, origin = BASE } = {}) {
    const h = { ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (method !== 'GET' && origin) h.origin = origin;
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) {
      const [pair] = c.split(';'); const [k, v] = pair.split('=');
      if (v) jar.set(k, v); else jar.delete(k);
    }
    const type = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, data: type.includes('json') ? await r.json() : await r.text() };
  };
}

// The owner may request only 4 sign-in codes per 15 minutes, so later tests share one owner session.
let sharedOwner = null;
async function ownerSession() {
  if (!sharedOwner) { sharedOwner = client(); await signIn(sharedOwner, 'team', OWNER); }
  return sharedOwner;
}

async function signIn(call, kind, identifier) {
  const req = await call(`/api/${kind === 'team' ? 'crm' : 'members'}/auth/request`, { method: 'POST', body: kind === 'team' ? { email: identifier } : { identifier } });
  assert.equal(req.status, 200, JSON.stringify(req.data));
  assert.ok(req.data.devCode, 'dev code returned for a real account');
  const ver = await call(`/api/${kind === 'team' ? 'crm' : 'members'}/auth/verify`, { method: 'POST', body: { challenge: req.data.challenge, code: req.data.devCode } });
  assert.equal(ver.status, 200, JSON.stringify(ver.data));
}

test('static pages are served', async () => {
  const call = client();
  for (const p of ['/', '/members', '/crm', '/market-watch', '/styles.css', '/assets/sky-logo.png']) {
    assert.equal((await call(p)).status, 200, p);
  }
  assert.equal((await call('/does-not-exist')).status, 404);
});

test('registration: token, save, idempotent retry, returning visitor, honeypot, CSRF', async () => {
  const call = client();
  const { data: { token } } = await call('/api/leads/token');
  const lead = { requestId: `req-${run}-000001`, name: 'Test Visitor', email: `visitor-${run}@example.com`, phone: '+1 416 555 0100', country: 'Canada', city: 'Toronto', consent: true, emailOptIn: true, smsOptIn: false, website: '', source: 'test' };
  const headers = { 'x-sky-lead-token': token };
  assert.equal((await call('/api/leads', { method: 'POST', body: lead, headers })).data.ok, true);
  assert.equal((await call('/api/leads', { method: 'POST', body: lead, headers })).data.ok, true, 'retry ok');
  const back = await call('/api/leads/returning', { method: 'POST', body: { name: 'test visitor', email: lead.email }, headers });
  assert.equal(back.data.recognized, true);
  const nope = await call('/api/leads/returning', { method: 'POST', body: { name: 'Someone Else', email: lead.email }, headers });
  assert.equal(nope.data.recognized, false);
  assert.equal((await call('/api/leads', { method: 'POST', body: { ...lead, consent: false, requestId: `req-${run}-000002` }, headers })).status, 400);
  assert.equal((await call('/api/leads', { method: 'POST', body: lead })).status, 400, 'missing token rejected');
  assert.equal((await call('/api/leads', { method: 'POST', body: lead, headers, origin: 'https://evil.example' })).status, 403, 'other sites blocked');
  // GitHub Pages copy is allowed for registration only
  const gh = await call('/api/leads', { method: 'POST', body: { ...lead, requestId: `req-${run}-000003` }, headers, origin: 'https://dentvph.github.io' });
  assert.equal(gh.status, 200);
  assert.equal(gh.headers.get('access-control-allow-origin'), 'https://dentvph.github.io');
  assert.equal((await call('/api/crm/auth/request', { method: 'POST', body: { email: OWNER }, origin: 'https://dentvph.github.io' })).status, 403);
});

test('member journey: request → approve in CRM → sign in → journal → revoke', async () => {
  const visitor = client(), owner = client(), stranger = client();
  const uid = `UID${run}`.toUpperCase();
  const memberEmail = `member-${run}@example.com`;

  const req = await visitor('/api/members/access-request', { method: 'POST', body: { name: 'Test Member', email: memberEmail, uid, consent: true, website: '' } });
  assert.equal(req.data.status, 'received');

  // Not approved yet → no real code is issued (same-looking response, no devCode).
  const early = await visitor('/api/members/auth/request', { method: 'POST', body: { identifier: uid } });
  assert.equal(early.status, 200); assert.equal(early.data.devCode, undefined);
  // Unknown team email → same-looking response, no code.
  const fakeTeam = await stranger('/api/crm/auth/request', { method: 'POST', body: { email: 'nobody@example.com' } });
  assert.equal(fakeTeam.status, 200); assert.equal(fakeTeam.data.devCode, undefined);

  assert.equal((await stranger('/api/crm/leads')).status, 401, 'CRM locked when signed out');
  await signIn(owner, 'team', OWNER);
  const me = await owner('/api/crm/me');
  assert.equal(me.data.user.role, 'owner');
  const leads = await owner(`/api/crm/leads?q=visitor-${run}`);
  // One from the site (retried twice = one record) + one from the GitHub Pages copy.
  assert.equal(leads.data.leads.length, 2, 'idempotent registration stored once per requestId');
  const leadId = leads.data.leads[0].id;
  assert.equal((await owner(`/api/crm/leads/${leadId}`, { method: 'PATCH', body: { status: 'contacted', notes: 'Called back' } })).status, 200);
  const csv = await owner(`/api/crm/leads.csv?q=visitor-${run}`);
  assert.match(csv.data, /Called back/);

  const pending = await owner('/api/crm/members?status=pending');
  const m = pending.data.members.find(x => x.vt_uid === uid);
  assert.ok(m, 'request visible to CRM');
  assert.equal((await owner(`/api/crm/members/${m.id}`, { method: 'POST', body: { action: 'approve' } })).status, 200);

  // Same UID with a different email must NOT reveal "approved"; it is filed in CRM Contacts for review.
  const other = client();
  const clash = await other('/api/members/access-request', { method: 'POST', body: { name: 'Someone Else', email: `other-${run}@example.com`, uid, consent: true, website: '' } });
  assert.equal(clash.data.status, 'received', 'partial match looks like a normal request');
  const flagged = await owner(`/api/crm/leads?q=other-${run}`);
  assert.equal(flagged.data.leads.length, 1); assert.match(flagged.data.leads[0].notes, /UID already registered/);
  // Both email and UID right → told to sign in.
  const both = await other('/api/members/access-request', { method: 'POST', body: { name: 'Test Member', email: memberEmail, uid, consent: true, website: '' } });
  assert.equal(both.data.status, 'approved');

  // Sign in with UID; code goes to the approved email.
  await signIn(visitor, 'member', uid);
  const meMember = await visitor('/api/members/me');
  assert.equal(meMember.data.member.email, memberEmail);

  const entry = { kind: 'pretrade', entryDate: '2026-11-16', instrument: 'XAUUSD', session: 'NY', setup: 'Retest of 4H zone', invalidation: 'Close below zone', position: '0.01 lot', lossEstimate: '$10 CAD', pause: 'After 2 losses', checks: { context: true, calendar: true, invalidation: true, terms: false } };
  const saved = await visitor('/api/members/journal', { method: 'POST', body: entry });
  assert.equal(saved.status, 200);
  assert.equal((await visitor(`/api/members/journal/${saved.data.id}`, { method: 'PUT', body: { ...entry, setup: 'Edited' } })).status, 200);
  const list = await visitor('/api/members/journal');
  assert.equal(list.data.entries[0].data.setup, 'Edited');
  assert.equal(list.data.entries[0].data.checks.terms, false);
  // Another member can't touch this entry; CRM can't read journals.
  assert.equal((await stranger(`/api/members/journal/${saved.data.id}`, { method: 'DELETE' })).status, 401);
  assert.equal((await owner('/api/members/journal')).status, 401);

  // Wrong codes are limited.
  const again = await stranger('/api/members/auth/request', { method: 'POST', body: { identifier: memberEmail } });
  for (let i = 0; i < 5; i++) await stranger('/api/members/auth/verify', { method: 'POST', body: { challenge: again.data.challenge, code: '000000' } });
  assert.equal((await stranger('/api/members/auth/verify', { method: 'POST', body: { challenge: again.data.challenge, code: again.data.devCode } })).status, 400, 'locked after 5 wrong tries');

  // Team: add a manager, who can't export or delete.
  const managerEmail = `manager-${run}@example.com`;
  assert.equal((await owner('/api/crm/team', { method: 'POST', body: { email: managerEmail, role: 'manager' } })).status, 200);
  const manager = client();
  await signIn(manager, 'team', managerEmail);
  assert.equal((await manager(`/api/crm/leads/${leadId}`, { method: 'PATCH', body: { status: 'registered' } })).status, 200);
  assert.equal((await manager('/api/crm/leads.csv')).status, 403);
  assert.equal((await manager(`/api/crm/leads/${leadId}`, { method: 'DELETE' })).status, 403);
  assert.equal((await manager('/api/crm/team')).status, 403);
  await owner(`/api/crm/team?email=${encodeURIComponent(managerEmail)}`, { method: 'DELETE' });
  assert.equal((await manager('/api/crm/me')).status, 401, 'removed manager is signed out');

  // Revoke ends the member's session immediately.
  assert.equal((await owner(`/api/crm/members/${m.id}`, { method: 'POST', body: { action: 'revoke', note: 'test' } })).status, 200);
  assert.equal((await visitor('/api/members/me')).status, 401);

  // Owner can delete the test lead.
  assert.equal((await owner(`/api/crm/leads/${leadId}`, { method: 'DELETE' })).status, 200);
  await owner('/api/crm/logout', { method: 'POST' });
  assert.equal((await owner('/api/crm/me')).status, 401);
});

test('Jong and support sign in as managers', async () => {
  for (const who of ['jong@skyteamtradinghub.com', 'support@skyteamtradinghub.com']) {
    const c = client();
    await signIn(c, 'team', who);
    assert.equal((await c('/api/crm/me')).data.user.role, 'manager');
    assert.equal((await c('/api/crm/leads')).status, 200);
    assert.equal((await c('/api/crm/team')).status, 403);
  }
});

test('owner can add an already-approved member (migration path)', async () => {
  const owner = client();
  await signIn(owner, 'team', OWNER);
  const uid = `MIG${run}`.toUpperCase();
  assert.equal((await owner('/api/crm/members', { method: 'POST', body: { name: 'Moved Member', email: `moved-${run}@example.com`, uid } })).status, 200);
  assert.equal((await owner('/api/crm/members', { method: 'POST', body: { name: 'Dup', email: `moved-${run}@example.com`, uid } })).status, 409);
  const member = client();
  await signIn(member, 'member', `moved-${run}@example.com`);
  assert.equal((await member('/api/members/me')).data.member.uid, uid);
});

test('premium beta: owner-only seats, max 10, signed terminal hand-off, revoke frees the seat', async () => {
  const { createHmac } = await import('node:crypto');
  const owner = await ownerSession();
  const add = async (i) => {
    const email = `beta-${run}-${i}@example.com`;
    assert.equal((await owner('/api/crm/members', { method: 'POST', body: { name: `Beta Tester ${i}`, email, uid: `BETA${run}${i}` } })).status, 200);
    const { data } = await owner('/api/crm/members?status=approved');
    return { email, id: data.members.find(m => m.email === email).id };
  };
  const a = await add(0);
  const member = client(); await signIn(member, 'member', a.email);
  // Not a tester yet: no tab, no hand-off.
  assert.equal((await member('/api/members/me')).data.member.beta, false);
  assert.equal((await member('/api/members/terminal', { method: 'POST', body: {} })).status, 403);

  // Managers can't hand out seats.
  const jong = client(); await signIn(jong, 'team', 'jong@skyteamtradinghub.com');
  assert.equal((await jong(`/api/crm/members/${a.id}/beta`, { method: 'POST', body: { on: true } })).status, 403);

  const on = await owner(`/api/crm/members/${a.id}/beta`, { method: 'POST', body: { on: true } });
  assert.equal(on.status, 200, JSON.stringify(on.data));
  assert.equal((await member('/api/members/me')).data.member.beta, true);
  const open = await member('/api/members/terminal', { method: 'POST', body: {} });
  if (process.env.TERMINAL_SSO_SECRET) {
    assert.equal(open.status, 200, JSON.stringify(open.data));
    const t = new URL(open.data.url).searchParams.get('t');
    const [payload, sig] = t.split('.');
    const expect = createHmac('sha256', process.env.TERMINAL_SSO_SECRET).update(payload).digest('base64url');
    assert.equal(sig, expect, 'hand-off is signed with the shared secret');
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
    assert.equal(p.email, a.email); assert.equal(p.aud, 'skyteam-terminal');
    assert.ok(p.exp - p.iat <= 120 && p.jti.length >= 16);
  } else {
    assert.equal(open.status, 503, 'terminal not switched on without the secret');
  }
  // Cross-site requests can't mint a hand-off.
  assert.equal((await member('/api/members/terminal', { method: 'POST', body: {}, origin: 'https://evil.example' })).status, 403);

  // Fill the remaining seats, then the next one is refused.
  const { data: count0 } = await owner('/api/crm/members');
  const extra = [];
  for (let i = 1; count0.betaCount + extra.length < count0.betaLimit; i++) {
    const m = await add(i); extra.push(m);
    assert.equal((await owner(`/api/crm/members/${m.id}/beta`, { method: 'POST', body: { on: true } })).status, 200);
  }
  const over = await add(99);
  assert.equal((await owner(`/api/crm/members/${over.id}/beta`, { method: 'POST', body: { on: true } })).status, 409);

  // Revoking the member frees the seat and ends the hand-off.
  assert.equal((await owner(`/api/crm/members/${a.id}`, { method: 'POST', body: { action: 'revoke', note: '' } })).status, 200);
  assert.equal((await member('/api/members/terminal', { method: 'POST', body: {} })).status, 401);
  assert.equal((await owner(`/api/crm/members/${over.id}/beta`, { method: 'POST', body: { on: true } })).status, 200, 'seat freed');
  for (const m of [...extra, over]) await owner(`/api/crm/members/${m.id}/beta`, { method: 'POST', body: { on: false } });
});

test('journal: after-trade reviews can carry a daily net result for the calendar', async () => {
  const owner = await ownerSession();
  const email = `cal-${run}@example.com`;
  assert.equal((await owner('/api/crm/members', { method: 'POST', body: { name: 'Cal Tester', email, uid: `CAL${run}` } })).status, 200);
  const m = client(); await signIn(m, 'member', email);
  const ok = await m('/api/members/journal', { method: 'POST', body: { kind: 'review', entryDate: '2026-11-03', instrument: 'XAUUSD', net: '25.505', trades: '2', currency: 'cad', plan: 'x' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await m('/api/members/journal', { method: 'POST', body: { kind: 'review', entryDate: '2026-11-04', net: 'abc' } })).status, 400);
  assert.equal((await m('/api/members/journal', { method: 'POST', body: { kind: 'review', entryDate: '2026-11-04', net: '5', currency: 'XYZ' } })).status, 400);
  assert.equal((await m('/api/members/journal', { method: 'POST', body: { kind: 'review', entryDate: '2026-11-04', trades: '1.5' } })).status, 400);
  const { data } = await m('/api/members/journal');
  const e = data.entries.find(x => x.entry_date === '2026-11-03');
  assert.equal(e.data.net, 25.51); assert.equal(e.data.trades, 2); assert.equal(e.data.currency, 'CAD');
});
