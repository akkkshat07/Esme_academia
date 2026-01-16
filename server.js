// LMS backend (CommonJS) � login + courses + assigned + completions + health
// Uses Google Sheet tabs & Firebase Storage URLs

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { google } = require('googleapis');
const twilio = require('twilio');

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- Google Sheets (Service Account via PEM) ----------
const privateKeyPath = path.join(
  process.cwd(),
  process.env.PRIVATE_KEY_PATH || 'private_key.pem'
);
if (!fs.existsSync(privateKeyPath)) {
  console.error(`[BOOT] PRIVATE_KEY_PATH not found at: ${privateKeyPath}`);
}
const privateKey = fs.existsSync(privateKeyPath)
  ? fs.readFileSync(privateKeyPath, 'utf8')
  : undefined;

const sheetsAuth = new google.auth.GoogleAuth({
  credentials: {
    type: 'service_account',
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: privateKey,
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

async function sheetsClient() {
  const client = await sheetsAuth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

// ---------- Helpers ----------
function isEmail(s) {
  return /@/.test(String(s || '').trim());
}
function normPhone(s) {
  return String(s || '').replace(/[^\d]/g, '');
}

// ---------- Health ----------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ---------- POST /api/login ----------
app.post('/api/login', async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body || {};
    if (!emailOrPhone || !password) {
      return res
        .status(400)
        .json({ ok: false, message: 'Missing credentials' });
    }

    let rows = [];
    const now = Date.now();

    // Check Users Cache
    if (CACHE.users.data && CACHE.users.expiry > now) {
      console.log('Using cached users for login');
      rows = CACHE.users.data;
    } else {
      const sheets = await sheetsClient();
      // Sheet1 layout: empid | phone | name | email | role | password | level | ...
      const rsp = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'Sheet1!A2:K'
      });
      rows = rsp.data.values || [];
      // Update Cache
      CACHE.users.data = rows;
      CACHE.users.expiry = now + USERS_CACHE_TTL;
    }

    const idOrPhone = normPhone(emailOrPhone);

    const user = rows.find((r) => {
      const empid = (r[0] || '').trim();
      const phone = normPhone(r[1] || '');
      const name = (r[2] || '').trim();
      const email = (r[3] || '').trim().toLowerCase();
      const role = (r[4] || '').trim().toLowerCase();
      const pw = (r[5] || '').trim();

      const match =
        (isEmail(emailOrPhone) &&
          email &&
          email === emailOrPhone.toLowerCase()) ||
        (!isEmail(emailOrPhone) &&
          ((phone && phone === idOrPhone) || empid === emailOrPhone));

      if (match) {
        r._parsed = { empid, phone, name, email, role, pw };
        return true;
      }
      return false;
    });

    if (!user || !user._parsed) {
      return res.status(401).json({ ok: false, message: 'User not found' });
    }
    if (user._parsed.pw !== String(password)) {
      return res.status(401).json({ ok: false, message: 'Invalid password' });
    }

    res.json({
      ok: true,
      user: {
        empid: user._parsed.empid,
        name: user._parsed.name,
        email: user._parsed.email,
        phone: user._parsed.phone,
        role: user._parsed.role
      }
    });
  } catch (err) {
    console.error('POST /api/login error:', err);
    res.status(500).json({ ok: false, message: 'Login failed' });
  }
});

// ========== PHONE LOGIN WITH OTP ==========
app.post('/api/login-phone', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ ok: false, message: 'Missing phone number' });

    // CACHE ONLY
    const rows = CACHE.users.data || [];
    const normalizedPhone = normPhone(phone);
    
    // ...existing code...

    const user = rows.find((r) => {
      const empid = (r[0] || '').trim();
      const userPhone = normPhone(r[1] || '');
      const name = (r[2] || '').trim();
      const email = (r[3] || '').trim().toLowerCase();
      const role = (r[4] || '').trim().toLowerCase();

      // Relaxed phone check: if the sheet phone ends with 'phone' or 'phone' ends with sheet phone
      // Because input might be +91... and sheet might be 91... or just 10 digits
      if (userPhone && normalizedPhone && (userPhone.endsWith(normalizedPhone) || normalizedPhone.endsWith(userPhone))) {
        r._parsed = { empid, phone: userPhone, name, email, role };
        return true;
      }
      return false;
    });

    if (!user || !user._parsed) {
      return res.status(401).json({ ok: false, message: 'User not found' });
    }

    res.json({
      ok: true,
      user: {
        empid: user._parsed.empid,
        name: user._parsed.name,
        email: user._parsed.email,
        phone: user._parsed.phone,
        role: user._parsed.role
      }
    });
  } catch (err) {
    console.error('POST /api/login-phone error:', err);
    res.status(500).json({ ok: false, message: 'Phone login failed' });
  }
});

