// LMS backend (CommonJS) — login + courses + assigned + completions + health
// Uses Google Sheet tabs & Firebase Storage URLs

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { google } = require('googleapis');

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

    const sheets = await sheetsClient();
    // Sheet1 layout: empid | phone | name | email | role | password | level | ...
    const rsp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Sheet1!A2:K'
    });

    const rows = rsp.data.values || [];
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

// ---------- GET /api/courses ----------
// Courses tab layout (A..J):
// A Main Category | B Subcategory | C Topic | D Video Title | E Description | F URL
// G duration_seconds | H type | I thumbnailUrl | J download (Yes/No)
app.get('/api/courses', async (req, res) => {
  try {
    const sheets = await sheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Courses!A2:J'
    });

    const rows = resp.data.values || [];
    const list = rows.map((r) => ({
      mainCategory: r[0] || '',
      subcategory: r[1] || '',
      topic: r[2] || '',
      title: r[3] || '',
      description: r[4] || '',
      url: r[5] || '',
      duration_seconds: Number(r[6] || 0),
      type: (r[7] || 'video').toLowerCase(),
      thumbnailUrl: r[8] || '',
      downloadAllowed: /^y(es)?$/i.test(String(r[9] || '').trim())
    }));

    res.json({ ok: true, data: list });
  } catch (e) {
    console.error('GET /api/courses error:', e.message);
    res.status(500).json({ ok: false, message: 'Failed to fetch courses' });
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

    // email -> name
    const nameByEmail = new Map();
    for (const r of userRows) {
      const name = (r[2] || '').trim(); // name
      const email = (r[3] || '').trim().toLowerCase(); // email
      if (email) nameByEmail.set(email, name);
    }

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
    if (!email || !message) {
      return res.status(400).json({ ok: false, message: 'Missing email / message' });
    }

    const sheets = await sheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Feedback!A2',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          new Date().toLocaleString(),
          String(email).trim(),
          String(name || '').trim(),
          String(message).trim()
        ]]
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/feedback error:', err);
    res.status(500).json({ ok: false, message: 'Failed to save feedback' });
  }
});
// ---------- GET /api/quizzes ----------
app.get('/api/quizzes', async (req, res) => {
  try {
    const sheets = await sheetsClient();
    const rsp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Quizzes!A2:D'
    });

    const rows = rsp.data.values || [];
    const list = rows.map(r => ({
      quiz_id:     r[0] || '',
      quiz_title:  r[1] || '',
      category:    r[2] || '',
      form_url:    r[3] || ''
    })).filter(q => q.quiz_id && q.quiz_title);

    res.json({ ok: true, data: list });
  } catch (err) {
    console.error('GET /api/quizzes error:', err);
    res.status(500).json({ ok: false, message: 'Failed to fetch quizzes' });
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
    last_seen_at = String(last_seen_at || new Date().toISOString());

    if (!email || !title) {
      return res.status(400).json({ ok: false, message: 'Missing email/title' });
    }

    const isCompleted =
      autoCompleted === 'TRUE' ||
      percent_watched >= 95 ||
      status.toLowerCase() === 'completed';

    if (isCompleted) {
      autoCompleted = 'TRUE';
      status = 'Completed';
      percent_watched = 100;
    } else if (autoCompleted === 'AUTO') {
      autoCompleted = '';
    }

    const key = `${email}|${title}`;
    const now = Date.now();
    const last = lastWrite.get(key) || 0;
    if (!isCompleted && now - last < MIN_WRITE_MS) {
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
            new Date().toLocaleString(), // A Timestamp
            email, // B Email
            title, // C Course Title
            category, // D Category
            Number.isFinite(watchedSeconds) ? watchedSeconds : 0, // E Watched Seconds
            autoCompleted || '', // F Auto Completed
            status || 'Manual', // G status
            Number.isFinite(last_position_s) ? last_position_s : '', // H last_position_s
            Number.isFinite(percent_watched) ? percent_watched : '', // I percent_watched
            last_seen_at // J last_seen_at
          ]
        ]
      }
    });

    res.json({ ok: true, completed: isCompleted });
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
