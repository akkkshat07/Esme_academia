// player.js � download control + full/partial completion tracking
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
    lastPos: 0,
    actualWatchedTime: 0 // New: Track real time spent playing
  };

  function percent(p, d) {
    if (!d) return 0;
    return Math.min(100, Math.round((p / d) * 100));
  }

  async function send(status) {
    if (!email) return;

    // Use actualWatchedTime for percentage to prevent dragging cheat
    const duration = state.duration || videoEl.duration || 1;
    const realPercent = percent(state.actualWatchedTime, duration);

    const payload = {
      email,
      title,
      category,
      watchedSeconds: Math.floor(state.actualWatchedTime),
      status, 
      last_position_s: Math.floor(videoEl.currentTime || 0),
      percent_watched: realPercent,
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

  // Update progress tracking (prevents skip/drag cheating)
  videoEl.addEventListener('timeupdate', () => {
    const currentPos = videoEl.currentTime;
    const delta = currentPos - state.lastPos;

    // Only count time if it's natural forward playback (not a skip/drag)
    if (delta > 0 && delta < 2.5) { 
      state.actualWatchedTime += delta;
    }
    
    const pct = percent(state.actualWatchedTime, state.duration || videoEl.duration || 1);
    if (progressPill) progressPill.textContent = `${pct}% watched`;
    state.lastPos = currentPos;
  });

  // Detect skip/seek ? partial completion
  videoEl.addEventListener('seeking', () => {
    state.lastPos = videoEl.currentTime; // Reset lastPos on seek to stop counting jump
    if (!state.completedSent) send('Partial');
  });

  // Video ends naturally ? full completion
  videoEl.addEventListener('ended', () => {
    if (!state.completedSent) {
      // Backend will still check if it's actually 65%
      send('Completed');
    }
  });

  // Leaving early ? partial completion
  window.addEventListener('beforeunload', () => {
    if (!state.completedSent) send('Partial');
  });


  // Playlist / Sidebar Logic
  const playlistEl = document.getElementById('playlist');
  const playlistCountEl = document.getElementById('playlist-count');
  const playlistSearch = document.getElementById('playlist-search'); 
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  let coursesList = [];
  let currentIndex = -1;
  let searchTerm = '';

  function loadPlaylist() {
      fetch('/api/courses')
          .then(res => res.json())
          .then(data => {
              if (data.ok) {
                  // Filter for videos only
                  let all = (data.data || []).filter(c => (c.type || 'video').toLowerCase() === 'video');
                  coursesList = all;
                  renderPlaylist();
              }
          })
          .catch(err => {
              console.error('Failed to load playlist', err);
              if(playlistEl) playlistEl.innerHTML = '<div class="playlist-empty">Failed to load content</div>';
          });
  }

  function renderPlaylist() {
      // Safety check for UI element (might be null on some pages)
      if (!playlistEl) {
         console.warn('Playlist element not found in DOM');
         return; 
      }
      
      // Find current video index in full list for navigation
      currentIndex = coursesList.findIndex(c => c.title === title || c.url === url);

      // Filter for display
      const filtered = coursesList.filter(c => {
          if (!searchTerm) return true;
          const t = (c.title || '').toLowerCase();
          const cat = (c.mainCategory || '').toLowerCase();
          return t.includes(searchTerm) || cat.includes(searchTerm);
      });

      if (playlistCountEl) playlistCountEl.textContent = `${filtered.length} items`;
      
      if (filtered.length === 0) {
          playlistEl.innerHTML = '<div class="playlist-empty">No matching videos found</div>';
          updateNavButtons(); // ensure buttons are updated even if list is empty
          return;
      }

      console.log(`Rendering playlist with ${filtered.length} items.`);

      const html = filtered.map((c) => {
          // Identify if this item is the currently playing one
          const isCurrent = (c.title === title || c.url === url);

          // Construct URL for this item
          const cCat = c.mainCategory || '';
          const cTitle = c.title || '';
          const cUrl = c.url || '';
          const cDl = c.downloadAllowed ? '1' : '0';
          const href = `player.html?title=${encodeURIComponent(cTitle)}&category=${encodeURIComponent(cCat)}&url=${encodeURIComponent(cUrl)}&dl=${cDl}`;
          
          return `
            <div class="playlist-item ${isCurrent ? 'active' : ''}" onclick="window.location.href='${href}'">
                <img src="${c.thumbnailUrl || 'img/thumb-default.jpg'}" class="pl-thumb" loading="lazy" alt="">
                <div class="pl-info">
                    <div class="pl-title">${c.title}</div>
                    <div class="pl-meta">${c.mainCategory || 'General'}</div>
                </div>
            </div>
          `;
      }).join('');
      
      playlistEl.innerHTML = html;
      
      // Scroll active item into view if no search is active
      if (!searchTerm) {
          setTimeout(() => {
              const activeItem = playlistEl.querySelector('.active');
              if (activeItem) {
                  activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
          }, 500);
      }

      updateNavButtons();
  }

  if (playlistSearch) {
      playlistSearch.addEventListener('input', (e) => {
          searchTerm = (e.target.value || '').trim().toLowerCase();
          renderPlaylist();
      });
  }

  function updateNavButtons() {
      if (!btnPrev || !btnNext) return;
      
      btnPrev.disabled = currentIndex <= 0;
      btnNext.disabled = currentIndex < 0 || currentIndex >= coursesList.length - 1;

      btnPrev.onclick = () => {
          if (currentIndex > 0) {
             const prev = coursesList[currentIndex - 1];
             navigateTo(prev);
          }
      };

      btnNext.onclick = () => {
          if (currentIndex < coursesList.length - 1) {
             const next = coursesList[currentIndex + 1];
             navigateTo(next);
          }
      };
  }

  function navigateTo(c) {
      if (!c) return;
      const cCat = c.mainCategory || '';
      const cTitle = c.title || '';
      const cUrl = c.url || '';
      const cDl = c.downloadAllowed ? '1' : '0';
      window.location.href = `player.html?title=${encodeURIComponent(cTitle)}&category=${encodeURIComponent(cCat)}&url=${encodeURIComponent(cUrl)}&dl=${cDl}`;
  }

  // Initialize Playlist
  loadPlaylist();

  // Keyboard controls
  document.addEventListener('keydown', (e) => {
    if (!videoEl) return;
    // Toggle play/pause on Space
    if (e.code === 'Space' || e.key === ' ') {
      // Only prevent default if focus is NOT on a button/input
      if (document.activeElement.tagName !== 'BUTTON' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault(); 
        videoEl.paused ? videoEl.play() : videoEl.pause();
      }
    }
    // Optional: Arrow keys for seeking
    if (e.code === 'ArrowRight') {
      videoEl.currentTime += 5;
    }
    if (e.code === 'ArrowLeft') {
      videoEl.currentTime -= 5;
    }
  });
})();
