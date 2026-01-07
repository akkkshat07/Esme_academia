// dashboard.js � LMS dashboard with tabs & mobile menu
(() => {
  'use strict';

  // === DOM helpers ===
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const nameEl      = $('#user-name');
  const searchEl    = $('#search-input');
  const chipsEl     = $('#category-chips');
  const subBarEl    = $('#subcategory-bar');
  const allAreaEl   = $('#courses-area');
  const assignedEl  = $('#assigned-area');
  const quizzesEl   = $('#quizzes-area');
  const assignedSum = $('#assigned-summary');
  const leaderboardEl = $('#leaderboard-area');
  const feedbackForm = $('#feedback-form');
  const feedbackText = $('#feedback-text');
  const feedbackStatus = $('#feedback-status');
  const languageFilter = $('#language-filter');

  const sidebar    = $('#sidebar');
  const backdrop   = $('#sidebar-backdrop');
  const menuToggle = $('#menu-toggle');

  const tabAll        = $('#tab-all');
  const tabAssigned   = $('#tab-assigned');
  const tabQuizzes    = $('#tab-quizzes');
  const tabLeader     = $('#tab-leaderboard');
  const tabFeedback   = $('#tab-feedback');
  const logoutBtn     = $('#logout-btn');

  // === State ===
  let user = null;
  let userKey = ''; // email or phone
  let allCourses = [];
  let assignedCourses = [];
  let quizzes = [];
  let assignedQuizzes = [];
  let currentTab = 'all';
  let availableLanguages = [];
  let selectedLanguage = ''; // '' means all languages

  // === Utility ===
  function ensureUser() {
    try {
      user = JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      user = {};
    }
    if (!user || (!user.email && !user.phone)) {
      window.location.href = '/';
      return;
    }
    userKey = String(user.email || user.phone || '').toLowerCase();
    if (nameEl) nameEl.textContent = user.name || user.email || 'User';
  }

  function buildPlayerUrl(course) {
    const catLabel = course.mainCategory
      ? (course.subcategory ? `${course.mainCategory} - ${course.subcategory}` : course.mainCategory)
      : '';
    const params = new URLSearchParams({
      title: course.title || '',
      category: catLabel || '',
      url: course.url || '',
      type: course.type || 'video',
      dl: course.downloadAllowed ? '1' : '0'
    });
    return `/player.html?${params.toString()}`;
  }

  function normalizeCourses(raw) {
    return (raw || []).map(r => ({
      mainCategory: r.mainCategory || '',
      subcategory:  r.subcategory  || '',
      topic:        r.topic        || '',
      title:        r.title        || '',
      description:  r.description  || '',
      url:          r.url          || '',
      duration_seconds: Number(r.duration_seconds || 0),
      type: (r.type || 'video').toLowerCase(),
      thumbnailUrl: r.thumbnailUrl || '',
      downloadAllowed: !!r.downloadAllowed,
      language: r.language || 'English',
      due_date: r.due_date || null,
      required_percent: Number(r.required_percent || 0) || 0,
      assigned: !!r.assigned
    }));
  }

  // === Render helpers ===
  function renderCategories() {
    const cats = [...new Set(allCourses.map(c => c.mainCategory).filter(Boolean))].sort();
    chipsEl.innerHTML = cats.map(c =>
      `<button class="chip" data-cat="${encodeURIComponent(c)}">${c}</button>`
    ).join('');
  }

  function renderSubcategories(cat) {
    const subs = [...new Set(
      allCourses
        .filter(c => !cat || c.mainCategory === cat)
        .map(c => c.subcategory)
        .filter(Boolean)
    )].sort();
    subBarEl.innerHTML = subs.map(s =>
      `<button class="chip chip--sub" data-sub="${encodeURIComponent(s)}">${s}</button>`
    ).join('');
  }

  function percent(p, d) {
    if (!d) return '';
    const val = Math.round((p / d) * 100);
    if (!Number.isFinite(val) || val <= 0) return '';
    return `${val}%`;
  }

  function courseCard(course, opts = {}) {
    const thumb = course.thumbnailUrl || 'img/placeholder.jpg';
    const dur   = course.duration_seconds ? ` - ${Math.round(course.duration_seconds / 60)} min` : '';
    const catLabel = course.mainCategory
      ? (course.subcategory ? `${course.mainCategory} - ${course.subcategory}` : course.mainCategory)
      : '';
    const href  = buildPlayerUrl(course);
    const downloadLabel = course.downloadAllowed ? 'Download: Yes' : 'Download: No';
    const showDue = !!course.due_date || !!opts.showDue;
    const dueText = course.due_date ? `Due: ${course.due_date}` : '';
    const assignedBadge = opts.assignedBadge ? '<span class="badge badge--assigned">Assigned</span>' : '';

    return `
      <article class="course-card">
        <img class="course-thumb" src="${thumb}" alt="">
        <div class="course-meta">
          <div class="course-kicker">
            ${catLabel || '&nbsp;'}
            ${assignedBadge}
          </div>
          <h3 class="course-title">${course.title || 'Untitled'}</h3>
          <p class="course-desc">${course.description || ''}</p>
          ${showDue && dueText ? `<div class="course-due">${dueText}</div>` : ''}
          <div class="course-actions">
            <a class="btn btn--primary" href="${href}">Open</a>
            <span class="course-type">${course.type || 'video'}${dur}</span>
            <span class="course-type">Download: ${course.downloadAllowed ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </article>
    `;
  }

  function filterByLanguage(courses) {
    if (!selectedLanguage) return courses; // empty string = all languages
    return courses.filter(c => (c.language || 'English') === selectedLanguage);
  }

  function renderAllCourses() {
    const activeCat = decodeURIComponent($('.chip.active')?.dataset.cat || '');
    const activeSub = decodeURIComponent($('.chip--sub.active')?.dataset.sub || '');
    const q = (searchEl.value || '').toLowerCase().trim();

    let list = allCourses.filter(c => {
      if (activeCat && c.mainCategory !== activeCat) return false;
      if (activeSub && c.subcategory !== activeSub) return false;
      if (!q) return true;
      return (
        (c.title || '').toLowerCase().includes(q) ||
        (c.topic || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
      );
    });

    // Apply language filter
    list = filterByLanguage(list);

    allAreaEl.innerHTML = list.length
      ? list.map(c => courseCard(c)).join('')
      : `<p style="opacity:.7">No courses match your search.</p>`;
  }

  function renderAssignedCourses() {
    let filteredCourses = filterByLanguage(assignedCourses);
    
    if (!filteredCourses.length) {
      assignedEl.innerHTML = `<p style="opacity:.7">No assigned courses match your language filter.</p>`;
      assignedSum.textContent = '';
      return;
    }

    // sort by due date if present
    const sorted = [...filteredCourses].sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });

    assignedEl.innerHTML = sorted.map(c => courseCard(c, {
      assignedBadge: true,
      showDue: true
    })).join('');

    const withDue = sorted.filter(c => c.due_date);
    if (withDue.length) {
      const next = withDue[0].due_date;
      assignedSum.textContent = `You have ${sorted.length} assigned course(s). Next due date: ${next}.`;
    } else {
      assignedSum.textContent = `You have ${sorted.length} assigned course(s).`;
    }
  }

  function quizCard(q) {
    const title = q.quiz_title || 'Quiz';
    const cat   = q.category || '';
    const due   = q.due_date || '';
    const status = q.status || '';
    const url   = q.form_url || '#';

    return `
      <article class="course-card">
        <div class="course-thumb course-thumb--placeholder"></div>
        <div class="course-meta">
          <div class="course-kicker">${cat || '&nbsp;'}</div>
          <h3 class="course-title">${title}</h3>
          ${due ? `<div class="course-due">Due: ${due}</div>` : ''}
          ${status ? `<div style="font-size:13px;color:#4b5563;margin-top:4px;">Status: ${status}</div>` : ''}
          <div class="course-actions">
            <a class="btn btn--primary" href="${url}" target="_blank" rel="noopener">Open quiz</a>
          </div>
        </div>
      </article>
    `;
  }

  function renderQuizzes() {
    const list = assignedQuizzes.length ? assignedQuizzes : quizzes;
    if (!list.length) {
      quizzesEl.innerHTML = `<p style="opacity:.7">No quizzes to show.</p>`;
      return;
    }
    quizzesEl.innerHTML = list.map(quizCard).join('');
  }

  function renderLeaderboard(rows) {
    if (!rows || !rows.length) {
      leaderboardEl.innerHTML = `<p style="opacity:.7">No completed training data yet for the leaderboard.</p>`;
      return;
    }

    const rowsHtml = rows.map(r => {
      let medalIcon = '';
      if (r.medal === 'gold') medalIcon = '🥇';
      else if (r.medal === 'silver') medalIcon = '🥈';
      else if (r.medal === 'bronze') medalIcon = '🥉';

      return `
        <tr>
          <td style="padding:.5rem;border-bottom:1px solid #e5eaf0;">${r.rank}</td>
          <td style="padding:.5rem;border-bottom:1px solid #e5eaf0;">${medalIcon ? `${medalIcon} ` : ''}${r.name}</td>
          <td style="padding:.5rem;border-bottom:1px solid #e5eaf0;">${r.hours}</td>
          <td style="padding:.5rem;border-bottom:1px solid #e5eaf0;">${r.courseCount}</td>
        </tr>
      `;
    }).join('');

    leaderboardEl.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px;">
          <thead>
            <tr style="background:#e5f3ff;">
              <th style="text-align:left;padding:.5rem;border-bottom:1px solid #d1e3f2;">Rank</th>
              <th style="text-align:left;padding:.5rem;border-bottom:1px solid #d1e3f2;">Learner</th>
              <th style="text-align:left;padding:.5rem;border-bottom:1px solid #d1e3f2;">Hours completed</th>
              <th style="text-align:left;padding:.5rem;border-bottom:1px solid #d1e3f2;">Courses completed</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  // === Tab switching ===
  function setActiveTab(tab) {
    currentTab = tab;

    // sidebar active
    [tabAll, tabAssigned, tabQuizzes, tabLeader, tabFeedback].forEach(el => el.classList.remove('active'));
    if (tab === 'all') tabAll.classList.add('active');
    if (tab === 'assigned') tabAssigned.classList.add('active');
    if (tab === 'quizzes') tabQuizzes.classList.add('active');
    if (tab === 'leaderboard') tabLeader.classList.add('active');
    if (tab === 'feedback') tabFeedback.classList.add('active');

    // panels
    $('#panel-all').classList.add('hidden');
    $('#panel-assigned').classList.add('hidden');
    $('#panel-quizzes').classList.add('hidden');
    $('#panel-leaderboard').classList.add('hidden');
    $('#panel-feedback').classList.add('hidden');

    if (tab === 'all') $('#panel-all').classList.remove('hidden');
    if (tab === 'assigned') $('#panel-assigned').classList.remove('hidden');
    if (tab === 'quizzes') $('#panel-quizzes').classList.remove('hidden');
    if (tab === 'leaderboard') $('#panel-leaderboard').classList.remove('hidden');
    if (tab === 'feedback') $('#panel-feedback').classList.remove('hidden');

    // Close sidebar on mobile when switching
    closeSidebar();
  }

  // === Menu (mobile) ===
  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.add('show');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
  }

  function wireEvents() {
    // category chips
    chipsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cat]');
      if (!btn) return;
      $$('.chip').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      const cat = decodeURIComponent(btn.dataset.cat || '');
      renderSubcategories(cat);
      renderAllCourses();
    });

    subBarEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-sub]');
      if (!btn) return;
      $$('.chip--sub').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      renderAllCourses();
    });

    // search
    searchEl.addEventListener('input', () => {
      if (currentTab === 'all') {
        renderAllCourses();
      }
    });

    // language filter
    if (languageFilter) {
      languageFilter.addEventListener('change', (e) => {
        selectedLanguage = e.target.value;
        localStorage.setItem('selectedLanguage', selectedLanguage);
        renderAllCourses();
        renderAssignedCourses();
        renderQuizzes(); // Also filter quizzes if they have language field
      });
    }

    // tabs
    tabAll.addEventListener('click', () => setActiveTab('all'));
    tabAssigned.addEventListener('click', () => setActiveTab('assigned'));
    tabQuizzes.addEventListener('click', () => setActiveTab('quizzes'));
    tabLeader.addEventListener('click', () => setActiveTab('leaderboard'));
    tabFeedback.addEventListener('click', () => setActiveTab('feedback'));

    // logout
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('user');
      window.location.href = '/';
    });

    // mobile menu
    if (menuToggle) {
      menuToggle.addEventListener('click', () => {
        if (sidebar.classList.contains('open')) closeSidebar();
        else openSidebar();
      });
    }
    if (backdrop) {
      backdrop.addEventListener('click', closeSidebar);
    }

    // feedback form
    if (feedbackForm) {
      feedbackForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = (feedbackText.value || '').trim();
        if (!msg) {
          feedbackStatus.textContent = 'Please enter some feedback.';
          feedbackStatus.style.color = '#b91c1c';
          return;
        }
        feedbackStatus.textContent = 'Sending�';
        feedbackStatus.style.color = '#4b5563';
        try {
          const resp = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email || '',
              name: user.name || '',
              message: msg
            })
          });
          const data = await resp.json();
          if (!resp.ok || !data.ok) throw new Error(data.message || 'Failed');
          feedbackStatus.textContent = 'Thank you for your feedback!';
          feedbackStatus.style.color = '#15803d';
          feedbackText.value = '';
        } catch (err) {
          console.error('feedback error', err);
          feedbackStatus.textContent = 'Sorry, something went wrong. Please try again.';
          feedbackStatus.style.color = '#b91c1c';
        }
      });
    }
  }

  // === Data fetch ===
  async function fetchJSON(url) {
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      throw new Error(data.message || `HTTP ${resp.status}`);
    }
    return data.data || [];
  }

  async function populateLanguages() {
    try {
      const languages = await fetchJSON('/api/languages');
      availableLanguages = languages;
      
      if (languageFilter) {
        languageFilter.innerHTML = '<option value="">All Languages</option>';
        languages.forEach(lang => {
          const option = document.createElement('option');
          option.value = lang;
          option.textContent = lang;
          languageFilter.appendChild(option);
        });
        
        // Restore user's previous language preference
        const savedLang = localStorage.getItem('selectedLanguage') || '';
        selectedLanguage = savedLang;
        languageFilter.value = savedLang;
      }
    } catch (err) {
      console.error('Failed to load languages:', err);
    }
  }

  async function loadAll() {
    // Load available languages first
    await populateLanguages();

    try {
      // Courses
      const coursesData = await fetchJSON('/api/courses');
      allCourses = normalizeCourses(coursesData);
      renderCategories();
      renderSubcategories(null);
      renderAllCourses();
    } catch (err) {
      console.error('courses load error', err);
      allAreaEl.innerHTML = `<p style="color:#c00">Failed to load courses.</p>`;
    }

    try {
      // Assigned courses
      const assignedData = await fetchJSON(`/api/assigned?email=${encodeURIComponent(userKey)}`);
      assignedCourses = normalizeCourses(assignedData);
      renderAssignedCourses();
    } catch (err) {
      console.error('assigned load error', err);
      assignedEl.innerHTML = `<p style="color:#c00">Failed to load assigned courses.</p>`;
    }

    try {
      // Quizzes
      const [allQ, assignedQ] = await Promise.all([
        fetchJSON('/api/quizzes'),
        fetchJSON(`/api/assigned-quizzes?email=${encodeURIComponent(userKey)}`)
      ]);
      quizzes = allQ || [];
      assignedQuizzes = assignedQ || [];
      renderQuizzes();
    } catch (err) {
      console.error('quizzes load error', err);
      quizzesEl.innerHTML = `<p style="color:#c00">Failed to load quizzes.</p>`;
    }

    try {
      const leaderboard = await fetchJSON('/api/leaderboard');
      renderLeaderboard(leaderboard);
    } catch (err) {
      console.error('leaderboard load error', err);
      leaderboardEl.innerHTML = `<p style="color:#c00">Failed to load leaderboard.</p>`;
    }
  }

  // === Init ===
  function init() {
    ensureUser();
    wireEvents();
    loadAll().catch(err => console.error(err));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