// ========== EMAIL LOGIN WITH OTP ==========
app.post('/api/login-email', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, message: 'Missing email' });

    // CACHE ONLY
    const rows = CACHE.users.data || [];
    const normalizedEmail = email.toLowerCase().trim();
    
    // ...existing code...

    const user = rows.find((r) => {
      const empid = (r[0] || '').trim();
      const phone = normPhone(r[1] || '');
      const name = (r[2] || '').trim();
      const userEmail = (r[3] || '').trim().toLowerCase();
      const role = (r[4] || '').trim().toLowerCase();

      if (userEmail && userEmail === normalizedEmail) {
        r._parsed = { empid, phone, name, email: userEmail, role };
        return true;
      }
      return false;
    });

    if (!user || !user._parsed) {
      return res.status(401).json({ ok: false, message: 'User not found' });
    }

    res.json({
      ok: true,
      user: {
        empid: user._parsed.empid,
        name: user._parsed.name,
        email: user._parsed.email,
        phone: user._parsed.phone,
        role: user._parsed.role
      }
    });
  } catch (err) {
    console.error('POST /api/login-email error:', err);
    res.status(500).json({ ok: false, message: 'Email login failed' });
  }
});

// ========== EMAIL OTP SYSTEM (Production Modular Setup) ==========
const otpStore = {}; // Stores OTPs for email
const phoneOtpStore = {}; // Stores OTPs for phone

app.post('/api/send-email-otp', async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) {
      return res.status(400).json({ ok: false, message: 'Missing email or otp' });
    }

    // Store OTP with 10-minute expiry
    otpStore[email] = {
      otp: otp.toString(),
      expiresAt: Date.now() + 10 * 60 * 1000
    };

    // Log to terminal for local simulation (Production would use an email service)
    console.log(`\n---------------------------------`);
    console.log(`[EMAIL VERIFICATION CODE] for ${email}: ${otp}`);
    console.log(`---------------------------------\n`);

    res.json({ ok: true, message: 'Email OTP simulated' });
  } catch (err) {
    console.error('POST /api/send-email-otp error:', err);
    res.status(500).json({ ok: false, message: 'Failed to process email OTP' });
  }
});

app.post('/api/verify-email-otp', async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!otpStore[email]) {
      return res.status(400).json({ ok: false, message: 'No verification record found' });
    }

    const record = otpStore[email];
    if (Date.now() > record.expiresAt) {
      delete otpStore[email];
      return res.status(401).json({ ok: false, message: 'Code expired' });
    }

    if (record.otp !== otp.toString()) {
      return res.status(401).json({ ok: false, message: 'Invalid verification code' });
    }

    delete otpStore[email];
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/verify-email-otp error:', err);
    res.status(500).json({ ok: false, message: 'Verification failed' });
  }
});

// ========== SMS SETUP (Fast2SMS / DLT) ==========
// Note: Requires FAST2SMS_API_KEY in .env

async function sendFast2SMS(phone, otp) {
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey) {
      console.error('[SMS] FAST2SMS_API_KEY is missing in .env');
      return false;
    }

    // Official Fast2SMS Bulk V2 API
    const url = 'https://www.fast2sms.com/dev/bulkV2';
    
    // Using 'otp' route (Quick Send) which is standard for OTPs
    const params = new URLSearchParams();
    params.append('authorization', apiKey);
    params.append('route', 'otp');
    params.append('variables_values', otp);
    params.append('flash', '0');
    params.append('numbers', phone.replace(/[^\d]/g, '')); // only digits

    try {
      console.log(`[Fast2SMS] Sending OTP to ${phone}...`);
      const response = await fetch(`${url}?${params.toString()}`, { method: 'GET' });
      const data = await response.json();
      console.log('[Fast2SMS] Response:', data);
      return data.return === true;
    } catch (err) {
      console.error('[Fast2SMS] Failed:', err);
      return false;
    }
}

