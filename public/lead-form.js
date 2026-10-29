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
  let submitted = false;
  function preference(key, value) {
    try { if (value !== undefined) sessionStorage.setItem(key, value); return sessionStorage.getItem(key); }
    catch { return null; }
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
    if (!submitted) { tokenPromise = getToken(); tokenPromise.catch(() => {}); }
    dialog.showModal();
    preference('sky-lead-seen', '1');
    if (origin !== 'landing:auto' && matchMedia('(min-width: 721px)').matches && !submitted) form.elements.name.focus();
  }
  document.querySelectorAll('[data-open-lead]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    openLead('landing:cta');
  }));
  document.querySelector('#lead-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  document.querySelector('#lead-next-step').addEventListener('click', () => dialog.close());
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
      preference('sky-lead-submitted', '1');
      form.reset(); requestId = newRequestId(); tokenPromise = null;
      formView.hidden = true; successView.hidden = false;
      dialog.removeAttribute('aria-labelledby');
      dialog.setAttribute('aria-label', 'Enquiry saved — your Sky Team next steps');
      document.querySelector('#lead-next-step').focus();
    } catch (problem) {
      error.textContent = problem.message || 'Please try again or message Sky Team on Facebook.';
      error.scrollIntoView({ block: 'nearest' });
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Get my next steps <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg>';
    }
  });
  setTimeout(() => {
    if (!preference('sky-lead-seen') && !preference('sky-lead-submitted') && document.visibilityState === 'visible' && !document.querySelector('dialog[open], .reel-frame iframe, #video-frame iframe')) openLead('landing:auto');
  }, 18000);
})();
