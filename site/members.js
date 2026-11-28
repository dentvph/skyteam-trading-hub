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
  }
  $$('[role=tab]').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // ---------- Premium Beta ----------
  $('#open-terminal').addEventListener('click', async () => {
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
  };
  let entries = [];
  async function loadJournal() {
    const list = $('#entries');
    list.innerHTML = '<p class="dim">Loading…</p>';
    try {
      entries = (await api('/api/members/journal')).entries;
      $('#journal-count').textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
      list.replaceChildren();
      if (!entries.length) { list.innerHTML = '<p class="empty">No entries yet. Start with the pre-trade checklist.</p>'; return; }
      for (const e of entries) {
        const card = document.createElement('article'); card.className = 'entry';
        const head = document.createElement('header');
        const title = document.createElement('div');
        const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = e.kind === 'pretrade' ? 'Checklist' : 'Review';
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
        actions.append(edit, ' ', del);
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
          if (k === 'checks' || !v) continue;
          const dt = document.createElement('dt'); dt.textContent = LABELS[k] || k;
          const dd = document.createElement('dd'); dd.textContent = v;
          dl.append(dt, dd);
        }
        card.append(head, dl);
        list.append(card);
      }
    } catch (err) { list.innerHTML = ''; const p = document.createElement('p'); p.className = 'msg error'; p.textContent = err.message; list.append(p); }
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
