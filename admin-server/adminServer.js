// Admin API (ESM) — upload to Firebase Storage and append to Google Sheet
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dayjs from 'dayjs';
import { google } from 'googleapis';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Google Sheets (service account via PEM) ----------
const pemPath = path.join(__dirname, process.env.PRIVATE_KEY_PATH || 'private_key.pem');
const privateKey = fs.existsSync(pemPath) ? fs.readFileSync(pemPath, 'utf8') : undefined;

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

// ---------- Firebase Admin (Storage via JSON) ----------
const fbJsonPath = path.join(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'firebase-admin.json');
const fbServiceAccount = JSON.parse(fs.readFileSync(fbJsonPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(fbServiceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET // e.g. learnfast-i1x01.firebasestorage.app
});
const bucket = admin.storage().bucket();

// ---------- Email (optional) ----------
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

// ---------- Uploads ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 } // 1 GB
});

// ---------- Routes ----------
app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// List courses (A..I)
app.get('/admin/courses', async (_req, res) => {
  try {
    const sheets = await sheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Courses!A2:I'
    });
    const rows = resp.data.values || [];
    const data = rows.map(r => ({
      mainCategory: r[0] || '',
      subcategory: r[1] || '',
      topic: r[2] || '',
      title: r[3] || '',
      description: r[4] || '',
      url: r[5] || '',
      duration_seconds: Number(r[6] || 0),
      type: (r[7] || 'video').toLowerCase(),
      thumbnailUrl: r[8] || ''
    }));
    res.json({ success: true, data });
  } catch (e) {
    console.error('GET /admin/courses failed:', e.message);
    res.status(500).json({ success: false, message: 'Failed to fetch courses' });
  }
});

// Upload file to Firebase + append one row to Courses
app.post('/admin/upload-course', upload.single('file'), async (req, res) => {
  try {
    const {
      mainCategory = '',
      subcategory = '',
      topic = '',
      title = '',
      description = '',
      type = 'video',
      thumbnailUrl = '',
      duration_seconds = ''
    } = req.body || {};

    if (!req.file) return res.status(400).json({ success: false, message: 'Missing file' });

    const t = String(type).toLowerCase();
    const ct = t === 'pdf' ? 'application/pdf' : t === 'html' ? 'text/html' : 'video/mp4';
    const ext = t === 'pdf' ? '.pdf' : t === 'html' ? '.html'
      : path.extname(req.file.originalname).toLowerCase() || '.mp4';

    // organize by mainCategory/subcategory in storage
    const safeMain = (mainCategory || 'General').replace(/[^\w-]+/g, '_');
    const safeSub  = (subcategory || 'General').replace(/[^\w-]+/g, '_');
    const safeTitle = (title || 'asset').replace(/[^\w-]+/g, '_');
    const filename = `courses/${safeMain}/${safeSub}/${Date.now()}_${safeTitle}${ext}`;
    const file = bucket.file(filename);
    const token = uuidv4();

    await file.save(req.file.buffer, {
      contentType: ct,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } }
    });

    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filename)}?alt=media&token=${token}`;

    const sheets = await sheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Courses!A2',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          mainCategory, subcategory, topic, title, description,
          publicUrl, (t === 'video' ? duration_seconds : ''), t, thumbnailUrl
        ]]
      }
    });

    res.json({ success: true, url: publicUrl, type: t });
  } catch (e) {
    console.error('POST /admin/upload-course failed:', e);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// Assign a course
app.post('/admin/assign', async (req, res) => {
  const { email, title, mainCategory = '', subcategory = '', due_date = '', assigned_by = '' } = req.body || {};
  if (!email || !title) return res.status(400).json({ success: false, message: 'email and title required' });
  try {
    const sheets = await sheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: 'AssignedCourses!A2',
      valueInputOption: 'RAW',
      requestBody: { values: [[email, title, mainCategory, subcategory, due_date, 'Assigned', assigned_by]] }
    });
    res.json({ success: true });
  } catch (e) {
    console.error('POST /admin/assign failed:', e.message);
    res.status(500).json({ success: false, message: 'Failed to assign' });
  }
});

// Nudges (optional email)
app.post('/admin/reminders/run', async (_req, res) => {
  try {
    if (!transporter) return res.json({ success: true, nudged: 0, note: 'SMTP not configured' });

    const sheets = await sheetsClient();
    const [assignR, compR] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SHEET_ID, range: 'AssignedCourses!A2:G' }),
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SHEET_ID, range: 'Completions!A2:J' })
    ]);
    const assigns = (assignR.data.values || []).map(r => ({ email: r[0], title: r[1], due: r[4], status: r[5] || 'Assigned' }));
    const comps   = (compR.data.values || []).map(r => ({ email: r[1], title: r[2], status: r[6] || 'In Progress', last_seen_at: r[9] || '' }));

    const now = dayjs();
    const idleDays = 7;
    const toNudge = assigns.filter(a => {
      const done = comps.find(c => c.email === a.email && c.title === a.title && c.status === 'Completed');
      if (done) return false;
      const comp = comps.find(c => c.email === a.email && c.title === a.title);
      const last = comp?.last_seen_at ? dayjs(comp.last_seen_at) : null;
      const idle = last ? now.diff(last, 'day') >= idleDays : true;
      const overdue = a.due ? now.isAfter(dayjs(a.due)) : false;
      return idle || overdue;
    });

    for (const item of toNudge) {
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: item.email,
        subject: `Reminder: ${item.title}`,
        html: `Hi,<br/>Please continue <b>${item.title}</b>.`
      });
    }
    res.json({ success: true, nudged: toNudge.length });
  } catch (e) {
    console.error('POST /admin/reminders/run failed:', e.message);
    res.status(500).json({ success: false, message: 'Failed to send reminders' });
  }
});

// ---------- Start ----------
const PORT = Number(process.env.PORT || 3002);
app.listen(PORT, () => console.log('Admin server running on', PORT));
