const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
function closeMenu() {
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation');
  navigation.classList.remove('open');
}
menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation');
  navigation.classList.toggle('open', !isOpen);
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigation.classList.contains('open')) {
    closeMenu();
    menuButton.focus();
  }
});
document.addEventListener('click', event => {
  if (!event.target.closest('.nav-wrap')) closeMenu();
});
window.matchMedia('(min-width: 721px)').addEventListener('change', event => {
  if (event.matches) closeMenu();
});

document.querySelector('#play-video').addEventListener('click', () => {
  const frame = document.createElement('iframe');
  frame.src = 'https://www.youtube-nocookie.com/embed/v_DsF1eeckA?autoplay=1&rel=0';
  frame.title = 'Sky Team Trading Hub — community overview';
  frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allowFullscreen = true;
  document.querySelector('#video-frame').replaceChildren(frame);
  frame.focus();
});

document.querySelectorAll('[data-dialog]').forEach(button => {
  button.addEventListener('click', () => {
    const dialog = document.getElementById(button.dataset.dialog);
    if (dialog && !dialog.open) dialog.showModal();
  });
});
document.querySelectorAll('.policy-dialog').forEach(dialog => {
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
});
const reelFrames = [...document.querySelectorAll('.reel-frame')];
reelFrames.forEach(container => {
  container.querySelector('.reel-load').addEventListener('click', () => {
    reelFrames.forEach(other => {
      other.querySelector('iframe')?.remove();
      other.classList.remove('is-loaded');
      other.querySelector('.reel-load').hidden = false;
    });
    const width = Math.min(500, Math.max(220, Math.round(container.getBoundingClientRect().width)));
    const height = Math.round(width * 476 / 250);
    const source = new URL('https://www.facebook.com/plugins/video.php');
    source.searchParams.set('href', container.dataset.reel);
    source.searchParams.set('show_text', 'false');
    source.searchParams.set('width', String(width));
    source.searchParams.set('height', String(height));
    const player = document.createElement('iframe');
    player.src = source.href;
    player.title = `Facebook Reel ${container.dataset.reelNumber} — Sky Team Trading Hub`;
    player.width = String(width);
    player.height = String(height);
    player.allow = 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share';
    player.referrerPolicy = 'strict-origin-when-cross-origin';
    player.allowFullscreen = true;
    player.setAttribute('scrolling', 'no');
    container.append(player);
    container.classList.add('is-loaded');
    container.querySelector('.reel-load').hidden = true;
    player.focus();
  });
});

document.querySelector('#year').textContent = new Date().getFullYear();

const copyReferrer = document.querySelector('#copy-referrer');
const referrerCode = document.querySelector('#referrer-code');
referrerCode.addEventListener('click', () => referrerCode.select());
copyReferrer.addEventListener('click', async () => {
  const status = document.querySelector('#copy-status');
  status.textContent = 'Copying code…';
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await Promise.race([
      navigator.clipboard.writeText(referrerCode.value),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Clipboard unavailable')), 1500))
    ]);
    copyReferrer.textContent = 'Copied';
    status.textContent = 'Referrer code copied.';
  } catch {
    referrerCode.focus();
    referrerCode.select();
    status.textContent = 'Code selected. Copy eePfC6mw and paste it into Referrer.';
  }
});
