(() => {
  const dialog = document.querySelector('#lead-dialog');
  const view = document.querySelector('#lead-video-view');
  const frame = document.querySelector('#lead-video-frame');
  const button = document.querySelector('#lead-play-video');
  const status = document.querySelector('#lead-video-status');
  const cover = [...frame.childNodes];
  let apiPromise = null;
  let player = null;
  let ready = false;
  let starting = false;
  let playRequested = false;

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
  async function load(autoplay = false) {
    playRequested = playRequested || autoplay;
    if (ready) { if (autoplay && dialog.open && !view.hidden) player.playVideo(); return; }
    if (starting) return;
    starting = true;
    button.disabled = true;
    status.textContent = 'Loading the Sky Team YouTube overview…';
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
            iframe.title = 'Sky Team Trading Hub community overview on YouTube';
            iframe.referrerPolicy = 'strict-origin-when-cross-origin';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            iframe.allowFullscreen = true;
            status.textContent = 'Press play in YouTube. Sound, captions and full playback are available.';
            if (playRequested && dialog.open && !view.hidden) event.target.playVideo();
            playRequested = false;
          },
          onAutoplayBlocked() { status.textContent = 'Press play in the video to begin with sound.'; },
          onError() { status.textContent = 'This player is unavailable here. Use Watch on YouTube below.'; },
        },
      });
    } catch {
      starting = false; playRequested = false; button.disabled = false;
      frame.replaceChildren(...cover);
      status.textContent = 'YouTube could not load here. Try again or use Watch on YouTube below.';
    }
  }
  function pause() {
    playRequested = false;
    if (ready) { try { player.pauseVideo(); } catch {} }
  }
  button.addEventListener('click', () => void load(true));
  dialog.addEventListener('close', pause);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pause(); });
  window.SkyOverview = { load: () => load(), play: () => load(true), pause };
})();
