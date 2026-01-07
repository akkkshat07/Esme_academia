// player.js — download control + full/partial completion tracking
(function () {
  // Parse query params
  const q = new URLSearchParams(location.search);
  const title = q.get('title') || 'Untitled';
  const category = q.get('category') || '';
  const url = q.get('url');
  const allowDl = q.get('dl') === '1';
  const type = (q.get('type') || 'video').toLowerCase();

  // UI elements
  const titleEl = document.getElementById('p-title') || document.getElementById('title');
  const catEl   = document.getElementById('p-category') || document.getElementById('category');
  const videoEl = document.getElementById('video') || document.getElementById('vid');
  const dlBtn   = document.getElementById('btn-download');
  const progressPill = document.getElementById('progressPill');

  // Fill UI
  if (titleEl) titleEl.textContent = title;
  if (catEl) catEl.textContent = category || 'Course';
  if (!url) { alert('Missing video URL'); return; }
  videoEl.src = url;

  // Handle download permission
  if (!allowDl && dlBtn) {
    videoEl.setAttribute('controlsList', 'nodownload');
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    dlBtn.style.display = 'none';
  } else if (allowDl && dlBtn) {
    dlBtn.href = url;
    dlBtn.download = title.replace(/[^\w\-]+/g, '_') + '.mp4';
  }

  // Identify user
  let user = null;
  try { user = JSON.parse(localStorage.getItem('user') || '{}'); } catch {}
  const email = user?.email || user?.name || '';

  // Tracking state
  const API = '/api/track';
  const state = {
    duration: 0,
    completedSent: false,
    lastPos: 0
  };

  function percent(p, d) {
    if (!d) return 0;
    return Math.min(100, Math.round((p / d) * 100));
  }

  async function send(status) {
    if (!email) return;
    const payload = {
      email,
      title,
      category,
      watchedSeconds: Math.floor(videoEl.currentTime || 0),
      status, // "Partial" or "Completed"
      last_position_s: Math.floor(videoEl.currentTime || 0),
      percent_watched: percent(videoEl.currentTime || 0, state.duration || videoEl.duration || 0),
      last_seen_at: new Date().toISOString(),
    };
    try {
      await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      if (progressPill) progressPill.textContent = `${payload.percent_watched}% watched`;
      console.log('Tracking:', status, payload);
    } catch (e) {
      console.warn('track failed', e);
    }
  }

  // ---- Events ----
  videoEl.addEventListener('loadedmetadata', () => {
    state.duration = videoEl.duration || 0;
  });

  // Update progress pill (visual only)
  videoEl.addEventListener('timeupdate', () => {
    const pct = percent(videoEl.currentTime || 0, state.duration || videoEl.duration || 0);
    if (progressPill) progressPill.textContent = `${pct}% watched`;
    state.lastPos = videoEl.currentTime || 0;
  });

  // Detect skip/seek ? partial completion
  videoEl.addEventListener('seeking', () => {
    if (!state.completedSent) send('Partial');
  });

  // Video ends naturally ? full completion
  videoEl.addEventListener('ended', () => {
    if (!state.completedSent) {
      state.completedSent = true;
      send('Completed');
    }
  });

  // Leaving early ? partial completion
  window.addEventListener('beforeunload', () => {
    if (!state.completedSent) send('Partial');
  });
})();
