(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const el = (tag, props = {}, ...children) => { const n = Object.assign(document.createElement(tag), props); n.append(...children.filter(c => c != null)); return n; };
  const when = iso => iso ? new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto' }).format(new Date(iso)) : '';

  async function api(path, options = {}) {
    const init = { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}) } };
    if (init.body && typeof init.body !== 'string') init.body = JSON.stringify(init.body);
    const r = await fetch(path, init);
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) { showLogin(); throw new Error(data.error || 'Please sign in.'); }
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  function busy(button, label) { const old = button.textContent; button.disabled = true; button.textContent = label; return () => { button.disabled = false; button.textContent = old; }; }
  const say = (node, text, kind = 'error') => { node.className = `msg ${kind}`; node.textContent = text; };
  let user = null;
  const canEdit = () => user && ['owner', 'manager'].includes(user.role);
  const isOwner = () => user && user.role === 'owner';

  // ---------- Sign-in ----------
  let challenge = null;
  function showLogin() { $('#app-view').hidden = true; $('#logout').hidden = true; $('#who').textContent = ''; $('#login-view').hidden = false; }
  $('#email-form').addEventListener('submit', async e => {
    e.preventDefault();
    const done = busy($('#email-submit'), 'Sending…');
    say($('#login-msg'), '');
    try {
      const res = await api('/api/crm/auth/request', { method: 'POST', body: { email: new FormData(e.target).get('email') } });
      challenge = res.challenge;
      $('#email-form').hidden = true; $('#code-form').hidden = false;
      say($('#code-info'), 'If this email has team access, a 6-digit code is on its way. Check spam too.', 'info');
      if (res.devCode) say($('#code-msg'), `Test mode code: ${res.devCode}`, 'ok');
      $('#code-form [name=code]').focus();
    } catch (err) { say($('#login-msg'), err.message); } finally { done(); }
  });
  $('#code-form').addEventListener('submit', async e => {
    e.preventDefault();
    const done = busy($('#code-submit'), 'Checking…');
    try { await api('/api/crm/auth/verify', { method: 'POST', body: { challenge, code: new FormData(e.target).get('code') } }); await boot(); }
    catch (err) { say($('#code-msg'), err.message); } finally { done(); }
  });
  $('#code-restart').addEventListener('click', () => { challenge = null; $('#code-form').reset(); say($('#code-msg'), ''); $('#code-form').hidden = true; $('#email-form').hidden = false; });
  $('#logout').addEventListener('click', async () => { await api('/api/crm/logout', { method: 'POST' }).catch(() => {}); location.reload(); });

  // ---------- Tabs ----------
  function showTab(name) {
    $$('[role=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
    ({ leads: loadLeads, members: loadMembers, team: loadTeam })[name]();
  }
  $$('[role=tab]').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // ---------- Contacts ----------
  const STAGES = ['new', 'contacted', 'registered', 'joined', 'archived'];
  let searchTimer;
  $('#lead-q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadLeads, 300); });
  $('#lead-status').addEventListener('change', loadLeads);
  let leadKind = '';
  function leadQuery() { const p = new URLSearchParams(); if ($('#lead-q').value.trim()) p.set('q', $('#lead-q').value.trim()); if ($('#lead-status').value) p.set('status', $('#lead-status').value); if (leadKind) p.set('kind', leadKind); return p.toString(); }
  // Prospects (registered on the site, not an approved member yet) vs Members (approved, same email).
  $$('#lead-kind button').forEach(b => b.addEventListener('click', () => {
    leadKind = b.dataset.kind;
    $$('#lead-kind button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    loadLeads();
  }));

  async function loadLeads() {
    const body = $('#lead-rows');
    try {
      const data = await api(`/api/crm/leads?${leadQuery()}`);
      $('#export').href = `/api/crm/leads.csv?${leadQuery()}`;
      $('#lead-stats').replaceChildren(...STAGES.map(s => el('span', { textContent: `${s[0].toUpperCase() + s.slice(1)}: ${data.counts[s] || 0}` })));
      $('#lead-more').hidden = !data.more;
      $('#n-prospects').textContent = data.prospects ?? ''; $('#n-members').textContent = data.members ?? '';
      body.replaceChildren();
      if (!data.leads.length) body.append(el('tr', {}, el('td', { colSpan: 5, className: 'empty', textContent: 'No contacts match.' })));
      for (const l of data.leads) {
        const row = el('tr', { style: 'cursor:pointer' },
          el('td', {}, el('b', { textContent: l.name }), l.is_member ? el('span', { className: 'pill approved', textContent: 'member', title: 'An approved member uses this email' }) : el('span', { className: 'pill prospect', textContent: 'prospect' }), el('small', { textContent: l.email }), el('small', { textContent: l.phone })),
          el('td', { textContent: [l.city, l.country].filter(Boolean).join(', ') }),
          el('td', {}, el('small', { textContent: `Email ${l.email_opt_in ? 'yes' : 'no'} · SMS ${l.sms_opt_in ? 'yes' : 'no'}` })),
          el('td', {}, el('span', { className: `pill ${l.status}`, textContent: l.status })),
          el('td', {}, el('small', { textContent: when(l.created_at) }), el('small', { textContent: l.source || '' })));
        row.addEventListener('click', () => toggleLead(row, l));
        body.append(row);
      }
    } catch (err) { body.replaceChildren(el('tr', {}, el('td', { colSpan: 5 }, el('p', { className: 'msg error', textContent: err.message })))); }
  }
  function toggleLead(row, l) {
    const next = row.nextElementSibling;
    if (next && next.classList.contains('editor')) { next.remove(); row.classList.remove('open'); return; }
    row.classList.add('open');
    const select = el('select', {}, ...STAGES.map(s => el('option', { value: s, textContent: s[0].toUpperCase() + s.slice(1), selected: s === l.status })));
    const notes = el('textarea', { value: l.notes || '', maxLength: 4000, placeholder: 'Private notes' });
    const msg = el('div', { className: 'msg' });
    const save = el('button', { className: 'btn small', textContent: 'Save' });
    const editable = canEdit();
    select.disabled = notes.disabled = save.disabled = !editable;
    save.addEventListener('click', async () => {
      const done = busy(save, 'Saving…');
      try { await api(`/api/crm/leads/${l.id}`, { method: 'PATCH', body: { status: select.value, notes: notes.value } }); done(); loadLeads(); }
      catch (err) { done(); say(msg, err.message); }
    });
    const actions = el('div', {}, save);
    if (isOwner()) {
      const del = el('button', { className: 'btn small danger', textContent: 'Delete' });
      del.addEventListener('click', async () => {
        if (!confirm(`Permanently delete ${l.name}'s record? This cannot be undone.`)) return;
        try { await api(`/api/crm/leads/${l.id}`, { method: 'DELETE' }); loadLeads(); } catch (err) { say(msg, err.message); }
      });
      actions.append(' ', del);
    }
    row.after(el('tr', { className: 'editor open' }, el('td', { colSpan: 5 }, msg,
      el('div', { className: 'rowedit' }, el('label', {}, 'Stage', select), el('label', {}, 'Notes', notes), actions))));
  }

  // ---------- Members ----------
  $('#member-status').addEventListener('change', loadMembers);
  $('#add-member-toggle').addEventListener('click', () => { $('#add-member').hidden = !$('#add-member').hidden; });
  $('#add-member').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target, msg = form.querySelector('.msg');
    const done = busy(form.querySelector('button'), 'Adding…');
    try { await api('/api/crm/members', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); form.reset(); say(msg, 'Member added and approved.', 'ok'); loadMembers(); }
    catch (err) { say(msg, err.message); } finally { done(); }
  });
  async function loadMembers() {
    const body = $('#member-rows');
    try {
      const status = $('#member-status').value;
      const { members, reviews = [], betaCount = 0, betaLimit = 10 } = await api(`/api/crm/members${status ? `?status=${status}` : ''}`);
      $('#beta-count').textContent = `⭐ Premium Beta: ${betaCount} / ${betaLimit} seats used`;
      const pending = members.filter(m => m.status === 'pending').length;
      if (!status) $('#pending-badge').textContent = pending + reviews.length ? `(${pending + reviews.length})` : '';
      renderReviews(reviews);
      body.replaceChildren();
      if (!members.length) body.append(el('tr', {}, el('td', { colSpan: 5, className: 'empty', textContent: status === 'beta' ? 'No beta testers yet. Use ⭐ Add to beta on an approved member.' : status === 'new' ? 'No new requests in the last 7 days.' : 'No member requests yet.' })));
      for (const m of members) {
        const actions = el('td');
        if (canEdit()) {
          const act = (action, label, cls) => {
            const b = el('button', { className: `btn small ${cls}`, textContent: label });
            b.addEventListener('click', async () => {
              const note = action === 'approve' ? '' : prompt(`Optional note for ${action === 'reject' ? 'rejecting' : 'revoking'} ${m.name}:`, '');
              if (note === null) return;
              if (action !== 'approve' && !confirm(`${label} ${m.name}? ${action === 'revoke' ? 'They will be signed out immediately.' : ''}`)) return;
              try { await api(`/api/crm/members/${m.id}`, { method: 'POST', body: { action, note } }); loadMembers(); } catch (err) { alert(err.message); }
            });
            return b;
          };
          if (m.status !== 'approved') actions.append(act('approve', 'Approve', 'ok'), ' ');
          if (m.status === 'pending') actions.append(act('reject', 'Reject', 'danger'));
          if (m.status === 'approved') actions.append(act('revoke', 'Revoke', 'danger'));
        }
        if (isOwner() && m.status === 'approved') {
          const b = el('button', { className: `btn small ${m.beta ? 'ghost' : 'ok'}`, textContent: m.beta ? 'Remove from beta' : '⭐ Add to beta' });
          b.addEventListener('click', async () => {
            if (m.beta && !confirm(`Remove ${m.name} from the Premium Beta?`)) return;
            try { await api(`/api/crm/members/${m.id}/beta`, { method: 'POST', body: { on: !m.beta } }); loadMembers(); } catch (err) { alert(err.message); }
          });
          actions.append(' ', b);
        }
        body.append(el('tr', {},
          el('td', {}, el('b', { textContent: m.name }), el('small', { textContent: m.email }), m.admin_note ? el('small', { textContent: `Note: ${m.admin_note}` }) : null),
          el('td', { textContent: m.vt_uid }),
          el('td', {}, el('span', { className: `pill ${m.status}`, textContent: m.status }), m.beta ? el('span', { className: 'pill beta', textContent: '⭐ beta' }) : null, m.reviewed_by ? el('small', { textContent: `by ${m.reviewed_by}` }) : null),
          el('td', {}, el('small', { textContent: when(m.created_at) })),
          actions));
      }
    } catch (err) { body.replaceChildren(el('tr', {}, el('td', { colSpan: 5 }, el('p', { className: 'msg error', textContent: err.message })))); }
  }

  // Requests that clashed with an existing member (same email or same UID). They can't be approved from
  // here as-is: fix the member record or add them with the right details, then mark the request done.
  function renderReviews(reviews) {
    const box = $('#review-box');
    box.hidden = !reviews.length;
    box.replaceChildren();
    if (!reviews.length) return;
    box.append(el('h3', { textContent: `⚠ ${reviews.length} request${reviews.length > 1 ? 's' : ''} need${reviews.length > 1 ? '' : 's'} a manual check` }),
      el('p', { className: 'dim', textContent: 'The email or UID is already on another member. Check the details, fix or add the member, then mark it done.' }));
    for (const r of reviews) {
      const row = el('div', { className: 'review-row' },
        el('div', {}, el('b', { textContent: r.name }), el('small', { textContent: r.email }), el('small', { textContent: r.notes || '' }), el('small', { textContent: when(r.created_at) })));
      if (canEdit()) {
        const b = el('button', { className: 'btn small ghost', textContent: 'Mark done' });
        b.addEventListener('click', async () => {
          try { await api(`/api/crm/leads/${r.id}`, { method: 'PATCH', body: { status: 'archived', notes: `${r.notes || ''} [Reviewed]` } }); loadMembers(); } catch (err) { alert(err.message); }
        });
        row.append(b);
      }
      box.append(row);
    }
  }

  // ---------- Team ----------
  $('#team-form').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('/api/crm/team', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); say($('#team-msg'), 'Access saved. They can now sign in with a code sent to that email.', 'ok'); loadTeam(); }
    catch (err) { say($('#team-msg'), err.message); }
  });
  async function loadTeam() {
    const body = $('#team-rows');
    try {
      const { owners, managers = [], team } = await api('/api/crm/team');
      const fixed = (who, role) => el('tr', {}, el('td', { textContent: who }), el('td', {}, el('span', { className: `pill ${role === 'owner' ? 'approved' : 'contacted'}`, textContent: role })), el('td', {}, el('small', { textContent: 'Site settings' })), el('td'));
      body.replaceChildren(...owners.map(o => fixed(o, 'owner')), ...managers.map(m => fixed(m, 'manager')));
      for (const t of team) {
        const remove = el('button', { className: 'btn small danger', textContent: 'Remove' });
        remove.addEventListener('click', async () => {
          if (!confirm(`Remove ${t.email}'s access? They'll be signed out.`)) return;
          try { await api(`/api/crm/team?email=${encodeURIComponent(t.email)}`, { method: 'DELETE' }); loadTeam(); } catch (err) { alert(err.message); }
        });
        body.append(el('tr', {}, el('td', { textContent: t.email }), el('td', {}, el('span', { className: 'pill', textContent: t.role })), el('td', {}, el('small', { textContent: `${when(t.created_at)} by ${t.added_by}` })), el('td', {}, remove)));
      }
    } catch (err) { body.replaceChildren(el('tr', {}, el('td', { colSpan: 4 }, el('p', { className: 'msg error', textContent: err.message })))); }
  }

  async function boot() {
    try {
      ({ user } = await api('/api/crm/me'));
      $('#login-view').hidden = true; $('#app-view').hidden = false; $('#logout').hidden = false;
      $('#who').textContent = `${user.email} · ${user.role}`;
      $('#team-tab').hidden = !isOwner();
      $('#export').hidden = !isOwner();
      $('#add-member-toggle').hidden = !canEdit();
      showTab('leads');
      api('/api/crm/members?status=pending').then(r => { const n = r.members.length + (r.reviews || []).length; $('#pending-badge').textContent = n ? `(${n})` : ''; }).catch(() => {});
    } catch { showLogin(); }
  }
  boot();
})();
