import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const controller = await readFile(new URL('../public/lead-form.js', import.meta.url), 'utf8');
const landingHTML = await readFile(new URL('../content/landing.html', import.meta.url), 'utf8');
const key = 'sky-lead-submitted-until';

// Only the DOM surface used by the shipped controller is substituted. Requests
// and browser preferences are isolated; no real lead or external traffic is sent.
class Element {
  constructor() { this.hidden = false; this.open = false; this.disabled = false; this.dataset = {}; this.events = {}; this.innerHTML = ''; this.textContent = ''; }
  addEventListener(type, callback) { (this.events[type] ||= []).push(callback); }
  async emit(type, detail = {}) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, target: this, ...detail };
    for (const callback of this.events[type] || []) await callback(event);
    if (type === 'cancel' && !event.defaultPrevented) this.close();
    return event;
  }
  setAttribute(name, value) { this[name] = value; }
  showModal() { this.open = true; }
  close() { this.open = false; void this.emit('close'); }
  focus() { this.focused = true; }
  scrollIntoView() {}
  getBoundingClientRect() { return { left: 10, right: 500, top: 10, bottom: 500 }; }
}
function harness({ rememberedUntil, storageBlocked = false } = {}) {
  const elements = new Map();
  const get = selector => { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); };
  const groups = new Map();
  const all = selector => {
    if (!groups.has(selector)) groups.set(selector, [new Element()]);
    return groups.get(selector);
  };
  const values = new Map();
  if (rememberedUntil !== undefined) values.set(key, String(rememberedUntil));
  const storage = {
    getItem(name) { if (storageBlocked) throw new Error('Storage unavailable'); return values.get(name) || null; },
    setItem(name, value) { if (storageBlocked) throw new Error('Storage unavailable'); values.set(name, value); },
    removeItem(name) { if (storageBlocked) throw new Error('Storage unavailable'); values.delete(name); },
  };
  const requests = [];
  const player = { loads: 0, pauses: 0, load() { this.loads++; }, pause() { this.pauses++; } };
  const responses = [];
  const form = get('#lead-form');
  form.valid = true;
  form.reportValidity = () => form.valid;
  form.reset = () => { form.wasReset = true; };
  form.values = { name: 'Example Visitor', email: 'visitor@example.invalid', phone: '+15555550101', country: 'Canada', city: '', consent: 'on', website: '' };
  get('#landing-content').hidden = true;
  get('#landing-content').inert = true;
  get('#lead-form-view').hidden = true;
  get('#registration-confirmation').hidden = true;
  get('#lead-submit').innerHTML = 'Register &amp; explore';
  const window = { localStorage: storage, sessionStorage: storage, SkyOverview: player, scrollTo() {} };
  vm.runInNewContext(controller, {
    window, crypto: webcrypto,
    document: { querySelector: get, querySelectorAll: all },
    sessionStorage: storage, location: { search: '?utm_source=facebook&utm_campaign=welcome' }, URLSearchParams,
    FormData: class { constructor(input) { this.values = input.values; } get(name) { return this.values[name]; } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/token')) return { ok: true, json: async () => ({ token: 'isolated-test-token' }) };
      const response = responses.shift() || { ok: true, body: { ok: true } };
      return { ok: response.ok, json: async () => response.body };
    },
  });
  return { get, all, values, requests, player, responses, form };
}