// ========== MSG91 SMS SETUP (Recommended API Method) ==========
// Docs: https://docs.msg91.com/p/tf9Ght1u9a/c/BvIAdk1u2s/SEND-OTP-SMS

// const msg91 = require("msg91").default; // Deprecated in favor of fetch for debugging
// let isMsg91Initialized = false;

async function sendMsg91(phone, otp) {
    const authKey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;

    if (!authKey || !templateId) {
        console.error('[MSG91] Error: MSG91_AUTH_KEY or MSG91_TEMPLATE_ID missing in .env');
        return false;
    }

    // Ensure phone number starts with 91 for India
    let cleanPhone = phone.toString().replace(/\D/g, '');
    if (!cleanPhone.startsWith('91') && cleanPhone.length === 10) {
        cleanPhone = '91' + cleanPhone;
    }

    try {
        console.log(`[MSG91] Sending OTP to: ${cleanPhone}`);
        console.log(`[MSG91] Template ID: ${templateId}`);
        
        // Use MSG91 Flow API (correct endpoint per MSG91 support)
        const url = `https://control.msg91.com/api/v5/flow?authkey=${authKey.trim()}&accept=application/json&content-type=application/json`;
        
        const payload = {
            template_id: templateId.trim(),
            recipients: [
                {
                    mobiles: cleanPhone,
                    var1: otp
                }
            ]
        };

        console.log('[MSG91] Request URL:', url);
        console.log('[MSG91] Request Body:', JSON.stringify(payload, null, 2));

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const textResponse = await response.text();
        console.log('[MSG91] Response:', textResponse);
        
        let data;
        try {
            data = JSON.parse(textResponse);
        } catch (e) {
            data = { type: 'unknown', message: textResponse };
        }

        // Check for success indicators
        if (data.type === 'success' || data.success === true || (data.message && data.message.includes('success'))) {
            console.log(`[MSG91] ✓ OTP sent to ${cleanPhone}`);
            return true;
        } else if (response.ok) {
            // If HTTP 200 but not explicit success, still consider it sent
            console.log(`[MSG91] ✓ OTP sent to ${cleanPhone} (HTTP ${response.status})`);
            return true;
        } else {
            console.error('[MSG91] Error:', data);
            return false;
        }
    } catch (err) {
        console.error('[MSG91] Handler Error:', err);
        return false;
    }
}

// ========== PHONE OTP ROUTES ==========

app.post('/api/send-phone-otp', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) {
      return res.status(400).json({ ok: false, message: 'Missing phone number' });
    }

    const normalizedPhone = phone.startsWith('+') ? phone : '+' + phone;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in memory (10 min expiry)
    phoneOtpStore[normalizedPhone] = {
      otp: otp,
      expiresAt: Date.now() + 10 * 60 * 1000
    };

    // Send via MSG91
    await sendMsg91(normalizedPhone, otp);
    
    res.json({ ok: true, message: 'OTP sent via MSG91' });
  } catch (err) {
    console.error('POST /api/send-phone-otp error:', err);
    res.status(500).json({ ok: false, message: 'Failed to send OTP' });
  }
});

app.post('/api/verify-phone-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body || {};
    if (!phone || !otp) {
      return res.status(400).json({ ok: false, message: 'Missing phone or otp' });
    }
    
    const normalizedPhone = phone.startsWith('+') ? phone : '+' + phone;
    const record = phoneOtpStore[normalizedPhone];

    if (!record) {
      return res.status(400).json({ ok: false, message: 'No verification record found' }); // Or expired/never sent
    }

    if (Date.now() > record.expiresAt) {
      delete phoneOtpStore[normalizedPhone];
      return res.status(401).json({ ok: false, message: 'Code expired' });
    }

    if (record.otp !== otp.toString()) {
      return res.status(401).json({ ok: false, message: 'Invalid verification code' });
    }

    // Success
    delete phoneOtpStore[normalizedPhone];
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/verify-phone-otp error:', err);
    res.status(500).json({ ok: false, message: 'Verification failed' });
  }
});

