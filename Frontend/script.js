(function () {
  try {
    const existingUser = JSON.parse(localStorage.getItem('user'));
    if (existingUser && (existingUser.email || existingUser.phone)) {
      window.location.href = 'dashboard.html';
      return;
    }
  } catch (e) {}

  const form = document.getElementById('loginForm');
  const emailOrPhoneEl = document.getElementById('emailOrPhone');
  const passwordEl = document.getElementById('password');
  const errorEl = document.getElementById('passwordError');

  function setError(msg) {
    if (errorEl) errorEl.textContent = msg || '';
  }

  function cleanPhoneLike(input) {
    const digits = String(input || '').replace(/\D+/g, '');
    return digits.length >= 7 ? digits : input;
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');

    const raw = (emailOrPhoneEl?.value || '').trim();
    const emailOrPhone = cleanPhoneLike(raw);
    const password = (passwordEl?.value || '').trim();

    if (!emailOrPhone || !password) {
      setError('Please enter your email / phone and password.');
      return;
    }

    const btn = form?.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Signing in';
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone, password })
      });

      let data = null;
      try { data = await res.json(); } catch {}

      if (!res.ok || !data?.ok) {
        const msg = data?.message || `Login failed (HTTP ${res.status})`;
        setError(msg);
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Sign in';
        }
        return;
      }

      localStorage.setItem('user', JSON.stringify(data.user || {}));
      // Default to "All Courses" tab on fresh login
      localStorage.setItem('activeTab', 'all');
      
      const userRole = (data.user?.role || '').toLowerCase();
      if (userRole === 'admin') {
        window.location.href = '/admin-portal/admin.html';
      } else {
        window.location.href = '/dashboard.html';
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Network error. Please try again.');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    }
  }

  if (form) form.addEventListener('submit', handleLogin);
})();
