(() => {
  const dialog = document.querySelector('#lead-dialog');
  const form = document.querySelector('#lead-form');
  const error = document.querySelector('#lead-form-error');
  const submit = document.querySelector('#lead-submit');
  const formView = document.querySelector('#lead-form-view');
  const successView = document.querySelector('#lead-success-view');
  function newRequestId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  let requestId = newRequestId();
  let tokenPromise = null;
  let source = 'landing-page';
  const day = 24 * 60 * 60 * 1000;
  const submittedKey = 'sky-lead-submitted-until';
  const dismissedKey = 'sky-lead-dismissed-until';
  let submitted = remembered(submittedKey);
  let dismissed = remembered(dismissedKey);
  let reminderDue = false;
  function remembered(key) {
    for (const storage of ['localStorage', 'sessionStorage']) {
      try {
        const until = Number(window[storage].getItem(key));
        if (Number.isFinite(until) && until > Date.now()) return true;
        window[storage].removeItem(key);
      } catch { /* Browsing and enquiries still work when storage is disabled. */ }
    }
    return false;
  }
  function remember(key, duration) {
    const until = String(Date.now() + duration);
    for (const storage of ['localStorage', 'sessionStorage']) {
      try { window[storage].setItem(key, until); } catch { /* Use in-memory preferences for this visit. */ }
    }
  }
  // Carry a successful enquiry from the previous session-only implementation forward.
  try {
    if (!submitted && sessionStorage.getItem('sky-lead-submitted') === '1') {
      submitted = true; remember(submittedKey, 30 * day);
      sessionStorage.removeItem('sky-lead-submitted');
    }
  } catch { /* No stored contact details are needed to use this page. */ }
  function alreadySubmitted() {
    submitted = submitted || remembered(submittedKey);
    return submitted;
  }
  async function getToken() {
    const response = await fetch('/api/leads/token', { cache: 'no-store', credentials: 'same-origin' });
    const value = await response.json();
    if (!response.ok || !value.token) throw new Error(value.error || 'Please try again or message Sky Team on Facebook.');
    return value.token;
  }
  function openLead(origin) {
    if (dialog.open) return;
    source = origin;
    error.textContent = '';
    if (!alreadySubmitted()) { tokenPromise = getToken(); tokenPromise.catch(() => {}); }
    dialog.showModal();
    if (origin === 'landing:auto' || origin === 'landing:video') document.querySelector('#lead-title').focus({ preventScroll: true });
    else if (matchMedia('(min-width: 721px)').matches) form.elements.name.focus();
  }
  document.querySelectorAll('[data-open-overview], #play-video').forEach(control => control.addEventListener('click', event => {
    event.preventDefault(); openLead('landing:video'); void window.SkyOverview.play();
  }));
  document.querySelector('#lead-show-enquiry').addEventListener('click', () => {
    if (alreadySubmitted()) document.querySelector('#lead-next-step').focus();
    else { document.querySelector('#lead-form-title').scrollIntoView({ block: 'start', behavior: 'smooth' }); form.elements.name.focus({ preventScroll: true }); }
  });
  document.addEventListener('sky:overview-halfway', () => {
    if (!alreadySubmitted()) return;
    const note = document.querySelector('#lead-halfway-note');
    note.querySelector('h3').textContent = 'Your next steps are ready.';
    note.querySelector('p').textContent = 'Your enquiry is saved. Keep watching, or take a look at the community access steps.';
    document.querySelector('#lead-show-enquiry').textContent = 'View your next steps →';
  });
  document.querySelectorAll('[data-open-lead]').forEach(button => button.addEventListener('click', event => {
    if (alreadySubmitted()) return;
    event.preventDefault();
    openLead('landing:cta');
  }));
  function dismissLead() {
    if (!submitted) { dismissed = true; remember(dismissedKey, day); }
    dialog.close();
  }
  document.querySelectorAll('[data-dismiss-lead]').forEach(control => control.addEventListener('click', dismissLead));
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismissLead(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dismissLead();
  });
  document.querySelectorAll('[data-lead-continue]').forEach(link => link.addEventListener('click', () => { if (submitted) dialog.close(); }));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled || !form.reportValidity()) return;
    submit.disabled = true;
    submit.textContent = 'Saving your enquiry…';
    error.textContent = '';
    try {
      const token = await (tokenPromise || getToken());
      const values = new FormData(form);
      const params = new URLSearchParams(location.search);
      const campaign = ['utm_source','utm_medium','utm_campaign'].map(key => params.get(key)).filter(Boolean).join(' / ');
      const response = await fetch('/api/leads', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-sky-lead-token': token },
        body: JSON.stringify({ requestId, name: values.get('name'), email: values.get('email'), phone: values.get('phone'), country: values.get('country'), city: values.get('city'), consent: values.get('consent') === 'on', website: values.get('website'), source: campaign ? `${source} / ${campaign}` : source })
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || 'We could not save your enquiry. Please try again.');
      submitted = true;
      remember(submittedKey, 30 * day);
      document.querySelector('#lead-halfway-note').hidden = true;
      form.reset(); requestId = newRequestId(); tokenPromise = null;
      formView.hidden = true; successView.hidden = false;
      document.querySelector('#lead-next-step').focus();
    } catch (problem) {
      tokenPromise = null;
      error.textContent = problem.message || 'Please try again or message Sky Team on Facebook.';
      error.scrollIntoView({ block: 'nearest' });
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Help me get started <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg>';
    }
  });
  function showTimedReminder() {
    dismissed = dismissed || remembered(dismissedKey);
    if (reminderDue && !alreadySubmitted() && !dismissed && document.visibilityState === 'visible' && !document.querySelector('dialog[open], .reel-frame iframe, #video-frame iframe')) openLead('landing:auto');
  }
  setTimeout(() => { reminderDue = true; showTimedReminder(); }, 10000);
  document.addEventListener('visibilitychange', showTimedReminder);
  document.querySelectorAll('.policy-dialog').forEach(policy => policy.addEventListener('close', showTimedReminder));
  if (submitted) { formView.hidden = true; successView.hidden = false; }
})();
