(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const listEl = $('#assigned-area');
  const nameEl = $('#user-name');

  async function init() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const email = (user.email || user.phone || '').trim().toLowerCase();
    if (nameEl) nameEl.textContent = user.name || user.email || 'User';

    if (!email) {
      listEl.innerHTML = `<p>Please log in again.</p>`;
      return;
    }

    try {
      const res = await fetch(`/api/assigned?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (!data.ok || !data.data?.length) {
        listEl.innerHTML = `<p>No courses assigned to you.</p>`;
        return;
      }

      const cards = data.data.map(c => {
        const thumb = c.thumbnailUrl || '/img/default-thumb.jpg';
        const allowDl = c.download?.toLowerCase() === 'yes';
        const openUrl = `/player.html?title=${encodeURIComponent(c.title)}&category=${encodeURIComponent(c.mainCategory)}&url=${encodeURIComponent(c.videoLink || '')}&dl=${allowDl ? 1 : 0}`;
        return `
          <article class="course-card">
            <img src="${thumb}" class="course-thumb" alt="">
            <div class="course-meta">
              <div class="course-kicker">${c.mainCategory} ${c.subcategory ? ' - ' + c.subcategory : ''}</div>
              <h3 class="course-title">${c.title}</h3>
              <p class="course-desc">${c.description || ''}</p>
              <div class="course-actions">
                <a href="${openUrl}" class="btn btn--primary">Open</a>
                <span class="course-type">video ${allowDl ? ' - Download: Yes' : ''}</span>
              </div>
            </div>
          </article>`;
      }).join('');

      listEl.innerHTML = cards;
    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<p>Failed to load assigned courses.</p>`;
    }
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