// Helper to detect language from content text
function detectLanguage(row) {
  // Row indices: 1=Subcategory, 2=Topic, 3=Title
  const text = ((row[1] || '') + ' ' + (row[2] || '') + ' ' + (row[3] || '')).toLowerCase();
  
  // Check for specific languages
  const languages = ['Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Marathi'];
  for (const lang of languages) {
    if (text.includes(lang.toLowerCase())) {
      return lang;
    }
  }
  return 'English';
}

// ---------- GET /api/courses ----------
app.get('/api/courses', async (req, res) => {
  try {
    const sheets = await sheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Courses!A2:J'
    });

    const rows = resp.data.values || [];
    const list = rows.map((r) => {
      const lang = detectLanguage(r);
      return {
        mainCategory: r[0] || '',
        subcategory: r[1] || '',
        topic: r[2] || '',
        title: r[3] || '',
        description: r[4] || '',
        url: r[5] || '',
        duration_seconds: Number(r[6] || 0),
        type: (r[7] || 'video').toLowerCase(),
        thumbnailUrl: r[8] || '',
        downloadAllowed: /^y(es)?$/i.test(String(r[9] || '').trim()),
        language: lang
      }
    });

    res.json({ ok: true, data: list });
  } catch (e) {
    console.error('GET /api/courses error:', e.message);
    res.status(500).json({ ok: false, message: 'Failed to fetch courses' });
  }
});

// ---------- GET /api/languages ----------
// Get all available languages
app.get('/api/languages', async (req, res) => {
  // Since language is derived from content, we return fixed options we support detecting
  res.json({ ok: true, data: ['English', 'Hindi'] });
});

// ---------- Caching Mechanism ----------
const CACHE = {
  leaderboard: { data: null, expiry: 0 },
  courses: { data: null, expiry: 0 },
  quizzes: { data: null, expiry: 0 },
  users: { data: null, expiry: 0 }, // Added users cache
  assigned: {}, // Map key (email) -> { data: ..., expiry: ... }
  assignedQuizzes: {}, // Map key (email) -> { data: ..., expiry: ... } 
  quizMaster: { data: null, expiry: 0 } // Cache quiz master list separate from assigned
};

const CACHE_TTL = 60 * 1000; // 60 seconds
const USERS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for users

// ---------- GET /api/courses/filter?language=... ----------
// Filter courses by language
app.get('/api/courses/filter', async (req, res) => {
  try {
    const language = String(req.query.language || 'English').trim();
    const now = Date.now();

    // Check Cache
    if (CACHE.courses.data && CACHE.courses.expiry > now) {
      console.log('Serving courses from cache');
      const cachedList = CACHE.courses.data.filter(item => item.language === language);
      return res.json({ ok: true, data: cachedList });
    }

    const sheets = await sheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Courses!A2:J'
    });

    const rows = resp.data.values || [];
    const list = rows.map((r) => {
        const lang = detectLanguage(r);
        return {
          mainCategory: r[0] || '',
          subcategory: r[1] || '',
          topic: r[2] || '',
          title: r[3] || '',
          description: r[4] || '',
          url: r[5] || '',
          duration_seconds: Number(r[6] || 0),
          type: (r[7] || 'video').toLowerCase(),
          thumbnailUrl: r[8] || '',
          downloadAllowed: /^y(es)?$/i.test(String(r[9] || '').trim()),
          language: lang
        };
    });

    // Update Cache
    CACHE.courses.data = list;
    CACHE.courses.expiry = now + CACHE_TTL;

    const filteredList = list.filter(item => item.language === language);
    res.json({ ok: true, data: filteredList });

  } catch (e) {
    console.error('GET /api/courses/filter error:', e.message);
    res.status(500).json({ ok: false, message: 'Failed to filter courses' });
  }
});

