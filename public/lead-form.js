(() => {
  const dialog = document.querySelector('#lead-dialog');
  const entry = document.querySelector('#community-entry');
  const landing = document.querySelector('#landing-content');
  const videoView = document.querySelector('#lead-video-view');
  const formView = document.querySelector('#lead-form-view');
  const form = document.querySelector('#lead-form');
  const error = document.querySelector('#lead-form-error');
  const submit = document.querySelector('#lead-submit');
  const continueButton = document.querySelector('#lead-register-continue');
  const submitLabel = submit.innerHTML;
  const apiOrigin = document.documentElement.dataset.leadApiOrigin || '';
  const apiCredentials = apiOrigin ? 'omit' : 'same-origin';
  const day = 24 * 60 * 60 * 1000;
  const submittedKey = 'sky-lead-submitted-until';
  let submitted = remembered(submittedKey);
  let tokenPromise = null;
  let requestId = newRequestId();
  let source = 'landing:welcome';

  function newRequestId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function remembered(key) {
    for (const storage of ['localStorage', 'sessionStorage']) {
      try {
        const until = Number(window[storage].getItem(key));
        if (Number.isFinite(until) && until > Date.now()) return true;
        window[storage].removeItem(key);
      } catch { /* Registration still works without browser storage. */ }
    }
    return false;
  }
  function remember() {
    const until = String(Date.now() + 30 * day);
    for (const storage of ['localStorage', 'sessionStorage']) {
      try { window[storage].setItem(submittedKey, until); } catch { /* Keep this visit unlocked in memory. */ }
    }
  }
  // Preserve successful enquiries made before the video-first welcome flow.
  try {
    if (!submitted && sessionStorage.getItem('sky-lead-submitted') === '1') {
      submitted = true; remember(); sessionStorage.removeItem('sky-lead-submitted');
    }
  } catch { /* No contact details are stored in the browser. */ }
  function alreadySubmitted() {
    submitted = submitted || remembered(submittedKey);
    return submitted;
  }
  function revealLanding(announce = false) {
    entry.hidden = true;
    landing.hidden = false;
    landing.inert = false;
    document.querySelector('#skip-content').href = '#main';
    document.querySelector('#registration-confirmation').hidden = !announce;
  }
  function setVideoButton() {
    const registered = alreadySubmitted();
    document.querySelector('#lead-access-status').textContent = registered ? 'Your registration is saved' : 'Registration required to explore';
    continueButton.innerHTML = `${registered ? 'Continue browsing' : 'Register to continue'} <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg>`;
    document.querySelector('#lead-register-note').textContent = registered
      ? 'Your registration is remembered in this browser. Explore whenever you’re ready.'
      : 'Name, email, phone and location · Continue to the website after your details are saved.';
  }
  function openVideo(origin) {
    source = origin;
    if (alreadySubmitted()) revealLanding();
    videoView.hidden = false;
    formView.hidden = true;
    dialog.dataset.step = 'video';
    dialog.setAttribute('aria-labelledby', 'lead-title');
    dialog.setAttribute('aria-describedby', 'lead-intro');
    setVideoButton();
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    document.querySelector('#lead-title').focus({ preventScroll: true });
    void window.SkyOverview.load();
  }
  async function getToken() {
    const response = await fetch(`${apiOrigin}/api/leads/token`, { cache: 'no-store', credentials: apiCredentials });
    const value = await response.json();
    if (!response.ok || !value.token) throw new Error(value.error || 'Please try again or message Sky Team on Facebook.');
    return value.token;
  }
  function openRegistration(origin) {
    if (alreadySubmitted()) { revealLanding(); if (dialog.open) dialog.close(); return; }
    source = origin;
    // Keep the same visible player mounted so registration does not interrupt it.
    videoView.hidden = false;
    formView.hidden = false;
    dialog.dataset.step = 'register';
    dialog.setAttribute('aria-labelledby', 'lead-form-title');
    dialog.setAttribute('aria-describedby', 'lead-form-intro');
    error.textContent = '';
    tokenPromise = getToken();
    tokenPromise.catch(() => {});
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    document.querySelector('#lead-form-title').scrollIntoView({ block: 'start' });
    document.querySelector('#lead-form-title').focus({ preventScroll: true });
  }
  document.querySelectorAll('[data-open-overview], #play-video').forEach(control => control.addEventListener('click', event => {
    event.preventDefault(); openVideo('landing:video');
  }));
  document.querySelectorAll('[data-open-registration]').forEach(control => control.addEventListener('click', () => openRegistration('landing:welcome-registration')));
  document.querySelectorAll('[data-open-lead]').forEach(control => control.addEventListener('click', event => {
    if (alreadySubmitted()) return;
    event.preventDefault(); openRegistration('landing:cta');
  }));
  continueButton.addEventListener('click', () => openRegistration('landing:video-registration'));
  document.querySelector('#lead-back-video').addEventListener('click', () => openVideo('landing:video'));
  // Escape cannot dismiss registration. The backdrop has no dismissal handler.
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (alreadySubmitted()) dialog.close();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled || !form.reportValidity()) return;
    submit.disabled = true;
    submit.textContent = 'Saving your registration…';
    error.textContent = '';
    try {
      const token = await (tokenPromise || getToken());
      const values = new FormData(form);
      const params = new URLSearchParams(location.search);
      const campaign = ['utm_source','utm_medium','utm_campaign'].map(key => params.get(key)).filter(Boolean).join(' / ');
      const response = await fetch(`${apiOrigin}/api/leads`, {
        method: 'POST', credentials: apiCredentials,
        headers: { 'content-type': 'application/json', 'x-sky-lead-token': token },
        body: JSON.stringify({ requestId, name: values.get('name'), email: values.get('email'), phone: values.get('phone'), country: values.get('country'), city: values.get('city'), consent: values.get('consent') === 'on', website: values.get('website'), source: campaign ? `${source} / ${campaign}` : source })
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error(result.error || 'We could not save your registration. Please try again.');
      submitted = true;
      remember();
      form.reset(); requestId = newRequestId(); tokenPromise = null;
      revealLanding(true);
      if (dialog.open) dialog.close();
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.querySelector('#main').focus({ preventScroll: true });
    } catch (problem) {
      tokenPromise = null;
      error.textContent = problem.message || 'Please try again or message Sky Team on Facebook.';
      if (dialog.open) error.scrollIntoView({ block: 'nearest' });
    } finally {
      submit.disabled = false;
      submit.innerHTML = submitLabel;
    }
  });
  // The welcome screen is a browser flow, not authentication or a content-security boundary.
  if (alreadySubmitted()) revealLanding();
  else openVideo('landing:welcome');
})();
