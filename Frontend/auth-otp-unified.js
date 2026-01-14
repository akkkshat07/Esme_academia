(function() {

  const loginForm = document.getElementById('loginForm');
  const emailOrPhoneInput = document.getElementById('emailOrPhone');
  const passwordInput = document.getElementById('password');
  const passwordError = document.getElementById('passwordError');
  
  const passwordModeContainer = document.getElementById('passwordModeContainer');
  const otpModeContainer = document.getElementById('otpModeContainer');
  const otpCodeInput = document.getElementById('otpCode');
  const otpError = document.getElementById('otpError');
  const otpInfo = document.getElementById('otpInfo');
  
  const sendOtpBtn = document.getElementById('sendOtpBtn');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const resendOtpBtn = document.getElementById('resendOtpBtn');
  const backToPasswordBtn = document.getElementById('backToPasswordBtn');
  
  let currentOtpMode = null;
  let phoneConfirmationResult = null;
  let emailOtpStorage = {};
  let otpSendInFlight = false;

  function formatPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) return '+91' + cleaned;
    if (cleaned.length === 12 && cleaned.startsWith('91')) return '+' + cleaned;
    if (phone.startsWith('+91')) return phone;
    return '+91' + cleaned;
  }

  function isEmail(str) {
    return str.includes('@') && str.includes('.');
  }

  function isPhone(str) {
    const digits = str.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }

  // --- SEND OTP HANDLER ---
  sendOtpBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const input = emailOrPhoneInput.value.trim();
    
    if (!input) {
      passwordError.textContent = 'Please enter your email or phone number';
      return;
    }

    if (isPhone(input)) {
      await handleSendPhoneOtp(input);
    } else if (isEmail(input)) {
      passwordError.textContent = 'OTP available for Phone only. Please use Password for Email.';
    } else {
      passwordError.textContent = 'Please enter a valid 10-digit phone number or email address';
    }
  });

  async function handleSendPhoneOtp(input) {
    sendOtpBtn.disabled = true;
    sendOtpBtn.textContent = 'Sending...';
    passwordError.textContent = '';
    
    const formattedPhone = formatPhone(input);

    try {
      otpInfo.textContent = 'Sending SMS via Twilio...';
      
      const response = await fetch('/api/send-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone })
      });
      
      const resData = await response.json();
      if (!response.ok || !resData.ok) {
        throw new Error(resData.message || 'Twilio send failed');
      }

      currentOtpMode = 'phone';
      otpInfo.textContent = 'SMS code sent to ' + formattedPhone;
      
      emailOtpStorage = { ...emailOtpStorage, phone: formattedPhone };
      
      switchToOtpMode();
    } catch (error) {
      console.error('OTP Error:', error);
      passwordError.textContent = error.message;
      sendOtpBtn.disabled = false;
      sendOtpBtn.textContent = 'Send OTP via Phone';
    }
  }  // --- EMAIL OTP HANDLER (Disabled) ---
  async function handleSendEmailOtp(input) {
    // Disabled as per requirement
    passwordError.textContent = 'Email OTP is not supported.';
  }

  // --- RESEND OTP HANDLER ---
  resendOtpBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    otpError.textContent = '';

    if (currentOtpMode === 'phone' && emailOtpStorage.phone) {
      resendOtpBtn.disabled = true;
      resendOtpBtn.textContent = 'Resending...';
      
      try {
        const response = await fetch('/api/send-phone-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: emailOtpStorage.phone })
        });
        
        const resData = await response.json();
        if (!response.ok || !resData.ok) {
          throw new Error(resData.message || 'Resend failed');
        }
        
        otpInfo.textContent = 'New code sent to ' + emailOtpStorage.phone;
      } catch (error) {
        console.error('Resend Error:', error);
        otpError.textContent = error.message;
      } finally {
        resendOtpBtn.disabled = false;
        resendOtpBtn.textContent = 'Resend Code';
      }
    } else {
      otpError.textContent = 'Session lost. Please try logging in again.';
    }
  });

  // --- VERIFY OTP HANDLER ---
  verifyOtpBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const code = otpCodeInput.value.trim();
    if (!code || code.length !== 6) return;

    verifyOtpBtn.disabled = true;
    verifyOtpBtn.textContent = 'Checking...';

    try {
      if (currentOtpMode === 'phone') {
        const response = await fetch('/api/verify-phone-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: emailOtpStorage.phone, otp: code })
        });
        const resData = await response.json();
        if (!response.ok || !resData.ok) throw new Error(resData.message || 'Invalid code');
        
        await loginToSheet({ phone: emailOtpStorage.phone });
      } else {
        const response = await fetch('/api/verify-email-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailOtpStorage.email, otp: code })
        });
        const resData = await response.json();
        if (!response.ok || !resData.ok) throw new Error(resData.message || 'Invalid code');
        
        await loginToSheet({ email: emailOtpStorage.email });
      }
    } catch (error) {
      otpError.textContent = error.message;
      verifyOtpBtn.disabled = false;
      verifyOtpBtn.textContent = 'Verify Code';
    }
  });

  async function loginToSheet(params) {
    const endpoint = params.phone ? '/api/login-phone' : '/api/login-email';
    const body = params.phone ? { phone: formatPhone(params.phone) } : { email: params.email };
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    // Parse the response so 'data' is defined
    const data = await response.json();

    if (!response.ok || !data.ok) throw new Error(data.message || 'Sync failed');

    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('activeTab', 'all'); // Default to All Courses
    window.location.href = data.user.role === 'admin' ? '/admin-portal/admin.html' : '/dashboard.html';
  }

  function switchToOtpMode() {
    passwordModeContainer.style.display = 'none';
    otpModeContainer.style.display = 'block';
    otpModeContainer.classList.add('fade-in');
    emailOrPhoneInput.readOnly = true;
    otpCodeInput.focus();
  }

  function switchToPasswordMode() {
    passwordModeContainer.style.display = 'block';
    otpModeContainer.style.display = 'none';
    emailOrPhoneInput.readOnly = false;
    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = 'Send OTP via Phone';
  }

  backToPasswordBtn.addEventListener('click', (e) => {
    e.preventDefault();
    switchToPasswordMode();
  });

  otpCodeInput.addEventListener('input', () => {
    if (otpCodeInput.value.length === 6) verifyOtpBtn.click();
  });

})();
