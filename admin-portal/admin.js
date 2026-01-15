const API = ''; // Relative path

(function() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user || !user.email || (user.role || '').toLowerCase() !== 'admin') {
      alert('Access Denied: Admin access only');
      window.location.href = '/';
      return;
    }
  } catch (e) {
    alert('Access Denied: Invalid session');
    window.location.href = '/';
    return;
  }
})();

document.getElementById('logout-admin-btn')?.addEventListener('click', () => {
  localStorage.removeItem('user');
  localStorage.removeItem('activeTab');
  window.location.href = '/';
});

const ctype = document.getElementById('ctype');
const file = document.getElementById('file');
function setAccept() {
  const t = ctype.value;
  file.value = '';
  if (t === 'video') file.accept = 'video/mp4';
  if (t === 'pdf')   file.accept = 'application/pdf';
  if (t === 'html')  file.accept = '.html,text/html';
}
ctype.onchange = setAccept; setAccept();

document.getElementById('refresh-courses').onclick = async () => {
  try {
    const r = await fetch(`${API}/admin/courses`);
    const j = await r.json();
    if (!j.success) throw new Error(j.message || 'Failed');
    const box = document.getElementById('courses');
    if (!j.data.length) { box.textContent = 'No courses yet.'; return; }
    box.innerHTML = j.data.map(c =>
      `<span class="course-pill">${escapeHtml(c.title)} · ${escapeHtml(c.mainCategory||'')} › ${escapeHtml(c.subcategory||'')} · ${escapeHtml(c.type||'video')}</span>`
    ).join(' ');
  } catch (e) {
    document.getElementById('courses').textContent = 'Error loading courses.';
  }
};

document.getElementById('upload-form').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const r = await fetch(`${API}/admin/upload-course`, { method:'POST', body: fd });
    const j = await r.json();
    document.getElementById('upload-out').textContent = JSON.stringify(j, null, 2);
    if (j.success) alert('Uploaded and added to Courses!');
  } catch (e) {
    document.getElementById('upload-out').textContent = 'Upload failed.';
  }
};

document.getElementById('assign-form').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  try {
    const r = await fetch(`${API}/admin/assign`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    const j = await r.json();
    document.getElementById('assign-out').textContent = JSON.stringify(j, null, 2);
    if (j.success) alert('Assigned!');
  } catch (e) {
    document.getElementById('assign-out').textContent = 'Assignment failed.';
  }
};

document.getElementById('run-reminders').onclick = async () => {
  try {
    const r = await fetch(`${API}/admin/reminders/run`, { method:'POST' });
    const j = await r.json();
    document.getElementById('rem-out').textContent = JSON.stringify(j, null, 2);
    if (j.success) alert(`Nudges sent: ${j.nudged||0}`);
  } catch (e) {
    document.getElementById('rem-out').textContent = 'Reminder run failed.';
  }
};

function escapeHtml(s='') {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