// ---------- GET /api/assigned?email=... (email OR phone) ----------
// AssignedCourses layout:
// A Email
// B Phone
// C Video Title
// D Main Category
// E Subcategory
// F due_date
// G status
// H assigned_by
// I course_url  (direct video URL; if blank, falls back to Courses sheet)
app.get('/api/assigned', async (req, res) => {
  try {
    const qRaw = String(req.query.email || '').trim();
    if (!qRaw) {
      return res
        .status(400)
        .json({ ok: false, message: 'Missing email/phone' });
    }

    const qLower = qRaw.toLowerCase();
    const qPhone = normPhone(qRaw);
    const qIsPhone = !isEmail(qRaw) && qPhone.length >= 6;

    const sheets = await sheetsClient();

    const [coursesRsp, assignRsp] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'Courses!A2:J'
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'AssignedCourses!A2:I'
      })
    ]);

    // Build lookup for courses by Video Title (case-insensitive)
    const coursesRows = coursesRsp.data.values || [];
    const courseByTitle = new Map();
    for (const r of coursesRows) {
      const mainCategory = r[0] || '';
      const subcategory = r[1] || '';
      const topic = r[2] || '';
      const title = (r[3] || '').trim();
      const description = r[4] || '';
      const url = r[5] || '';
      const duration_seconds = Number(r[6] || 0);
      const type = (r[7] || 'video').toLowerCase();
      const thumbnailUrl = r[8] || '';
      const downloadAllowed = /^y(es)?$/i.test(String(r[9] || '').trim());
      if (title) {
        courseByTitle.set(title.toLowerCase(), {
          mainCategory,
          subcategory,
          topic,
          title,
          description,
          url,
          duration_seconds,
          type,
          thumbnailUrl,
          downloadAllowed
        });
      }
    }

    const assignRows = assignRsp.data.values || [];
    const assigned = [];

    for (const r of assignRows) {
      const email = String(r[0] || '').trim().toLowerCase();
      const phone = normPhone(r[1] || '');
      const videoTitle = String(r[2] || '').trim();
      const sheetMainCat = String(r[3] || '').trim();
      const sheetSubcat = String(r[4] || '').trim();
      const due_date = String(r[5] || '').trim();
      const status = String(r[6] || '').trim() || 'Assigned';
      // r[7] assigned_by is ignored here
      const courseUrl = String(r[8] || '').trim(); // I course_url

      if (!videoTitle) continue;

      // match this row to current user
      let match = false;
      if (qIsPhone) {
        match = phone && (phone === qPhone || phone.endsWith(qPhone));
      } else {
        match = email && email === qLower;
      }
      if (!match) continue;

      const base = courseByTitle.get(videoTitle.toLowerCase()) || {};

      const course = {
        mainCategory: sheetMainCat || base.mainCategory || '',
        subcategory: sheetSubcat || base.subcategory || '',
        topic: base.topic || '',
        title: videoTitle,
        description: base.description || '',
        url: courseUrl || base.url || '',
        duration_seconds: base.duration_seconds || 0,
        type: base.type || 'video',
        thumbnailUrl: base.thumbnailUrl || '',
        downloadAllowed: !!base.downloadAllowed,
        due_date,
        status,
        assigned: true
      };

      assigned.push(course);
    }

    res.json({ ok: true, data: assigned });
  } catch (e) {
    console.error('GET /api/assigned error:', e.message);
    res.status(500).json({ ok: false, message: 'Failed to fetch assigned courses' });
  }
});

