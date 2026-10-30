import test, { after } from 'node:test';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const base = 'https://crm-test.local';
const require = createRequire(import.meta.url);
const { Miniflare } = await import(require.resolve('miniflare', { paths: [dirname(require.resolve('wrangler'))] }));
const ownerEmail = 'owner@example.invalid';
const ownerHeaders = { 'oai-authenticated-user-id':'local-owner-test', 'oai-authenticated-user-email':ownerEmail };
const formSecret = 'test-only-signing-key-for-isolated-miniflare';
const modulePaths = (await readdir(resolve('dist/server'),{recursive:true})).filter(path=>path.endsWith('.js')&&path!=='index.js');
const modules = [{type:'ESModule',path:resolve('dist/server/index.js')},...modulePaths.map(path=>({type:'ESModule',path:resolve('dist/server',path)}))];
const mf = new Miniflare({ modules, compatibilityDate:'2026-05-15', compatibilityFlags:['nodejs_compat'], d1Databases:{DB:'crm-integration-test'}, d1Persist:false, bindings:{CRM_OWNER_EMAIL:ownerEmail,LEAD_FORM_SECRET:formSecret}, cf:false });
after(()=>mf.dispose());
const database = await mf.getD1Database('DB');
for (const file of (await readdir(resolve('drizzle'))).filter(file => file.endsWith('.sql')).sort()) {
  const migration = await readFile(resolve('drizzle',file),'utf8');
  for (const statement of migration.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean)) await database.prepare(statement).run();
}
const originHeaders = { origin:base, 'sec-fetch-site':'same-origin', 'content-type':'application/json', 'cf-connecting-ip':'198.51.100.77' };
const call = (path, options = {}) => mf.dispatchFetch(new URL(path, base), options);
test('lead capture, owner authorization, idempotency, CRM edits and safe CSV export', async () => {
  const tokenResponse = await call('/api/leads/token'); assert.equal(tokenResponse.status, 200);
  const { token } = await tokenResponse.json(); assert.ok(token);
  const email = `sky-qa-${crypto.randomUUID()}@example.invalid`;
  const payload = { requestId:crypto.randomUUID(), name:'=QA Lead <script>', email, phone:'+1 416 555 0100', country:'Canada', city:'Toronto', consent:true, website:'', source:'local-api-test' };
  const post = (body = payload, extra = {}) => call('/api/leads', { method:'POST', headers:{...originHeaders,'x-sky-lead-token':token,...extra}, body:JSON.stringify(body) });
  assert.equal((await post(payload,{origin:'https://unrelated.example'})).status,403);
  assert.equal((await post({...payload,consent:false})).status,400);
  assert.equal((await post(payload,{'x-sky-lead-token':'invalid'})).status,403);
  assert.equal((await call('/api/crm/leads')).status,403);
  assert.equal((await call('/api/crm/export')).status,403);
  const anonymousPage = await call('/crm',{redirect:'manual'}); assert.equal(anonymousPage.status,200);
  const signInPage = await anonymousPage.text(); assert.ok(signInPage.includes('Sign in with ChatGPT'));
  assert.ok(signInPage.includes('/signin-with-chatgpt')); assert.ok(!signInPage.includes('Lead workspace'));
  const ownerPage = await call('/crm',{headers:ownerHeaders}); assert.equal(ownerPage.status,200);
  assert.ok((await ownerPage.text()).includes('Lead workspace'));
  assert.equal((await call('/api/crm/leads',{headers:{'oai-authenticated-user-id':'other-local-user','oai-authenticated-user-email':'other@example.invalid'}})).status,403);
  const create = await post(); assert.equal(create.status,200); assert.equal((await create.json()).ok,true);
  assert.equal((await post()).status,200);
  const search = `/api/crm/leads?q=${encodeURIComponent(email)}`;
  const listing = await call(search,{headers:ownerHeaders}); assert.equal(listing.status,200);
  const result = await listing.json(); assert.equal(result.total,1); assert.equal(result.items.length,1);
  const lead = result.items[0]; assert.equal(lead.referrer_code,'eePfC6mw'); assert.equal(lead.status,'new'); assert.equal(lead.country,'Canada'); assert.equal(lead.consent,1);
  try {
    assert.equal((await call(`/api/crm/leads/${lead.id}`,{method:'PATCH',headers:originHeaders,body:JSON.stringify({status:'contacted',notes:'unauthorized'})})).status,403);
    const notes = '=formula,"quoted"\nFollow up on community access.';
    const edit = await call(`/api/crm/leads/${lead.id}`,{method:'PATCH',headers:{...originHeaders,...ownerHeaders},body:JSON.stringify({status:'contacted',notes})});
    assert.equal(edit.status,200);
    const changed = await (await call(search+'&status=contacted',{headers:ownerHeaders})).json();
    assert.equal(changed.total,1); assert.equal(changed.items[0].notes,notes);
    const notJoined = await (await call(search+'&status=joined',{headers:ownerHeaders})).json(); assert.equal(notJoined.total,0);
    const csv = await call(`/api/crm/export?q=${encodeURIComponent(email)}`,{headers:ownerHeaders}); assert.equal(csv.status,200);
    const text = await csv.text(); assert.ok(text.includes('"\'=QA Lead <script>"')); assert.ok(text.includes('"\'+1 416 555 0100"')); assert.ok(text.includes('"\'=formula,""quoted""\nFollow up'));
    assert.equal((await post({...payload,phone:'1'})).status,400);
  } finally {
    const deleted = await call(`/api/crm/leads/${lead.id}`,{method:'DELETE',headers:{...originHeaders,...ownerHeaders}}); assert.equal(deleted.status,200);
  }
  const cleared = await (await call(search,{headers:ownerHeaders})).json(); assert.equal(cleared.total,0);
});