test('new visitor watches YouTube first; failed saves stay gated and retry unlocks only after confirmation', async () => {
  const h = harness();
  assert.equal(h.get('#lead-dialog').open, true);
  assert.equal(h.get('#lead-video-view').hidden, false);
  assert.equal(h.get('#lead-form-view').hidden, true);
  assert.equal(h.player.loads, 1);
  assert.equal(h.requests.length, 0, 'opening video does not fetch a form token');
  await h.get('#lead-register-continue').emit('click');
  assert.equal(h.get('#lead-video-view').hidden, false, 'the same video stays visible above registration');
  assert.equal(h.get('#lead-form-view').hidden, false);
  assert.equal(h.get('#lead-dialog')['aria-labelledby'], 'lead-form-title');
  assert.equal(h.player.pauses, 0, 'opening registration does not pause YouTube');
  h.responses.push({ ok: false, body: { error: 'Please try again.' } });
  await h.form.emit('submit');
  assert.equal(h.get('#landing-content').hidden, true);
  assert.equal(h.get('#lead-dialog').open, true);
  assert.equal(h.get('#lead-form-error').textContent, 'Please try again.');
  assert.equal(h.values.has(key), false);
  assert.equal(h.get('#lead-submit').disabled, false);
  assert.equal(h.player.pauses, 0, 'a failed save does not interrupt YouTube');
  await h.form.emit('submit');
  const posts = h.requests.filter(request => request.url === '/api/leads').map(request => JSON.parse(request.options.body));
  assert.equal(posts.length, 2);
  assert.equal(posts[0].requestId, posts[1].requestId, 'retry preserves idempotency key');
  assert.equal(posts[1].consent, true);
  assert.equal(posts[1].source, 'landing:video-registration / facebook / welcome');
  assert.equal(h.get('#landing-content').hidden, false);
  assert.equal(h.get('#landing-content').inert, false);
  assert.equal(h.get('#community-entry').hidden, true);
  assert.equal(h.get('#lead-dialog').open, false);
  assert.equal(h.get('#registration-confirmation').hidden, false);
  assert.ok(Number(h.values.get(key)) > Date.now());
});

test('no close or skip controls; Escape and backdrop cannot dismiss unregistered video or form', async () => {
  const h = harness();
  const markup = landingHTML.match(/<dialog[^>]*id="lead-dialog"[\s\S]*?<\/dialog>/)[0];
  assert.doesNotMatch(markup, /id="lead-close"|data-dismiss-lead|>Cancel<|>Continue browsing</);
  assert.match(markup, /closedby="none"/);
  const dialog = h.get('#lead-dialog');
  const cancel = await dialog.emit('cancel');
  assert.equal(cancel.defaultPrevented, true);
  await dialog.emit('click', { clientX: 0, clientY: 0 });
  assert.equal(dialog.open, true);
  assert.equal(h.get('#landing-content').hidden, true);
  await h.get('#lead-register-continue').emit('click');
  await dialog.emit('cancel');
  await dialog.emit('click', { clientX: 0, clientY: 0 });
  assert.equal(dialog.open, true);
  assert.equal(h.get('#lead-form-view').hidden, false);
  assert.equal(h.get('#lead-video-view').hidden, false);
  await h.get('#lead-back-video').emit('click');
  assert.equal(h.get('#lead-video-view').hidden, false);
  assert.equal(h.get('#lead-form-view').hidden, true);
  assert.equal(h.player.pauses, 0);
  assert.equal(dialog.open, true);
  assert.equal(h.get('#landing-content').inert, true);
  assert.equal(h.values.has(key), false);
});

test('remembered visitors skip registration, can replay overview, and expired preferences show welcome', async () => {
  const h = harness({ rememberedUntil: Date.now() + 60000 });
  assert.equal(h.get('#lead-dialog').open, false);
  assert.equal(h.get('#landing-content').hidden, false);
  assert.equal(h.player.loads, 0);
  await h.all('[data-open-overview], #play-video')[0].emit('click');
  assert.match(h.get('#lead-register-continue').innerHTML, /Continue browsing/);
  await h.get('#lead-register-continue').emit('click');
  assert.equal(h.get('#lead-dialog').open, false);
  assert.equal(h.requests.length, 0);
  const expired = harness({ rememberedUntil: Date.now() - 1000 });
  assert.equal(expired.get('#lead-dialog').open, true);
  assert.equal(expired.get('#landing-content').hidden, true);
});

test('invalid forms stay gated; successful registration works when browser storage is unavailable', async () => {
  const h = harness({ storageBlocked: true });
  await h.get('#lead-register-continue').emit('click');
  h.form.valid = false;
  await h.form.emit('submit');
  assert.equal(h.requests.filter(request => request.url === '/api/leads').length, 0);
  assert.equal(h.get('#landing-content').hidden, true);
  h.form.valid = true;
  await h.form.emit('submit');
  assert.equal(h.get('#landing-content').hidden, false);
  assert.equal(h.get('#lead-dialog').open, false);
  assert.equal(h.values.has(key), false);
});