// ---------- GET /api/leaderboard ----------
app.get('/api/leaderboard', async (req, res) => {
  try {
    const now = Date.now();
    if (CACHE.leaderboard.data && CACHE.leaderboard.expiry > now) {
       console.log('Serving leaderboard from cache');
       return res.json({ ok: true, data: CACHE.leaderboard.data });
    }

    const sheets = await sheetsClient();

    const [compRsp, usersRsp] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'Completions!A2:J'
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'Sheet1!A2:K'
      })
    ]);

    const compRows = compRsp.data.values || [];
    const userRows = usersRsp.data.values || [];

    console.log(`Leaderboard: ${compRows.length} completions, ${userRows.length} users`);

    // email -> name
    const nameByEmail = new Map();
    for (const r of userRows) {
      const name = (r[2] || '').trim(); // name
      const email = (r[3] || '').trim().toLowerCase(); // email
      if (email) nameByEmail.set(email, name);
    }

    console.log(`Found ${nameByEmail.size} unique users`);

    // aggregate
    const stats = new Map(); // email -> {seconds, courses:Set}
    for (const r of compRows) {
      const email = String(r[1] || '').trim().toLowerCase(); // B Email
      const title = String(r[2] || '').trim();               // C Title
      const seconds = Number(r[4] || 0);                     // E WatchedSeconds
      const status = String(r[6] || '').trim().toLowerCase();// G status

      if (!email || !title) continue;
      if (status !== 'completed') continue;
      if (!Number.isFinite(seconds) || seconds <= 0) continue;

      let s = stats.get(email);
      if (!s) {
        s = { seconds: 0, courses: new Set() };
        stats.set(email, s);
      }
      s.seconds += seconds;
      s.courses.add(title);
    }

    console.log(`Aggregated ${stats.size} users with completed courses`);

    const rows = Array.from(stats.entries()).map(([email, s]) => {
      const hours = s.seconds / 3600;
      const courseCount = s.courses.size;
      return {
        email,
        name: nameByEmail.get(email) || email,
        totalSeconds: s.seconds,
        hours: Number(hours.toFixed(2)),
        courseCount
      };
    });

    // sort: hours desc, then courseCount desc
    rows.sort((a, b) => {
      if (b.hours !== a.hours) return b.hours - a.hours;
      return b.courseCount - a.courseCount;
    });

    const top = rows.slice(0, 10).map((row, idx) => {
      let medal = null;
      if (idx === 0) medal = 'gold';
      else if (idx === 1) medal = 'silver';
      else if (idx === 2) medal = 'bronze';

      return {
        rank: idx + 1,
        medal,
        ...row
      };
    });

    console.log(`Returning top ${top.length} leaderboard entries`);
    res.json({ ok: true, data: top });
  } catch (err) {
    console.error('GET /api/leaderboard error:', err);
    res.status(500).json({ ok: false, message: 'Failed to compute leaderboard' });
  }
});
// ---------- POST /api/feedback ----------
app.post('/api/feedback', async (req, res) => {
  try {
    const { email, name, message } = req.body || {};
    console.log('Feedback received:', { email, name, message });
    
    if (!email || !message) {
      console.warn('Feedback validation failed - missing email or message');
      return res.status(400).json({ ok: false, message: 'Missing email / message' });
    }

    let savedToSheets = false;
    try {
        const sheets = await sheetsClient();
        const appendResp = await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.SHEET_ID,
          range: 'Feedback!A2',
          valueInputOption: 'RAW',
          requestBody: {
            values: [[
              new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
              String(email).trim(),
              String(name || '').trim(),
              String(message).trim()
            ]]
          }
        });
        savedToSheets = true;
        console.log('Feedback saved to Google Sheets:', appendResp.data);
    } catch (sheetErr) {
        console.warn('Google Sheets feedback save failed:', sheetErr.message);
        const logLine = JSON.stringify({
            date: new Date().toISOString(),
            email,
            name,
            message
        }) + '\n';
        try {
          fs.appendFileSync(path.join(__dirname, 'feedback_backup.jsonl'), logLine);
          console.log('Feedback saved to backup file');
        } catch (fileErr) {
          console.error('Failed to save feedback backup:', fileErr.message);
        }
    }

    res.json({ ok: true, savedToSheets });
  } catch (err) {
    console.error('POST /api/feedback error:', err);
    res.status(500).json({ ok: false, message: 'Failed to save feedback' });
  }
});
// ---------- GET /api/quizzes ----------
app.get('/api/quizzes', async (req, res) => {
  try {
     // CACHE ONLY
     res.json({ ok: true, data: CACHE.quizzes.data || [] });
  } catch (err) {
    console.error('GET /api/quizzes error:', err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// ---------- GET /api/assigned-quizzes ----------
app.get('/api/assigned-quizzes', async (req, res) => {
  try {
    const q = String(req.query.email || '').trim().toLowerCase();
    if (!q) return res.status(400).json({ ok: false, message: 'Missing email/phone' });

    const sheets = await sheetsClient();

    const [quizMasterRsp, assignedRsp] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'Quizzes!A2:D'
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'AssignedQuizzes!A2:I'
      })
    ]);

    const quizRows = quizMasterRsp.data.values || [];
    const assignedRows = assignedRsp.data.values || [];

    // quiz_id -> quiz meta
    const byId = new Map();
    for (const r of quizRows) {
      const id = (r[0] || '').trim();
      if (!id) continue;
      byId.set(id, {
        quiz_id: id,
        quiz_title: r[1] || '',
        category:   r[2] || '',
        form_url:   r[3] || ''
      });
    }

    const qIsPhone = /^\d{6,}$/.test(q);
    const result = [];

    for (const r of assignedRows) {
      const email = String(r[0] || '').trim().toLowerCase(); // A Email
      const phone = String(r[1] || '').replace(/[^\d]/g, ''); // B Phone
      const quiz_id   = (r[2] || '').trim();                  // C quiz_id
      const quiz_title = (r[3] || '').trim();                 // D title
      const due_date  = (r[4] || '').trim();                  // E due_date
      const status    = (r[5] || '').trim();                  // F status

      const match = qIsPhone ? (phone && phone.endsWith(q)) : (email && email === q);
      if (!match) continue;

      const meta = byId.get(quiz_id) || {
        quiz_id,
        quiz_title,
        category: '',
        form_url: ''
      };

      result.push({
        ...meta,
        due_date,
        status
      });
    }

    res.json({ ok: true, data: result });
  } catch (err) {
    console.error('GET /api/assigned-quizzes error:', err);
    res.status(500).json({ ok: false, message: 'Failed to fetch assigned quizzes' });
  }
});