test('only the owner grants access; team permissions and revocation are enforced on the server', async () => {
  const viewerEmail = `viewer-${crypto.randomUUID()}@example.invalid`;
  const memberEmail = `member-${crypto.randomUUID()}@example.invalid`;
  const viewerHeaders = { 'oai-authenticated-user-id':'isolated-viewer', 'oai-authenticated-user-email':viewerEmail };
  const memberHeaders = { 'oai-authenticated-user-id':'isolated-member', 'oai-authenticated-user-email':memberEmail };
  const access = (method, body, headers = ownerHeaders) => call('/api/crm/access', {method,headers:{...originHeaders,...headers},body:JSON.stringify(body)});
  assert.equal((await call('/api/crm/access')).status,403);
  assert.equal((await access('POST',{email:viewerEmail,role:'owner'})).status,400);
  assert.equal((await access('POST',{email:ownerEmail,role:'viewer'})).status,400);
  assert.equal((await access('DELETE',{email:ownerEmail})).status,400);
  assert.equal((await access('POST',{email:viewerEmail,role:'viewer'},{...ownerHeaders,origin:'https://unrelated.example'})).status,403);
  assert.equal((await access('POST',{email:viewerEmail.toUpperCase(),role:'viewer'})).status,200);
  assert.equal((await access('POST',{email:memberEmail,role:'member'})).status,200);
  const team = await (await call('/api/crm/access',{headers:ownerHeaders})).json();
  assert.ok(team.items.some(row=>row.email===viewerEmail&&row.role==='viewer'));
  assert.equal((await call('/api/crm/leads',{headers:viewerHeaders})).status,200);
  assert.equal((await call('/api/crm/leads',{headers:memberHeaders})).status,200);
  assert.equal((await call('/api/crm/access',{headers:memberHeaders})).status,403);
  assert.equal((await access('POST',{email:memberEmail,role:'viewer'},memberHeaders)).status,403);
  assert.equal((await access('DELETE',{email:viewerEmail},memberHeaders)).status,403);
  const deniedAccessPage = await (await call('/crm/access',{headers:memberHeaders})).text();
  assert.ok(deniedAccessPage.includes('Owner access required.')); assert.ok(!deniedAccessPage.includes('Give someone access'));
  const ownerAccessPage = await (await call('/crm/access',{headers:ownerHeaders})).text();
  assert.ok(ownerAccessPage.includes('Give someone access'));
  const viewerPage = await (await call('/crm',{headers:viewerHeaders})).text();
  assert.ok(viewerPage.includes('Lead workspace')); assert.ok(!viewerPage.includes('Export CSV')); assert.ok(!viewerPage.includes('href="/crm/access"'));
  const { token } = await (await call('/api/leads/token')).json();
  const email = `role-qa-${crypto.randomUUID()}@example.invalid`;
  await call('/api/leads',{method:'POST',headers:{...originHeaders,'x-sky-lead-token':token},body:JSON.stringify({requestId:crypto.randomUUID(),name:'Role test',email,phone:'+1 416 555 0100',country:'Canada',consent:true})});
  const result = await (await call(`/api/crm/leads?q=${encodeURIComponent(email)}`,{headers:ownerHeaders})).json();
  assert.equal(result.total,1); const lead = result.items[0];
  try {
    const edit = headers => call(`/api/crm/leads/${lead.id}`,{method:'PATCH',headers:{...originHeaders,...headers},body:JSON.stringify({status:'contacted',notes:'Follow-up access works.'})});
    assert.equal((await edit(viewerHeaders)).status,403);
    assert.equal((await edit(memberHeaders)).status,200);
    for (const headers of [viewerHeaders,memberHeaders]) {
      assert.equal((await call('/api/crm/export',{headers})).status,403);
      assert.equal((await call(`/api/crm/leads/${lead.id}`,{method:'DELETE',headers:{...originHeaders,...headers}})).status,403);
    }
    assert.equal((await access('DELETE',{email:viewerEmail})).status,200);
    assert.equal((await call('/api/crm/leads',{headers:viewerHeaders})).status,403);
    assert.equal((await access('POST',{email:memberEmail,role:'viewer'})).status,200);
    assert.equal((await edit(memberHeaders)).status,403);
    assert.equal((await access('DELETE',{email:memberEmail})).status,200);
    assert.equal((await call('/api/crm/leads',{headers:memberHeaders})).status,403);
  } finally {
    await call(`/api/crm/leads/${lead.id}`,{method:'DELETE',headers:{...originHeaders,...ownerHeaders}});
    await access('DELETE',{email:viewerEmail}); await access('DELETE',{email:memberEmail});
  }
});
