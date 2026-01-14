// OTP Authentication Logic
// Handles Phone OTP and Email OTP login flows

(function () {
  const auth = window.firebaseAuth?.auth;
  if (!auth) {
    console.error('Firebase auth not initialized');
    return;
  }

  // ============ TAB SWITCHING ============
  document.querySelectorAll('.login-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      // Remove active class from all tabs and contents
      document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.login-tab-content').forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      document.getElementById(targetTab)?.classList.add('active');
    });
  });

  // ============ PHONE OTP LOGIN ============
  
  const phoneNumberInput = document.getElementById('phoneNumber');
  const sendPhoneOtpBtn = document.getElementById('sendPhoneOtpBtn');
  const phoneInputStep = document.getElementById('phoneInputStep');
  const phoneOtpStep = document.getElementById('phoneOtpStep');
  const phoneOtpCodeInput = document.getElementById('phoneOtpCode');
  const verifyPhoneOtpBtn = document.getElementById('verifyPhoneOtpBtn');
  const resendPhoneOtpBtn = document.getElementById('resendPhoneOtpBtn');
  const phoneOtpError = document.getElementById('phoneOtpError');
  const phoneVerifyError = document.getElementById('phoneVerifyError');

  let phoneConfirmationResult;

  // Format phone number
  function formatPhoneNumber(input) {
    const digits = input.replace(/\D/g, '');
    if (digits.length > 0 && !digits.startsWith('91') && digits.length === 10) {
      return '+91' + digits;
    }
    if (digits.length > 0 && !digits.startsWith('+')) {
      return '+' + digits;
    }
    return input.startsWith('+') ? input : '+91' + digits;
  }

  // Send OTP to phone
  sendPhoneOtpBtn.addEventListener('click', async () => {
    phoneOtpError.textContent = '';
    const phoneNumber = phoneNumberInput.value.trim();

    if (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 10) {
      phoneOtpError.textContent = 'Please enter a valid phone number';
      return;
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    sendPhoneOtpBtn.disabled = true;
    sendPhoneOtpBtn.textContent = 'Sending...';

    try {
      // Initialize reCAPTCHA
      window.firebaseAuth.initializeRecaptcha('recaptcha-phone');

      // Send OTP
      phoneConfirmationResult = await auth.signInWithPhoneNumber(
        formattedPhone,
        window.firebaseAuth.recaptchaVerifier
      );

      console.log('OTP sent successfully to', formattedPhone);
      
      // Switch to OTP verification step
      phoneInputStep.style.display = 'none';
      phoneOtpStep.style.display = 'block';
      phoneOtpCodeInput.focus();

      // Setup auto-verification when OTP is entered
      setupAutoVerifyPhone();

    } catch (error) {
      console.error('Phone OTP error:', error);
      phoneOtpError.textContent = error.message || 'Failed to send OTP. Try again.';
      sendPhoneOtpBtn.disabled = false;
      sendPhoneOtpBtn.textContent = 'Send OTP';
      if (window.firebaseAuth.recaptchaVerifier) {
        window.firebaseAuth.recaptchaVerifier.clear();
      }
    }
  });

  // Verify phone OTP
  verifyPhoneOtpBtn.addEventListener('click', async () => {
    phoneVerifyError.textContent = '';
    const code = phoneOtpCodeInput.value.trim();

    if (!code || code.length !== 6) {
      phoneVerifyError.textContent = 'Please enter a valid 6-digit code';
      return;
    }

    verifyPhoneOtpBtn.disabled = true;
    verifyPhoneOtpBtn.textContent = 'Verifying...';

    try {
      const result = await phoneConfirmationResult.confirm(code);
      const user = result.user;

      // Login successful - search database for user
      await handlePhoneLogin(user.phoneNumber);

    } catch (error) {
      console.error('OTP verification error:', error);
      phoneVerifyError.textContent = 'Invalid OTP. Please try again.';
      verifyPhoneOtpBtn.disabled = false;
      verifyPhoneOtpBtn.textContent = 'Verify OTP';
    }
  });

  // Resend phone OTP
  resendPhoneOtpBtn.addEventListener('click', async () => {
    phoneVerifyError.textContent = '';
    resendPhoneOtpBtn.disabled = true;
    resendPhoneOtpBtn.textContent = 'Resending...';

    try {
      const phoneNumber = phoneNumberInput.value.trim();
      const formattedPhone = formatPhoneNumber(phoneNumber);

      if (window.firebaseAuth.recaptchaVerifier) {
        window.firebaseAuth.recaptchaVerifier.clear();
      }
      window.firebaseAuth.initializeRecaptcha('recaptcha-phone');

      phoneConfirmationResult = await auth.signInWithPhoneNumber(
        formattedPhone,
        window.firebaseAuth.recaptchaVerifier
      );

      phoneVerifyError.textContent = 'New OTP sent to your phone';
      phoneOtpCodeInput.value = '';
      phoneOtpCodeInput.focus();

      // Reset button after 2 seconds
      setTimeout(() => {
        resendPhoneOtpBtn.disabled = false;
        resendPhoneOtpBtn.textContent = 'Resend OTP';
        phoneVerifyError.textContent = '';
      }, 2000);

    } catch (error) {
      console.error('Resend OTP error:', error);
      phoneVerifyError.textContent = 'Failed to resend OTP';
      resendPhoneOtpBtn.disabled = false;
      resendPhoneOtpBtn.textContent = 'Resend OTP';
    }
  });

  // Auto-verify when 6 digits are entered
  function setupAutoVerifyPhone() {
    phoneOtpCodeInput.addEventListener('input', () => {
      if (phoneOtpCodeInput.value.length === 6) {
        // Trigger verification automatically
        verifyPhoneOtpBtn.click();
      }
    });
  }

  // ============ EMAIL OTP LOGIN ============

  const emailAddressInput = document.getElementById('emailAddress');
  const sendEmailOtpBtn = document.getElementById('sendEmailOtpBtn');
  const emailInputStep = document.getElementById('emailInputStep');
  const emailOtpStep = document.getElementById('emailOtpStep');
  const emailOtpCodeInput = document.getElementById('emailOtpCode');
  const verifyEmailOtpBtn = document.getElementById('verifyEmailOtpBtn');
  const resendEmailOtpBtn = document.getElementById('resendEmailOtpBtn');
  const emailOtpError = document.getElementById('emailOtpError');
  const emailVerifyError = document.getElementById('emailVerifyError');

  let emailOtpStorage = {};

  // Send OTP to email
  sendEmailOtpBtn.addEventListener('click', async () => {
    emailOtpError.textContent = '';
    const email = emailAddressInput.value.trim();

    if (!email || !email.includes('@')) {
      emailOtpError.textContent = 'Please enter a valid email address';
      return;
    }

    sendEmailOtpBtn.disabled = true;
    sendEmailOtpBtn.textContent = 'Sending...';

    try {
      // Generate 6-digit OTP locally
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store OTP temporarily
      emailOtpStorage = { email, otp, timestamp: Date.now() };

      // Send OTP via backend API (backend will store and send email)
      const response = await fetch('/api/send-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });

      if (!response.ok) {
        throw new Error('Failed to send OTP');
      }

      console.log('Email OTP sent to:', email);

      // Switch to OTP verification step
      emailInputStep.style.display = 'none';
      emailOtpStep.style.display = 'block';
      emailOtpCodeInput.focus();

      // Setup auto-verification
      setupAutoVerifyEmail();

    } catch (error) {
      console.error('Email OTP error:', error);
      emailOtpError.textContent = error.message || 'Failed to send OTP. Try again.';
      sendEmailOtpBtn.disabled = false;
      sendEmailOtpBtn.textContent = 'Send OTP';
    }
  });

  // Verify email OTP
  verifyEmailOtpBtn.addEventListener('click', async () => {
    emailVerifyError.textContent = '';
    const code = emailOtpCodeInput.value.trim();
    const email = emailAddressInput.value.trim();

    if (!code || code.length !== 6) {
      emailVerifyError.textContent = 'Please enter a valid 6-digit code';
      return;
    }

    verifyEmailOtpBtn.disabled = true;
    verifyEmailOtpBtn.textContent = 'Verifying...';

    try {
      // Verify OTP via backend
      const response = await fetch('/api/verify-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Invalid OTP');
      }

      // OTP verified - handle email login
      await handleEmailLogin(email);

    } catch (error) {
      console.error('Email verification error:', error);
      emailVerifyError.textContent = error.message || 'Invalid OTP. Please try again.';
      verifyEmailOtpBtn.disabled = false;
      verifyEmailOtpBtn.textContent = 'Verify OTP';
    }
  });

  // Resend email OTP
  resendEmailOtpBtn.addEventListener('click', async () => {
    emailVerifyError.textContent = '';
    resendEmailOtpBtn.disabled = true;
    resendEmailOtpBtn.textContent = 'Resending...';

    try {
      const email = emailAddressInput.value.trim();
      // Generate new 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      emailOtpStorage = { email, otp, timestamp: Date.now() };

      // Send new OTP via backend
      const response = await fetch('/api/send-email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });

      if (!response.ok) {
        throw new Error('Failed to resend OTP');
      }

      emailVerifyError.textContent = 'New OTP sent to your email';
      emailOtpCodeInput.value = '';
      emailOtpCodeInput.focus();

      setTimeout(() => {
        resendEmailOtpBtn.disabled = false;
        resendEmailOtpBtn.textContent = 'Resend OTP';
        emailVerifyError.textContent = '';
      }, 2000);

    } catch (error) {
      console.error('Resend email OTP error:', error);
      emailVerifyError.textContent = 'Failed to resend OTP';
      resendEmailOtpBtn.disabled = false;
      resendEmailOtpBtn.textContent = 'Resend OTP';
    }
  });

  // Auto-verify when 6 digits are entered
  function setupAutoVerifyEmail() {
    emailOtpCodeInput.addEventListener('input', () => {
      if (emailOtpCodeInput.value.length === 6) {
        verifyEmailOtpBtn.click();
      }
    });
  }

  // ============ LOGIN HANDLERS ============

  async function handlePhoneLogin(phoneNumber) {
    try {
      // Call backend to authenticate with phone number
      const response = await fetch('/api/login-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Save user info and redirect
      localStorage.setItem('user', JSON.stringify(data.user || {}));
      const userRole = (data.user?.role || '').toLowerCase();
      window.location.href = userRole === 'admin' ? '/admin-portal/admin.html' : '/dashboard.html';

    } catch (error) {
      console.error('Phone login error:', error);
      phoneVerifyError.textContent = error.message || 'Login failed. Try again.';
      verifyPhoneOtpBtn.disabled = false;
      verifyPhoneOtpBtn.textContent = 'Verify OTP';
    }
  }

  async function handleEmailLogin(email) {
    try {
      // Call backend to authenticate with email
      const response = await fetch('/api/login-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Save user info and redirect
      localStorage.setItem('user', JSON.stringify(data.user || {}));
      const userRole = (data.user?.role || '').toLowerCase();
      window.location.href = userRole === 'admin' ? '/admin-portal/admin.html' : '/dashboard.html';

    } catch (error) {
      console.error('Email login error:', error);
      emailVerifyError.textContent = error.message || 'Login failed. Try again.';
      verifyEmailOtpBtn.disabled = false;
      verifyEmailOtpBtn.textContent = 'Verify OTP';
    }
  }

})();
