// dashboard.js � LMS dashboard with tabs & mobile menu
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const nameEl      = $('#user-name');
  const searchEl    = $('#search-input-all');
  const chipsEl     = $('#category-chips');
  const subBarEl    = $('#subcategory-bar');
  const allAreaEl   = $('#all-area');
  const assignedEl  = $('#assigned-area');
  const quizzesEl   = $('#quizzes-area');
  const assignedSum = $('#assigned-summary');
  const leaderboardEl = $('#leaderboard-area');
  const feedbackForm = $('#feedback-form');
  const feedbackText = $('#feedback-text');
  const feedbackStatus = $('#feedback-status');
  const languageFilter = $('#language-filter-all');

  const aiChatForm     = $('#ai-chat-form');
  const aiChatInput    = $('#ai-chat-input');
  const aiChatMessages = $('#ai-chat-messages');
  // AI APIs are proxied via /api/ai/... to avoid NGINX 405 on /ai/
  const AI_API_URL     = '/api/ai/chat';
  const AI_HISTORY_URL  = '/api/ai/history';
  const AI_SESSION_LIST_URL = '/api/ai/sessions';
  const AI_CREATE_SESSION_URL = '/api/ai/session';

  const sidebar    = $('#sidebar');
  const backdrop   = $('#sidebar-backdrop');
  const menuToggle = $('#menu-toggle');

  const tabAll        = $('#tab-all'); // May be null/hidden
  const tabAssigned   = $('#tab-assigned');
  const tabAiMentor   = $('#tab-ai-mentor');
  const tabQuizzes    = $('#tab-quizzes');
  const tabLeader     = $('#tab-leaderboard');
  const tabFeedback   = $('#tab-feedback');
  const logoutBtn     = $('#logout-btn');

  const aiNewChatBtn   = $('#ai-new-chat-btn');
  const aiHistoryList  = $('#ai-history-list');

  let user = null;
  let userKey = ''; // email or phone
  let allCourses = [];
  let assignedCourses = [];
  let quizzes = [];
  let assignedQuizzes = [];
  let currentTab = localStorage.getItem('activeTab');
  // If activeTab is not set, default to 'all'
  if (!currentTab) {
    currentTab = 'all';
  }
  let availableLanguages = [];
  let selectedLanguage = localStorage.getItem('selectedLanguage') || '';
  let currentSessionId = localStorage.getItem('currentSessionId') || '';
  
  // Track the single active main category
  let selectedMainCategory = null;

  function ensureUser() {
    try {
      user = JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      user = {};
    }
    if (!user || (!user.email && !user.phone)) {
      console.warn('No user found in localStorage, redirecting to login');
      window.location.href = '/';
      return;
    }
    userKey = String(user.email || user.phone || '').toLowerCase();
    console.log('User loaded:', userKey, 'name:', user.name);
    if (nameEl) nameEl.textContent = user.name || user.email || user.phone || 'User';
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

  function renderCategories() {
    if (!chipsEl) return;
    
    // If a main category is selected, show only that one (to hide others)
    if (selectedMainCategory) {
       chipsEl.innerHTML = `<button class="chip active" data-cat="${encodeURIComponent(selectedMainCategory)}">${selectedMainCategory}</button>`;
       return;
    }

    // Otherwise show all unique main categories from the data
    const cats = [...new Set(allCourses.map(c => c.mainCategory).filter(Boolean))].sort();
    chipsEl.innerHTML = cats.map(c =>
      `<button class="chip" data-cat="${encodeURIComponent(c)}">${c}</button>`
    ).join('');
  }

  function renderSubcategories(cat) {
    if (!subBarEl) return;
    
    // Fix: If NO Main Category is selected, DO NOT show subcategories
    if (!cat) {
        subBarEl.classList.add('hidden');
        subBarEl.innerHTML = '';
        return;
    }

    // Filter subcategories strictly for the selected Main Category
    const subs = [...new Set(
      allCourses
        .filter(c => c.mainCategory === cat)
        .map(c => c.subcategory)
        .filter(Boolean)
    )].sort();
    
    // If no subs for this category, hide bar
    if (subs.length === 0) {
      subBarEl.classList.add('hidden');
      subBarEl.innerHTML = '';
      return;
    }
    
    // Show sub filters
    subBarEl.classList.remove('hidden');
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
    const thumb = course.thumbnailUrl || 'img/thumb-default.jpg';
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
    if (!allAreaEl) return;
    
    // Check our state variable for the main category
    const activeCat = selectedMainCategory || '';
    // Sub category is still picked from the active chip in the sub-bar (if any)
    const activeSub = decodeURIComponent($('.chip--sub.active')?.dataset.sub || '');
    const q = (searchEl?.value || '').toLowerCase().trim();

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

    // Apply search filter if search input exists
    const searchVal = ($('#search-input-assigned')?.value || '').toLowerCase().trim();
    if (searchVal) {
      filteredCourses = filteredCourses.filter(c => 
        (c.title || '').toLowerCase().includes(searchVal) || 
        (c.description || '').toLowerCase().includes(searchVal) ||
        (c.mainCategory || '').toLowerCase().includes(searchVal)
      );
    }
    
    if (!filteredCourses.length) {
      assignedEl.innerHTML = `<div class="empty-state-card" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
        <p style="opacity:.7">No assigned courses found ${searchVal ? 'matching "'+searchVal+'"' : 'matching your filter'}.</p>
      </div>`;
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
    // Only show quizzes that were explicitly assigned to the user
    const list = assignedQuizzes; 
    if (!list.length) {
      quizzesEl.innerHTML = `<div class="empty-state-card" style="text-align:center; padding: 2rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; grid-column: 1 / -1;">
                               <img src="img/thumb-default.jpg" style="width: 64px; opacity: 0.3; margin-bottom: 1rem;" alt="">
                               <p style="color: #64748b; font-weight: 500;">No quizzes are currently assigned to you.</p>
                             </div>`;
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

  function setActiveTab(tab) {
    currentTab = tab;
    localStorage.setItem('activeTab', tab);

    // sidebar active - only update visible tabs
    [tabAssigned, tabAiMentor, tabQuizzes, tabLeader, tabFeedback].forEach(el => {
      if (el) el.classList.remove('active');
    });
    if (tabAll) tabAll.classList.remove('active');
    
    if (tab === 'all' && tabAll) tabAll.classList.add('active');
    if (tab === 'assigned' && tabAssigned) tabAssigned.classList.add('active');
    if (tab === 'ai-mentor' && tabAiMentor) tabAiMentor.classList.add('active');
    if (tab === 'quizzes' && tabQuizzes) tabQuizzes.classList.add('active');
    if (tab === 'leaderboard' && tabLeader) tabLeader.classList.add('active');
    if (tab === 'feedback' && tabFeedback) tabFeedback.classList.add('active');

    // panels
    $('#panel-all')?.classList.add('hidden');
    $('#panel-assigned')?.classList.add('hidden');
    $('#panel-ai-mentor')?.classList.add('hidden');
    $('#panel-quizzes')?.classList.add('hidden');
    $('#panel-leaderboard')?.classList.add('hidden');
    $('#panel-feedback')?.classList.add('hidden');

    if (tab === 'all') $('#panel-all')?.classList.remove('hidden');
    if (tab === 'assigned') $('#panel-assigned')?.classList.remove('hidden');
    if (tab === 'ai-mentor') $('#panel-ai-mentor')?.classList.remove('hidden');
    if (tab === 'quizzes') $('#panel-quizzes')?.classList.remove('hidden');
    if (tab === 'leaderboard') $('#panel-leaderboard')?.classList.remove('hidden');
    if (tab === 'feedback') $('#panel-feedback')?.classList.remove('hidden');

    // Close sidebar on mobile when switching
    closeSidebar();
  }

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.add('show');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
  }

  function showTypingIndicator() {
    if (!aiChatMessages) return null;
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.className = 'ai-msg ai-msg-bot message-fade-in';
    div.id = id;
    div.innerHTML = `
      <div style="display: flex; align-items: center;">
         <div class="ai-avatar ai-avatar-bot">E</div>
         <div class="typing-dots"><span></span><span></span><span></span></div>
      </div>
    `;
    aiChatMessages.appendChild(div);
    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    return id;
  }

  function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function appendAiMessage(role, text) {
    if (!aiChatMessages) return;
    
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg-${role} message-fade-in`;
    
    const innerFlex = document.createElement('div');
    innerFlex.style.cssText = 'display:flex; align-items:flex-start;';
    
    const avatar = document.createElement('div');
    avatar.className = `ai-avatar ai-avatar-${role}`;
    avatar.textContent = role === 'user' ? 'U' : 'E';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'ai-content';
    
    // Render Markdown using 'marked' library if available
    if (typeof marked !== 'undefined') {
        contentDiv.innerHTML = marked.parse(text);
    } else {
        contentDiv.textContent = text;
    }
    
    innerFlex.appendChild(avatar);
    innerFlex.appendChild(contentDiv);
    div.appendChild(innerFlex);
    
    aiChatMessages.appendChild(div);
    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
  }

  function scrollToBottom() {
    if (aiChatMessages) {
      aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    }
  }

  function wireEvents() {
    // category chips
    if (chipsEl) {
      chipsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-cat]');
        if (!btn) return;
        
        // Use state to determine logic
        const cat = decodeURIComponent(btn.dataset.cat || '');
        
        if (selectedMainCategory === cat) {
           // If clicking the active one, toggle OFF (Reset)
           selectedMainCategory = null;
           renderCategories();          // Shows all chips again
           renderSubcategories(null);   // Hides sub-bar
        } else {
           // Activate this category
           selectedMainCategory = cat;
           renderCategories();          // Shows only this chip
           renderSubcategories(cat);    // Shows sub-bar
        }
        
        renderAllCourses();
      });
    }

    if (subBarEl) {
      subBarEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-sub]');
        if (!btn) return;
        $$('.chip--sub').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        renderAllCourses();
      });
    }

    // search
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        if (currentTab === 'all') {
          renderAllCourses();
        }
      });
    }

    const searchAssignedEl = $('#search-input-assigned');
    if (searchAssignedEl) {
      searchAssignedEl.addEventListener('input', () => {
        renderAssignedCourses();
      });
    }

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

    // tabs - only add listeners to tabs that exist
    if (tabAll) tabAll.addEventListener('click', () => setActiveTab('all'));
    if (tabAssigned) tabAssigned.addEventListener('click', () => setActiveTab('assigned'));
    if (tabAiMentor) tabAiMentor.addEventListener('click', () => setActiveTab('ai-mentor'));
    if (tabQuizzes) tabQuizzes.addEventListener('click', () => setActiveTab('quizzes'));
    if (tabLeader) tabLeader.addEventListener('click', () => setActiveTab('leaderboard'));
    if (tabFeedback) tabFeedback.addEventListener('click', () => setActiveTab('feedback'));

    // logout
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('user');
        localStorage.removeItem('activeTab');
        window.location.href = '/';
      });
    }

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
          // Ensure user is available
          if (!user || !user.email) {
            console.error('User not available:', user);
            throw new Error('User not authenticated');
          }
          
          const feedbackData = {
            email: user.email || '',
            name: user.name || '',
            message: msg
          };
          
          console.log('Sending feedback:', feedbackData);
          
          const resp = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(feedbackData)
          });
          
          console.log('Feedback response status:', resp.status);
          
          const data = await resp.json();
          console.log('Feedback response data:', data);
          
          if (!resp.ok || !data.ok) {
            throw new Error(data.message || `HTTP ${resp.status}`);
          }
          
          feedbackStatus.textContent = 'Thank you for your feedback!';
          feedbackStatus.style.color = '#15803d';
          feedbackText.value = '';
        } catch (err) {
          console.error('feedback error:', err.message, err);
          feedbackStatus.textContent = `Error: ${err.message}`;
          feedbackStatus.style.color = '#b91c1c';
        }
      });
    }

    // AI Chat
    if (aiChatForm) {
      // Speech Recognition
      const aiMicBtn = $('#ai-mic-btn');
      if (aiMicBtn) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          aiMicBtn.style.display = 'none'; 
        } else {
          const recognition = new SpeechRecognition();
          recognition.continuous = false;
          recognition.interimResults = false;
          recognition.lang = 'en-IN'; // Optimized for Indian context

          let isListening = false;

          aiMicBtn.addEventListener('click', () => {
            if (isListening) {
              recognition.stop();
            } else {
              recognition.start();
            }
          });

          recognition.onstart = () => {
            isListening = true;
            aiMicBtn.classList.add('listening');
            aiChatInput.placeholder = 'Listening...';
          };

          recognition.onend = () => {
            isListening = false;
            aiMicBtn.classList.remove('listening');
            aiChatInput.placeholder = 'Ask me anything...';
          };

          recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            aiChatInput.value = transcript;
            // Focus input after speech
            aiChatInput.focus();
          };

          recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            isListening = false;
            aiMicBtn.classList.remove('listening');
            aiChatInput.placeholder = 'Ask me anything...';
          };
        }
      }

      aiChatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = (aiChatInput.value || '').trim();
        if (!msg) return;
        
        // Ensure session exists
        if (!currentSessionId) {
           await createNewSession();
        }

        // 1. User Message
        appendAiMessage('user', msg);
        aiChatInput.value = '';

        // Show typing indicator
        const typingId = showTypingIndicator();

        // 2. Bot Request
        try {
          const resp = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email || '',
              message: msg,
              sessionId: currentSessionId
            })
          });
          
          if (!resp.ok) {
            removeTypingIndicator(typingId);
            const errText = await resp.text().catch(() => '');
            console.error('AI response error:', resp.status, resp.statusText, errText);
            
             if (resp.status === 405) {
                appendAiMessage('bot', `Proxy Error (405): The Frontend Server is not forwarding requests to the AI Server correctly. Please restart the Frontend Server.`);
             } else if (resp.status === 404) {
                 appendAiMessage('bot', `Error (404): AI Service not found. Connection failed.`);
             } else {
                 appendAiMessage('bot', `Error (${resp.status}): ${resp.statusText}. Please check logs.`);
             }
            return;
          }
          
          const data = await resp.json();
          removeTypingIndicator(typingId);

          if (data.reply) {
            appendAiMessage('bot', data.reply);
            // Refresh list to update title/timestamps
            loadSessionList(); 
          } else {
            appendAiMessage('bot', 'Sorry, I didn\'t get a response. Please try again.');
          }
        } catch (err) {
          console.error('AI error', err);
          removeTypingIndicator(typingId);
          appendAiMessage('bot', `Error: ${err.message}. Make sure the AI service is running on port 3002.`);
        }
      });
    }
    
    // New Chat Button
    if (aiNewChatBtn) {
        aiNewChatBtn.addEventListener('click', () => {
             createNewSession().then(() => {
                 aiChatMessages.innerHTML = '';
                 // Optional welcome message
                 appendAiMessage('bot', '**New Chat Started.** How can I help?');
                 
                 // Close mobile history if open
                 const hist = $('.ai-history-sidebar');
                 if (hist) hist.classList.remove('open-mobile');
             });
        });
    }
    
    // AI History Toggle (Mobile)
    const aiHistoryToggle = $('#ai-history-toggle');
    const aiHistorySidebar = $('.ai-history-sidebar');
    
    if (aiHistoryToggle && aiHistorySidebar) {
        aiHistoryToggle.addEventListener('click', (e) => {
           e.stopPropagation();
           aiHistorySidebar.classList.toggle('open-mobile');
        });
        
        // Close when clicking outside (on backdrop logic if we added one, strict click handling for now)
        document.addEventListener('click', (e) => {
           if (aiHistorySidebar.classList.contains('open-mobile')) {
               if (!aiHistorySidebar.contains(e.target) && !aiHistoryToggle.contains(e.target)) {
                   aiHistorySidebar.classList.remove('open-mobile');
               }
           }
        });
    }
  }

  // === Session Management ===

  async function createNewSession() {
      if (!user || !user.email) return;
      try {
          const resp = await fetch(AI_CREATE_SESSION_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: user.email })
          });
          
          if (!resp.ok) {
             const errText = await resp.text();
             console.error("Create Session Error:", resp.status, errText);
             throw new Error(`Server error ${resp.status}: ${errText.substring(0, 50)}`);
          }

          const data = await resp.json();
          const newId = data.sessionId;
          
          currentSessionId = newId;
          localStorage.setItem('currentSessionId', newId);

          // Clear the "Welcome Screen" and show a fresh chat message
          aiChatMessages.innerHTML = ''; 
          appendAiMessage('bot', '**New Chat Started.** How can I help?');
          
          await loadSessionList();
          selectSessionInUi(newId);
      } catch (err) {
          console.error('Failed to create session', err);
      }
  }

  async function loadSessionList() {
      if (!user || !user.email) return;
      try {
          const url = `${AI_SESSION_LIST_URL}?email=${encodeURIComponent(user.email)}`;
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
          const text = await resp.text();
          let data;
          try {
             data = JSON.parse(text);
          } catch (e) {
             console.error("Failed to parse sessions JSON:", text.substring(0, 100));
             throw new Error("Invalid server response (HTML)");
          }
          renderSessionList(data.sessions || []);
      } catch (err) {
          console.error('Failed to load sessions', err);
      }
  }

  function renderSessionList(sessions) {
      if (!aiHistoryList) return;
      
      // If no sessions, showing nothing or empty state
      if (sessions.length === 0 && !currentSessionId) {
          aiHistoryList.innerHTML = '<div style="padding:0.5rem;color:#9ca3af;font-size:13px;">No chats yet.</div>';
          return;
      }
      
      aiHistoryList.innerHTML = sessions.map(s => {
          const activeClass = s.id === currentSessionId ? 'active' : '';
          const title = s.title || 'New Chat';
          return `
            <div class="ai-history-item-wrapper" data-id="${s.id}">
              <div class="ai-history-item ${activeClass}">${title}</div>
              <button class="ai-delete-chat-btn" title="Delete chat">✕</button>
            </div>`;
      }).join('');
      
      // Add click listeners for chat selection
      $$('.ai-history-item').forEach(el => {
          el.addEventListener('click', () => {
              const id = el.closest('.ai-history-item-wrapper').dataset.id;
              switchSession(id);
          });
      });
      
      // Add click listeners for delete buttons
      $$('.ai-delete-chat-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const id = btn.closest('.ai-history-item-wrapper').dataset.id;
              deleteSession(id);
          });
      });
  }

  async function switchSession(id) {
     console.log('Switching to session:', id);
     currentSessionId = id;
     localStorage.setItem('currentSessionId', id);
     
     // Update UI active state
     selectSessionInUi(id);
     
     // Show loading state
     aiChatMessages.innerHTML = `
        <div style="display:flex; justify-content:center; align-items:center; height:100%;">
            <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>`;
     
     // Load Messages
     await loadAiHistory(); 
  }

  async function deleteSession(id) {
     if (!confirm('Are you sure you want to delete this chat?')) return;
     
     try {
         const resp = await fetch(`/ai/session/${encodeURIComponent(id)}`, {
             method: 'DELETE',
             headers: { 'Content-Type': 'application/json' }
         });
         const data = await resp.json();
         if (!resp.ok) throw new Error(data.message || 'Failed to delete');
         
         // If deleting current session, switch to a new one
         if (id === currentSessionId) {
             currentSessionId = '';
             localStorage.removeItem('currentSessionId');
             aiChatMessages.innerHTML = '';
             showAiWelcomeState();
         }
         
         // Reload the session list
         await loadSessionList();
     } catch (err) {
         console.error('Failed to delete session', err);
         alert('Failed to delete chat. Please try again.');
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

    // Load Session List & History
    await loadSessionList();
    
    // Logic: If user has a last active session, resume it.
    // If NOT, stay on the "Welcome" empty state. 
    // Do NOT auto-create a session and empty screen.
    if (localStorage.getItem('currentSessionId')) {
        const lastId = localStorage.getItem('currentSessionId');
        // Verify it exists in our loaded list
        const exists = $$('.ai-history-item').some(el => el.dataset.id === lastId);
        if (exists) {
            currentSessionId = lastId;
            selectSessionInUi(lastId);
            loadAiHistory();
        } else {
           // Invalid ID, clear it
           localStorage.removeItem('currentSessionId');
           currentSessionId = null;
           showAiWelcomeState();
        }
    } else {
        // No active session, show welcome state
        showAiWelcomeState();
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
      console.log('Leaderboard data received:', leaderboard);
      renderLeaderboard(leaderboard);
    } catch (err) {
      console.error('leaderboard load error', err);
      leaderboardEl.innerHTML = `<p style="color:#c00">Failed to load leaderboard: ${err.message}</p>`;
    }
  }

  async function loadAiHistory() {
    if (!currentSessionId) return;
    try {
      console.log('Fetching history for:', currentSessionId);
      const url = `${AI_HISTORY_URL}?sessionId=${encodeURIComponent(currentSessionId)}`;
      const resp = await fetch(url);
      
      if (!resp.ok) {
        console.error('History fetch failed:', resp.status);
        aiChatMessages.innerHTML = `<div style="text-align:center;color:red;padding:2rem;">
            Failed to load history (Status: ${resp.status}). 
        </div>`;
        return;
      }
      
      const data = await resp.json();
      const history = data.history;
      console.log('History loaded, length:', history ? history.length : 0);
      
      aiChatMessages.innerHTML = ''; // Ensure clear
      
      if (history && history.length > 0) {
        history.forEach(item => {
           // Handle 'assistant' role from legacy keyword fallback too
           const role = (item.role === 'model' || item.role === 'assistant') ? 'bot' : item.role;
           appendAiMessage(role, item.content);
        });
        scrollToBottom();
      } else {
         // It's an empty session (e.g. just created), assume "New Chat" flow
         appendAiMessage('bot', '**Hi there!** How can I help you?');
      }
    } catch (err) {
      console.error('Failed to load chat history', err);
      aiChatMessages.innerHTML = `<div style="text-align:center;color:red;padding:2rem;">
        Error loading history: ${err.message}<br>
        <small>Session: ${currentSessionId}</small><br><br>
        <button id="retry-history-btn" class="btn btn--primary" style="padding:0.5rem 1rem;">Retry</button>
      </div>`;
      
      document.getElementById('retry-history-btn')?.addEventListener('click', () => loadAiHistory());
    }
  }
  
  function selectSessionInUi(id) {
       $$('.ai-history-item').forEach(el => el.classList.remove('active'));
       $(`.ai-history-item[data-id="${id}"]`)?.classList.add('active');
  }

  // === Init ===
  async function init() {
    console.log('Dashboard initializing...');
    ensureUser();
    console.log('User ensured, wiring events...');
    wireEvents();
    
    // Restore tab
    let tabToShow = currentTab;
    if (!tabToShow) {
      tabToShow = 'all'; // Default to all courses
    }
    console.log('Setting active tab to:', tabToShow);
    setActiveTab(tabToShow);

    // Initial UI state for AI
    if (aiChatMessages) {
        console.log('Showing AI welcome state');
        showAiWelcomeState();
    }
    
    console.log('Loading all data...');
    await loadAll().catch(err => console.error('Dashboard load error:', err));
    console.log('Dashboard fully loaded');
  }
  
  function showAiWelcomeState() {
      aiChatMessages.innerHTML = `
        <div class="ai-empty-state">
            <div class="ai-empty-logo">E</div>
            <h2>Hello, ${user ? user.name : 'Learner'}</h2>
            <p>How can I help you regarding your courses today?</p>
            <div class="ai-suggestions">
                <button class="ai-suggestion-chip">What courses are assigned to me?</button>
                <button class="ai-suggestion-chip">Show me the leaderboard</button>
                <button class="ai-suggestion-chip">I need help with "Leadership"</button>
            </div>
        </div>
      `;
      
      // Wire up suggestions
      $$('.ai-suggestion-chip').forEach(btn => {
          btn.addEventListener('click', () => {
              const text = btn.textContent;
              aiChatInput.value = text;
              aiChatForm.dispatchEvent(new Event('submit'));
          });
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
