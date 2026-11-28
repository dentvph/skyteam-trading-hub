(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  async function api(path, options = {}) {
    const init = { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } };
    if (init.body && typeof init.body !== 'string') init.body = JSON.stringify(init.body);
    const r = await fetch(path, init);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; }
    return data;
  }
  function busy(button, label) {
    const old = button.textContent; button.disabled = true; button.textContent = label;
    return () => { button.disabled = false; button.textContent = old; };
  }
  const say = (el, text, kind = 'error') => { el.className = `msg ${kind}`; el.textContent = text; };
  const today = () => new Date().toLocaleDateString('en-CA');

  // ---------- Signed out ----------
  let challenge = null;
  function showLoginPanel(view) {
    $$('.switch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    $('#signin-panel').hidden = view !== 'signin';
    $('#request-panel').hidden = view !== 'request';
  }
  $$('.switch button').forEach(b => b.addEventListener('click', () => {
    showLoginPanel(b.dataset.view);
    history.replaceState(null, '', b.dataset.view === 'request' ? '?view=request' : location.pathname);
  }));

  $('#identifier-form').addEventListener('submit', async e => {
    e.preventDefault();
    const done = busy($('#identifier-submit'), 'Sending…');
    say($('#signin-msg'), '');
    try {
      const identifier = new FormData(e.target).get('identifier');
      const res = await api('/api/members/auth/request', { method: 'POST', body: { identifier } });
      challenge = res.challenge;
      $('#identifier-form').hidden = true; $('#code-form').hidden = false;
      say($('#code-info'), 'If that email or UID belongs to an approved member, a 6-digit code is on its way to the approved email. Check spam too.', 'info');
      if (res.devCode) say($('#code-msg'), `Test mode code: ${res.devCode}`, 'ok');
      $('#code-form [name=code]').focus();
    } catch (err) { say($('#signin-msg'), err.message); }
    finally { done(); }
  });
  $('#code-form').addEventListener('submit', async e => {
    e.preventDefault();
    const done = busy($('#code-submit'), 'Checking…');
    try {
      await api('/api/members/auth/verify', { method: 'POST', body: { challenge, code: new FormData(e.target).get('code') } });
      await boot();
    } catch (err) { say($('#code-msg'), err.message); }
    finally { done(); }
  });
  $('#code-restart').addEventListener('click', () => {
    challenge = null; $('#code-form').reset(); say($('#code-msg'), '');
    $('#code-form').hidden = true; $('#identifier-form').hidden = false;
  });

  $('#request-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target, data = new FormData(form);
    const done = busy($('#request-submit'), 'Sending…');
    try {
      const res = await api('/api/members/access-request', { method: 'POST', body: {
        name: data.get('name'), email: data.get('email'), uid: data.get('uid'), website: data.get('website'), consent: data.get('consent') === 'on' } });
      say($('#request-msg'), res.message || 'Request received.', 'ok');
      form.reset();
    } catch (err) { say($('#request-msg'), err.message); }
    finally { done(); }
  });

  // ---------- Signed in ----------
  function showTab(name) {
    $$('[role=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
    if (name === 'journal') loadJournal();
    if (name === 'beta') checkTerminal();
  }
  $$('[role=tab]').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // ---------- Premium Beta ----------
  const OFFLINE_TEXT = 'Offline right now. The Smart Terminal runs on Dennis\'s PC during the beta; when that PC, MT5 or the terminal is off or restarting, it can\'t be reached. Try again later (it is usually on during the trading week).';
  let termOnline = null;
  async function checkTerminal() {
    const box = $('#term-status');
    box.className = 'term-status'; $('#term-status-text').textContent = 'Checking the terminal…';
    try {
      const s = await api('/api/members/terminal/status');
      termOnline = !!s.online;
      box.className = `term-status ${termOnline ? 'on' : 'off'}`;
      $('#term-status-text').textContent = !s.configured ? 'The Smart Terminal is being switched on.'
        : termOnline ? 'Online: the terminal is reachable now.' : OFFLINE_TEXT;
    } catch { termOnline = null; box.className = 'term-status'; $('#term-status-text').textContent = 'Couldn\'t check the terminal status.'; }
    return termOnline;
  }
  $('#term-status').addEventListener('click', checkTerminal);
  $('#open-terminal').addEventListener('click', async () => {
    if ((await checkTerminal()) === false) { say($('#beta-msg'), OFFLINE_TEXT); return; }
    const win = window.open('about:blank', '_blank');            // open first, so pop-up blockers allow it
    const done = busy($('#open-terminal'), 'Opening…');
    try {
      const { url } = await api('/api/members/terminal', { method: 'POST', body: {} });
      if (win) { win.opener = null; win.location.href = url; } else location.href = url;
      say($('#beta-msg'), 'Opened in a new tab. If it says the terminal is offline, it is outside trading hours: try again later.', 'ok');
    } catch (err) { if (win) win.close(); say($('#beta-msg'), err.message); }
    finally { done(); }
  });
  $$('[data-goto]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); showTab(a.dataset.goto); }));

  $('#logout').addEventListener('click', async () => {
    await api('/api/members/logout', { method: 'POST' }).catch(() => {});
    location.href = '/members';
  });

  function resetForm(form) {
    form.reset(); delete form.dataset.editId;
    form.querySelector('[name=entryDate]').value = today();
    if (form.elements.currency) form.elements.currency.value = cal.cur;
    form.querySelector('button:not([type=button])').textContent = 'Save to my journal';
  }
  for (const [id, kind] of [['#pretrade-form', 'pretrade'], ['#review-form', 'review']]) {
    const form = $(id);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const msg = form.querySelector('.msg');
      const values = Object.fromEntries(new FormData(form));
      const body = { kind, entryDate: values.entryDate, instrument: values.instrument, session: values.session };
      for (const [k, v] of Object.entries(values)) if (!k.startsWith('check-') && !(k in body)) body[k] = v;
      if (kind === 'pretrade') body.checks = Object.fromEntries(['context', 'calendar', 'invalidation', 'terms'].map(c => [c, form.querySelector(`[name=check-${c}]`).checked]));
      const done = busy(form.querySelector('button:not([type=button])'), 'Saving…');
      try {
        const editId = form.dataset.editId;
        await api(editId ? `/api/members/journal/${editId}` : '/api/members/journal', { method: editId ? 'PUT' : 'POST', body });
        done(); resetForm(form); say(msg, 'Saved to your journal.', 'ok');
        setTimeout(() => say(msg, ''), 4000);
      } catch (err) { done(); say(msg, err.message); }
    });
  }

  const LABELS = {
    setup: 'Setup idea / reason', invalidation: 'Invalidation / planned exit', position: 'Position size', lossEstimate: 'Planned loss estimate', pause: 'When I pause or stand aside',
    plan: 'My plan', actual: 'What I actually did', rule: 'Rule followed or changed', feeling: 'What I felt', lesson: 'Lesson / change for next time',
    net: 'Net result after fees', trades: 'Trades closed', currency: 'Currency',
  };

  // ---------- Daily P&L calendar ----------
  const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'PHP', 'JPY', 'CHF', 'NZD', 'SGD'];
  const store = { get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const cal = { cur: store.get('sky.currency', 'USD'), month: null, day: null };
  for (const sel of [$('#cal-currency'), $('#review-currency')]) {
    for (const c of CURRENCIES) { const o = document.createElement('option'); o.value = o.textContent = c; sel.append(o); }
    sel.value = CURRENCIES.includes(cal.cur) ? cal.cur : 'USD';
  }
  // Practice trades from the Smart Terminal have their own calendar; they never mix with real results.
  { const o = document.createElement('option'); o.value = 'PRACTICE'; o.textContent = '🎓 Practice (terminal)'; $('#cal-currency').append(o); $('#cal-currency').value = cal.cur; }
  $('#cal-currency').addEventListener('change', e => { cal.cur = e.target.value; store.set('sky.currency', cal.cur); if (CURRENCIES.includes(cal.cur)) $('#review-currency').value = cal.cur; renderCalendar(); });
  $('#review-currency').addEventListener('change', e => store.set('sky.currency', e.target.value));
  const ym = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const money = (n, cur) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (cur ? ` ${cur === 'PRACTICE' ? 'practice' : cur}` : '');
  function moveMonth(step) { cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() + step, 1); cal.day = null; renderCalendar(); renderList(); }
  $('#cal-prev').addEventListener('click', () => moveMonth(-1));
  $('#cal-next').addEventListener('click', () => moveMonth(1));
  $('#cal-all').addEventListener('click', () => { cal.day = null; renderCalendar(); renderList(); });

  function dayTotals() {
    const t = {};
    for (const e of entries) {
      if (e.kind !== 'review' || typeof e.data.net !== 'number' || (e.data.currency || 'USD') !== cal.cur) continue;
      const d = (t[e.entry_date] ||= { net: 0, trades: 0, reviews: 0 });
      d.net += e.data.net; d.trades += Number(e.data.trades || 0); d.reviews++;
    }
    return t;
  }
  function renderCalendar() {
    if (!cal.month) { const n = new Date(); cal.month = new Date(n.getFullYear(), n.getMonth(), 1); }
    const m = cal.month, key = ym(m), totals = dayTotals();
    $('#cal-title').textContent = m.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
    const grid = $('#cal-grid'); grid.replaceChildren();
    for (const w of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) { const h = document.createElement('div'); h.className = 'cal-wd'; h.textContent = w; grid.append(h); }
    for (let i = 0; i < m.getDay(); i++) grid.append(Object.assign(document.createElement('div'), { className: 'cal-blank' }));
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    let net = 0, win = 0, loss = 0; const todayKey = today();
    for (let d = 1; d <= days; d++) {
      const date = `${key}-${String(d).padStart(2, '0')}`, t = totals[date];
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cal-day';
      const hasNotes = entries.some(e => e.entry_date === date);
      if (t) { net += t.net; if (t.net > 0) win++; else if (t.net < 0) loss++; b.classList.add(t.net > 0 ? 'pos' : t.net < 0 ? 'neg' : 'flat'); }
      if (date === todayKey) b.classList.add('today');
      if (cal.day === date) b.classList.add('sel');
      b.setAttribute('aria-label', `${date}: ${t ? money(t.net, cal.cur) : 'no recorded result'}`);
      b.innerHTML = `<span class="d">${d}</span><b>${t ? money(t.net) : '—'}</b><small>${t ? (t.trades ? `${t.trades} trade${t.trades === 1 ? '' : 's'}` : `${t.reviews} review${t.reviews === 1 ? '' : 's'}`) : hasNotes ? 'Notes only' : 'No trades'}</small>`;
      b.addEventListener('click', () => { cal.day = cal.day === date ? null : date; renderCalendar(); renderList(); $('#journal-heading').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      grid.append(b);
    }
    $('#cal-net').textContent = money(Math.round(net * 100) / 100, cal.cur);
    $('#cal-net').className = net > 0 ? 'g' : net < 0 ? 'r' : '';
    $('#cal-win').textContent = win; $('#cal-loss').textContent = loss;
    $('#cal-rate').textContent = win + loss ? `${Math.round(win / (win + loss) * 100)}%` : '—';
  }

  let entries = [];
  async function loadJournal() {
    const list = $('#entries');
    list.innerHTML = '<p class="dim">Loading…</p>';
    try {
      entries = (await api('/api/members/journal')).entries;
      renderCalendar();
      renderList();
    } catch (err) { list.innerHTML = ''; const p = document.createElement('p'); p.className = 'msg error'; p.textContent = err.message; list.append(p); }
  }
  function renderList() {
    const list = $('#entries');
    const shown = cal.day ? entries.filter(e => e.entry_date === cal.day) : entries;
    $('#journal-heading').textContent = cal.day ? `Entries for ${new Date(cal.day + 'T12:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}` : 'My journal';
    $('#cal-all').hidden = !cal.day;
    $('#journal-count').textContent = `${shown.length} entr${shown.length === 1 ? 'y' : 'ies'}`;
    {
      list.replaceChildren();
      if (!shown.length) { list.innerHTML = `<p class="empty">${cal.day ? 'No entries on this day.' : 'No entries yet. Start with the pre-trade checklist.'}</p>`; return; }
      for (const e of shown) {
        const card = document.createElement('article'); card.className = 'entry';
        const head = document.createElement('header');
        const title = document.createElement('div');
        const practice = e.data && e.data.source === 'practice';
        const pill = document.createElement('span'); pill.className = practice ? 'pill practice' : 'pill'; pill.textContent = practice ? '🎓 Practice trade' : e.kind === 'pretrade' ? 'Checklist' : 'Review';
        const h = document.createElement('h3'); h.textContent = `${e.entry_date}${e.instrument ? ' · ' + e.instrument : ''}${e.session ? ' · ' + e.session : ''}`;
        title.append(pill, h);
        const actions = document.createElement('div');
        const edit = document.createElement('button'); edit.className = 'btn small ghost'; edit.textContent = 'Edit';
        edit.addEventListener('click', () => editEntry(e));
        const del = document.createElement('button'); del.className = 'btn small danger'; del.textContent = 'Delete';
        del.addEventListener('click', async () => {
          if (!confirm('Delete this journal entry? This cannot be undone.')) return;
          await api(`/api/members/journal/${e.id}`, { method: 'DELETE' }).catch(err => alert(err.message));
          loadJournal();
        });
        if (practice) actions.append(del); else actions.append(edit, ' ', del);
        head.append(title, actions);
        const dl = document.createElement('dl');
        if (e.kind === 'pretrade') {
          const c = e.data.checks || {};
          const done = ['context', 'calendar', 'invalidation', 'terms'].filter(k => c[k]).length;
          const dt = document.createElement('dt'); dt.textContent = 'Checklist';
          const dd = document.createElement('dd'); dd.textContent = `${done} of 4 checks ticked`;
          dl.append(dt, dd);
        }
        for (const [k, v] of Object.entries(e.data)) {
          if (k === 'checks' || k === 'currency' || k === 'source' || v === '' || v == null) continue;
          const dt = document.createElement('dt'); dt.textContent = LABELS[k] || k;
          const dd = document.createElement('dd'); dd.textContent = k === 'net' ? money(v, e.data.currency || 'USD') : v;
          if (k === 'net') dd.className = v > 0 ? 'g' : v < 0 ? 'r' : '';
          dl.append(dt, dd);
        }
        card.append(head, dl);
        list.append(card);
      }
    }
  }
  function editEntry(e) {
    const form = e.kind === 'pretrade' ? $('#pretrade-form') : $('#review-form');
    resetForm(form);
    form.dataset.editId = e.id;
    form.entryDate.value = e.entry_date; form.instrument.value = e.instrument; form.session.value = e.session;
    for (const [k, v] of Object.entries(e.data)) if (form.elements[k] && k !== 'checks') form.elements[k].value = v;
    if (e.data.checks) for (const [k, v] of Object.entries(e.data.checks)) { const box = form.querySelector(`[name=check-${k}]`); if (box) box.checked = v; }
    form.querySelector('button:not([type=button])').textContent = 'Update entry';
    showTab(e.kind === 'pretrade' ? 'checklist' : 'review');
    form.scrollIntoView({ behavior: 'smooth' });
  }

  async function boot() {
    try {
      const { member } = await api('/api/members/me');
      $('#hello').textContent = `Welcome back, ${member.name.split(' ')[0]}.`;
      $('#beta-tab').hidden = !member.beta;
      if (member.beta && !member.terminalReady) say($('#beta-msg'), 'The Smart Terminal is being switched on. The button will work as soon as it is live.', 'info');
      $('#login-view').hidden = true; $('#hub-view').hidden = false; $('#logout').hidden = false;
      resetForm($('#pretrade-form')); resetForm($('#review-form'));
      showTab('lessons');
    } catch (err) {
      $('#hub-view').hidden = true; $('#logout').hidden = true; $('#login-view').hidden = false;
      showLoginPanel(new URLSearchParams(location.search).get('view') === 'request' ? 'request' : 'signin');
      if (err.status === 403) say($('#signin-msg'), err.message);
    }
  }
  boot();
})();