// ---------- POST /api/track  (writes one row to Completions A..J) ----------
const lastWrite = new Map(); // throttle spam: key=email|title, value=ms
const MIN_WRITE_MS = 10_000; // 10s between rows per (email,title)

app.post('/api/track', async (req, res) => {
  try {
    let {
      email = '',
      title = '',
      category = '',
      watchedSeconds = 0,
      autoCompleted = '',
      status = 'Manual',
      last_position_s = 0,
      percent_watched = 0,
      last_seen_at = ''
    } = req.body || {};

    email = String(email || '').trim();
    title = String(title || '').trim();
    category = String(category || '').trim();
    watchedSeconds = Number(watchedSeconds || 0);
    last_position_s = Number(last_position_s || watchedSeconds || 0);
    percent_watched = Number(percent_watched || 0);
    autoCompleted = String(autoCompleted || '').toUpperCase();
    status = String(status || 'Manual').trim();
    last_seen_at = String(last_seen_at || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));

    if (!email || !title) {
      return res.status(400).json({ ok: false, message: 'Missing email/title' });
    }

    // Simplified Completion Logic (User Requirement: 100% threshold, skip everything else)
    const isCompleted = percent_watched >= 100;

    if (!isCompleted) {
      // User requested to not update anything if criteria not met
      return res.json({ ok: true, message: 'Not yet at 100% completion threshold. Record skipped.', completed: false });
    }

    // If we reached here, it is >= 65%
    const finalStatus = 'Completed';
    const finalPercent = percent_watched;
    autoCompleted = 'TRUE';

    const key = `${email}|${title}`;
    const now = Date.now();
    const last = lastWrite.get(key) || 0;
    
    // For completed records, we might still want to throttle if the same video ends multiple times 
    // but usually, once it's completed, we can write it.
    if (now - last < MIN_WRITE_MS) {
      return res.json({ ok: true, throttled: true });
    }
    lastWrite.set(key, now);

    const sheets = await sheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Completions!A2',
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          [
            new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), // A Timestamp (IST)
            email, // B Email
            title, // C Course Title
            category, // D Category
            Number.isFinite(watchedSeconds) ? watchedSeconds : 0, // E Watched Seconds
            autoCompleted || '', // F Auto Completed
            finalStatus, // G status
            Number.isFinite(last_position_s) ? last_position_s : '', // H last_position_s
            finalPercent, // I percent_watched
            last_seen_at // J last_seen_at
          ]
        ]
      }
    });

    res.json({ ok: true, completed: true });
  } catch (e) {
    console.error('POST /api/track error:', e);
    res.status(500).json({ ok: false, message: 'Failed to write completion' });
  }
});

// ---------- Start ----------
const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
