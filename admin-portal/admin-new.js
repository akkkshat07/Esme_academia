const API = ''; // Relative path handled by frontend-server proxy

// Auth check
(function() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user || !user.email || (user.role || '').toLowerCase() !== 'admin') {
      alert('Access Denied: Admin access only');
      window.location.href = '/';
      return;
    }
    document.getElementById('admin-name').textContent = user.name || user.email;
  } catch (e) {
    alert('Access Denied: Invalid session');
    window.location.href = '/';
    return;
  }
})();

// Page Navigation
function showPage(pageName) {
  // Hide all pages
  document.querySelectorAll('.admin-page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
  
  // Show selected page
  document.getElementById(pageName).classList.add('active');
  event.target.closest('.admin-nav-item').classList.add('active');
  
  // Update title
  const titles = {
    dashboard: 'Dashboard',
    courses: 'Manage Courses',
    completions: 'User Completions',
    analytics: 'Course Analytics',
    assignments: 'Assign Courses',
    reminders: 'Send Reminders'
  };
  document.getElementById('page-title').textContent = titles[pageName] || 'Admin';
  
  // Load page data
  if (pageName === 'dashboard') loadDashboard();
  if (pageName === 'completions') loadCompletions();
  if (pageName === 'analytics') loadAnalytics();
}

// ===== DASHBOARD PAGE =====
async function loadDashboard() {
  try {
    const completions = await fetch(`${API}/admin/completions`).then(r => r.json()).catch(() => ({data: []}));
    const courses = await fetch(`${API}/admin/courses`).then(r => r.json()).catch(() => ({data: []}));

    let completionList = completions.data || [];
    const courseList = courses.data || [];
    
    // Filter for completed courses only
    completionList = completionList.filter(c => c.autoCompleted);
    
    // Remove duplicates - keep only latest completion per user-course
    const completedMap = {};
    completionList.forEach(record => {
      const key = `${record.email}|${record.title}`;
      if (!completedMap[key] || new Date(record.timestamp) > new Date(completedMap[key].timestamp)) {
        completedMap[key] = record;
      }
    });
    completionList = Object.values(completedMap);

    // Stats
    const statsHtml = `
      <div class="stat-card">
        <div class="stat-label">Total Completions</div>
        <div class="stat-value">${completionList.length}</div>
        <div class="stat-subtitle">Courses completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Courses</div>
        <div class="stat-value">${courseList.length}</div>
        <div class="stat-subtitle">Courses in system</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Unique Users</div>
        <div class="stat-value">${new Set(completionList.map(c => c.email)).size}</div>
        <div class="stat-subtitle">Users completed courses</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Watch Time</div>
        <div class="stat-value">${completionList.length > 0 ? Math.round(completionList.reduce((s, c) => s + (c.watchedSeconds || 0), 0) / completionList.length) : 0}s</div>
        <div class="stat-subtitle">Average seconds watched</div>
      </div>
    `;
    document.getElementById('dashboard-stats').innerHTML = statsHtml;

    // Recent completions table (latest 10)
    const recent = completionList.slice(-10).reverse();
    const tableHtml = `
      <table style="width: 100%;">
        <thead>
          <tr>
            <th>User Email</th>
            <th>Course</th>
            <th>Status</th>
            <th>% Watched</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${recent.map(c => `
            <tr>
              <td>${escapeHtml(c.email)}</td>
              <td>${escapeHtml(c.title)}</td>
              <td><span class="badge badge-completed">Completed</span></td>
              <td>${Math.round(c.percent_watched || 0)}%</td>
              <td>${new Date(c.timestamp).toLocaleDateString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    document.getElementById('recent-completions').innerHTML = tableHtml;
  } catch (e) {
    console.error('Dashboard error:', e);
    document.getElementById('dashboard-stats').innerHTML = `<div style="color: red; padding: 16px;">Error loading dashboard: ${e.message}</div>`;
  }
}

// ===== COMPLETIONS PAGE =====
let allCompletions = [];

async function loadCompletions() {
  try {
    const res = await fetch(`${API}/admin/completions`).then(r => r.json());
    const rawData = res.data || [];
    
    // Filter to show only completed courses (autoCompleted = true)
    // and keep only the latest record per user-course combination
    const completedMap = {};
    rawData.forEach(record => {
      if (record.autoCompleted) {
        const key = `${record.email}|${record.title}`;
        // Keep the most recent completion record
        if (!completedMap[key] || new Date(record.timestamp) > new Date(completedMap[key].timestamp)) {
          completedMap[key] = record;
        }
      }
    });
    
    allCompletions = Object.values(completedMap);
    renderCompletionsTable(allCompletions);
  } catch (e) {
    console.error(e);
    document.getElementById('completions-tbody').innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Error loading completions</td></tr>`;
  }
}

function renderCompletionsTable(data) {
  const html = data.map(c => `
    <tr>
      <td>${escapeHtml(c.email || '')}</td>
      <td>${escapeHtml(c.title || '')}</td>
      <td><span class="badge badge-${c.autoCompleted ? 'completed' : 'pending'}">${c.autoCompleted ? 'Completed' : 'In Progress'}</span></td>
      <td>${Math.round(c.percent_watched || 0)}%</td>
      <td>${c.timestamp ? new Date(c.timestamp).toLocaleDateString() : 'N/A'}</td>
    </tr>
  `).join('');
  
  document.getElementById('completions-tbody').innerHTML = html || '<tr><td colspan="5" style="text-align: center; color: #94a3b8;">No completions recorded</td></tr>';
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'completion-search') {
    const query = e.target.value.toLowerCase();
    const filtered = allCompletions.filter(c => 
      c.email.toLowerCase().includes(query) || 
      c.title.toLowerCase().includes(query)
    );
    renderCompletionsTable(filtered);
  }
});

// ===== ANALYTICS PAGE =====
async function loadAnalytics() {
  try {
    const [completions, courses] = await Promise.all([
      fetch(`${API}/admin/completions`).then(r => r.json()),
      fetch(`${API}/admin/courses`).then(r => r.json())
    ]);

    let completionData = completions.data || [];
    const courseData = courses.data || [];
    
    // Filter for completed courses only
    completionData = completionData.filter(c => c.autoCompleted);
    
    // Remove duplicates - keep only latest completion per user-course
    const completedMap = {};
    completionData.forEach(record => {
      const key = `${record.email}|${record.title}`;
      if (!completedMap[key] || new Date(record.timestamp) > new Date(completedMap[key].timestamp)) {
        completedMap[key] = record;
      }
    });
    completionData = Object.values(completedMap);

    // Stats
    document.getElementById('total-users').textContent = new Set(completionData.map(c => c.email)).size;
    document.getElementById('total-courses').textContent = courseData.length;
    document.getElementById('total-completions').textContent = completionData.length;

    // Course-wise analytics
    const courseStats = {};
    courseData.forEach(course => {
      courseStats[course.title] = {
        title: course.title,
        category: course.mainCategory,
        startedUsers: new Set(),
        completedUsers: new Set(),
        totalWatchedSeconds: 0,
        completionCount: 0
      };
    });

    completionData.forEach(c => {
      if (courseStats[c.title]) {
        courseStats[c.title].completedUsers.add(c.email);
        courseStats[c.title].totalWatchedSeconds += c.watchedSeconds || 0;
        courseStats[c.title].completionCount++;
      }
    });

    const analyticsHtml = Object.values(courseStats)
      .filter(s => s.completionCount > 0)
      .sort((a, b) => b.completionCount - a.completionCount)
      .map(s => {
        const avgSeconds = s.completionCount > 0 ? Math.round(s.totalWatchedSeconds / s.completionCount) : 0;
        const completionRate = s.completionCount > 0 ? Math.round((s.completionCount / Math.max(1, s.completedUsers.size)) * 100) : 0;
        return `
          <tr>
            <td>${escapeHtml(s.title)}</td>
            <td>${escapeHtml(s.category)}</td>
            <td>${s.completedUsers.size}</td>
            <td><strong>${s.completionCount}</strong></td>
            <td><strong>${completionRate}%</strong></td>
            <td>${avgSeconds}s</td>
          </tr>
        `;
      }).join('');

    document.getElementById('course-analytics-tbody').innerHTML = analyticsHtml || '<tr><td colspan="6" style="text-align: center; color: #6b7a87;">No completed courses yet</td></tr>';
  } catch (e) {
    console.error('Analytics error:', e);
    document.getElementById('course-analytics-tbody').innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">Error loading analytics</td></tr>`;
  }
}

// ===== COURSES PAGE =====
// ===== ASSIGNMENTS PAGE =====
document.getElementById('assign-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  try {
    const r = await fetch(`${API}/admin/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const j = await r.json();
    document.getElementById('assign-out').textContent = JSON.stringify(j, null, 2);
    if (j.success) {
      alert('Course assigned successfully!');
      e.target.reset();
    }
  } catch (e) {
    document.getElementById('assign-out').textContent = 'Assignment failed: ' + e.message;
  }
});

// ===== REMINDERS PAGE =====
async function runReminders() {
  try {
    const btn = document.getElementById('nudge-btn');
    const outBox = document.getElementById('rem-out');
    const statusBox = document.getElementById('rem-status');
    const listDiv = document.getElementById('nudge-list');
    
    btn.disabled = true;
    btn.textContent = 'Sending...';
    outBox.style.display = 'none';
    statusBox.style.display = 'none';
    
    const r = await fetch(`${API}/admin/reminders/run`, { method: 'POST' });
    const j = await r.json();
    
    btn.disabled = false;
    btn.textContent = 'Send Nudges Now';
    
    // Update stat cards
    document.getElementById('nudge-count').textContent = j.total_eligible || j.nudged || 0;
    document.getElementById('nudge-sent').textContent = j.nudged || j.sent?.length || 0;
    
    // Update SMTP status
    const smtpDiv = document.getElementById('smtp-status');
    if (j.smtp_configured) {
      smtpDiv.innerHTML = '<span style="padding: 4px 8px; background: #d1fae5; color: #065f46; border-radius: 3px;">SMTP Configured</span>';
    } else {
      smtpDiv.innerHTML = '<span style="padding: 4px 8px; background: #fef3c7; color: #92400e; border-radius: 3px;">Preview Mode</span>';
    }
    
    // Display results
    if (j.sent && j.sent.length > 0) {
      statusBox.style.display = 'block';
      const list = j.sent.map((item, i) => {
        return `<div style="padding: 8px; background: white; margin-bottom: 4px; border-radius: 3px; border-left: 3px solid #10b981;">
          <strong>${i + 1}. ${item.email}</strong><br/>
          <span style="font-size: 12px; color: #059669;">→ ${item.title}</span>
          ${item.status === 'would-send' ? '<span style="font-size: 11px; color: #6b7280; margin-left: 8px;">(Preview)</span>' : ''}
        </div>`;
      }).join('');
      listDiv.innerHTML = list;
    }
    
    // Show detailed output
    outBox.style.display = 'block';
    outBox.innerHTML = `
      <div style="background: white; padding: 12px; border-radius: 6px;">
        <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb;">
          <strong style="color: #008aa6;">Result:</strong> ${j.success ? '✓ Success' : '✗ Failed'}<br/>
          <strong style="color: #008aa6;">Note:</strong> ${j.note || 'N/A'}
        </div>
        <div style="font-family: monospace; font-size: 12px; color: #64748b; max-height: 300px; overflow-y: auto;">
          <pre>${JSON.stringify(j, null, 2)}</pre>
        </div>
      </div>
    `;
    
    if (j.success) {
      alert(`✓ ${j.nudged || 0} nudge(s) sent successfully!`);
    } else {
      alert(`Error: ${j.message || 'Failed to send reminders'}`);
    }
  } catch (e) {
    document.getElementById('nudge-btn').disabled = false;
    document.getElementById('nudge-btn').textContent = 'Send Nudges Now';
    document.getElementById('rem-out').style.display = 'block';
    document.getElementById('rem-out').textContent = 'Error: ' + e.message;
  }
}

// ===== LOGOUT =====
function logoutAdmin() {
  localStorage.removeItem('user');
  localStorage.removeItem('activeTab');
  window.location.href = '/';
}

// Utility
function escapeHtml(s = '') {
  return s.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}
