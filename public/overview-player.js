(() => {
  const dialog = document.querySelector('#lead-dialog');
  const frame = document.querySelector('#lead-video-frame');
  const button = document.querySelector('#lead-play-video');
  const status = document.querySelector('#lead-video-status');
  let apiPromise = null;
  let player = null;
  let ready = false;
  let starting = false;
  let halfwayShown = false;

  function youtubeAPI() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('YouTube did not load.')), 15000);
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        clearTimeout(timer);
        try { if (typeof previous === 'function') previous(); }
        finally { resolve(window.YT); }
      };
      let script = document.querySelector('script[data-sky-youtube-api]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.dataset.skyYoutubeApi = '1';
        script.async = true;
        script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('YouTube could not be loaded.')); };
        document.head.append(script);
      }
    }).catch(error => { apiPromise = null; throw error; });
    return apiPromise;
  }

  async function play() {
    if (ready) { player.playVideo(); return; }
    if (starting) return;
    starting = true;
    button.disabled = true;
    status.textContent = 'Loading the Sky Team overview…';
    try {
      const YT = await youtubeAPI();
      const target = document.createElement('div');
      target.id = 'lead-youtube-player';
      frame.replaceChildren(target);
      player = new YT.Player(target, {
        host: 'https://www.youtube-nocookie.com',
        videoId: 'v_DsF1eeckA', width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, origin: location.origin },
        events: {
          onReady(event) {
            ready = true; starting = false;
            const iframe = event.target.getIframe();
            iframe.title = 'Sky Team Trading Hub community overview';
            iframe.referrerPolicy = 'strict-origin-when-cross-origin';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            iframe.allowFullscreen = true;
            status.textContent = 'Use the video controls for sound, captions and playback.';
            if (dialog.open) event.target.playVideo();
          },
          onAutoplayBlocked() { status.textContent = 'Press play in the video to begin with sound.'; },
          onError() { status.textContent = 'This player is unavailable here. You can use Watch on YouTube below.'; },
        },
      });
    } catch {
      starting = false; button.disabled = false;
      status.textContent = 'YouTube could not load here. Try again or use Watch on YouTube below.';
    }
  }
  function pause() { if (ready) { try { player.pauseVideo(); } catch {} } }
  button.addEventListener('click', () => void play());
  dialog.addEventListener('close', pause);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pause(); });
  setInterval(() => {
    if (!ready || halfwayShown || !dialog.open) return;
    try {
      const duration = player.getDuration();
      if (duration > 0 && player.getCurrentTime() >= duration / 2) {
        halfwayShown = true;
        // This invitation sits beside the player and never pauses or blocks playback.
        document.querySelector('#lead-halfway-note').hidden = false;
        document.dispatchEvent(new CustomEvent('sky:overview-halfway'));
      }
    } catch { /* Native YouTube controls and the direct link remain available. */ }
  }, 750);
  window.SkyOverview = { play, pause };
})();
