// Admin API (ESM) – upload to Firebase Storage and append to Google Sheet
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
import { GoogleGenerativeAI } from '@google/generative-ai';
import MarkdownIt from 'markdown-it';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Google Sheets (service account via PEM) ----------
const pemPath = path.join(__dirname, process.env.PRIVATE_KEY_PATH || 'private_key.pem');
let privateKey;
try {
  if (fs.existsSync(pemPath)) {
    privateKey = fs.readFileSync(pemPath, 'utf8');
  } else {
    console.warn('[Warning] private_key.pem not found. Google Sheets integration disabled.');
  }
} catch (e) {
  console.warn('[Warning] Failed to read private_key.pem:', e.message);
}

const sheetsAuth = new google.auth.GoogleAuth({
  credentials: {
    type: 'service_account',
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: privateKey, // May be undefined
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
async function sheetsClient() {
  if (!privateKey) throw new Error('Google Sheets disabled (missing private key)');
  const client = await sheetsAuth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

// ---------- Firebase Admin (Storage via JSON) ----------
const fbJsonPath = path.join(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'firebase-admin.json');
let bucket = null;

try {
  if (fs.existsSync(fbJsonPath)) {
    const fbServiceAccount = JSON.parse(fs.readFileSync(fbJsonPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(fbServiceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    bucket = admin.storage().bucket();
    console.log('[Info] Firebase Admin initialized.');
  } else {
    console.warn('[Warning] firebase-admin.json not found. Firebase Storage disabled.');
  }
} catch (e) {
  console.warn('[Warning] Failed to initialize Firebase:', e.message);
}

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

// ---------- Competencies Data (Simple CSV Load) ----------
const compPath = path.join(__dirname, '../RSM & ASM Competencies.xlsx - RSM (1).csv');
let competencies = [];

function parseCSV(content) {
  const rows = [];
  let curRow = [];
  let curField = '';
  let inQuote = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i+1];
    if (c === '"') {
      if (inQuote && next === '"') { curField += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (c === ',' && !inQuote) {
      curRow.push(curField.trim());
      curField = '';
    } else if ((c === '\r' || c === '\n') && !inQuote) {
      if (c === '\r' && next === '\n') i++;
      curRow.push(curField.trim());
      if (curRow.length > 0) rows.push(curRow);
      curRow = [];
      curField = '';
    } else {
      curField += c;
    }
  }
  if (curField || curRow.length) {
    curRow.push(curField.trim());
    rows.push(curRow);
  }
  return rows;
}

if (fs.existsSync(compPath)) {
  try {
    const raw = fs.readFileSync(compPath, 'utf8');
    const rows = parseCSV(raw);
    competencies = rows.slice(1).map(r => ({
      name: r[1] || '',
      definition: r[2] || '',
      behaviors: r[3] || ''
    })).filter(c => c.name);
    console.log(`Loaded ${competencies.length} competencies.`);
  } catch (e) {
    console.error('Failed to load competencies CSV:', e.message);
  }
}

// ---------- AI Configuration (Gemini) ----------
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const mdParser = new MarkdownIt();

// ---------- LMS Data Context Helpers ----------
async function getLmsContext(userEmail = '') {
  try {
    const sheets = await sheetsClient();
    
    // 1. Fetch Courses with Category info
    const coursesResp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Courses!A2:E'
    });
    const courses = (coursesResp.data.values || []).map(r => ({
      category: r[0] || '',
      subcategory: r[1] || '',
      topic: r[2] || '',
      title: r[3] || '',
      description: r[4] || ''
    })).filter(c => c.title);

    // 2. Fetch Aggregated Data
    const [compRsp, usersRsp, assignedRsp] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'Completions!A2:J'
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'Sheet1!A2:K'
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'AssignedCourses!A2:G'
      })
    ]);

    const compRows = compRsp.data.values || [];
    const userRows = usersRsp.data.values || [];
    const assignedRows = assignedRsp.data.values || [];

    const nameByEmail = new Map();
    for (const r of userRows) {
      if (r[3]) nameByEmail.set(r[3].trim().toLowerCase(), r[2] || r[3]);
    }

    const stats = new Map();
    for (const r of compRows) {
      const email = String(r[1] || '').trim().toLowerCase();
      const seconds = Number(r[4] || 0);
      const status = String(r[6] || '').trim().toLowerCase();
      if (email && status === 'completed' && seconds > 0) {
        let s = stats.get(email);
        if (!s) { s = { seconds: 0, count: 0 }; stats.set(email, s); }
        s.seconds += seconds;
        s.count += 1;
      }
    }

    const leaderboard = Array.from(stats.entries()).map(([email, s]) => ({
      name: nameByEmail.get(email) || email,
      hours: (s.seconds / 3600).toFixed(1),
      courses: s.count
    })).sort((a, b) => b.hours - a.hours).slice(0, 5);

    // 3. User Specific Assignments
    let personalAssignments = [];
    if (userEmail) {
      const emailLower = userEmail.toLowerCase();
      personalAssignments = assignedRows
        .filter(r => r[0] && r[0].toLowerCase() === emailLower)
        .map(r => `- ${r[2]} (Due: ${r[5] || 'No date'}, Status: ${r[6] || 'Assigned'})`);
    }

    return {
      courses,
      leaderboard,
      personalAssignments
    };
  } catch (err) {
    console.error('Failed to fetch LMS context:', err);
    return { courses: [], leaderboard: [], personalAssignments: [] };
  }
}

// ---------- Conversation History (File-based Persistence) ----------
const HISTORY_FILE = path.join(__dirname, 'chat_history.json');
// Structure: Map<sessionId, { userId, title, updatedAt, messages: [] }>
let conversationHistories = new Map();

// Load history on startup
if (fs.existsSync(HISTORY_FILE)) {
  try {
    const rawData = fs.readFileSync(HISTORY_FILE, 'utf8');
    const parsedData = JSON.parse(rawData);
    
    // Validate/Migrate data structure
    for (const [key, val] of Object.entries(parsedData)) {
         if (Array.isArray(val)) {
             // Legacy format detected (Key is email, Val is messages array)
             // Convert to new format
             conversationHistories.set(key, {
                 userId: key, // Use key as email
                 title: 'Legacy Chat',
                 updatedAt: Date.now(), // Estimate
                 messages: val
             });
             console.log(`Migrated legacy session: ${key}`);
         } else {
             conversationHistories.set(key, val);
         }
    }
    console.log(`Loaded ${conversationHistories.size} conversation sessions.`);
  } catch (err) {
    console.error('Failed to load chat history:', err);
  }
}

function saveHistory() {
  try {
    const obj = Object.fromEntries(conversationHistories);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('Failed to save chat history:', err);
  }
}

function getOrCreateSession(sessionId, email) {
  if (!conversationHistories.has(sessionId)) {
    conversationHistories.set(sessionId, {
      userId: email,
      title: 'New Chat',
      updatedAt: Date.now(),
      messages: []
    });
  }
  
  const session = conversationHistories.get(sessionId);
  // Double check structure just in case
  if (Array.isArray(session)) {
      // Should have been migrated effectively on load, but handle runtime case
      const newStruct = {
          userId: email,
          title: 'Restored Chat',
          updatedAt: Date.now(),
          messages: session
      };
      conversationHistories.set(sessionId, newStruct);
      return newStruct;
  }
  return session;
}

// ---------- Uploads ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 } // 1 GB
});

// ---------- Routes ----------
app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// AI Chat Endpoint
app.post('/ai/chat', async (req, res) => {
  const { message, email, sessionId } = req.body || {};
  if (!message) return res.json({ reply: "I'm listening..." });
  
  // Use provided session ID or fallback to a "Default" session for that email
  const safeSessionId = sessionId || `default-${email}`;

  const sessionData = getOrCreateSession(safeSessionId, email);
  const history = sessionData.messages;
  
  // Update title if it's the first user message
  if (history.length === 0) {
      sessionData.title = message.length > 30 ? message.substring(0, 30) + '...' : message;
  }
  sessionData.updatedAt = Date.now();
  
  // Add user message
  history.push({ role: 'user', content: message });
  saveHistory();

  // Try Gemini 2.0 Flash
  if (genAI) {
    try {
      const lmsData = await getLmsContext(email);
      
      // Group courses by category for better role mapping
      const coursesByCategory = {};
      lmsData.courses.forEach(c => {
        if (!coursesByCategory[c.category]) coursesByCategory[c.category] = [];
        if (coursesByCategory[c.category].length < 10) { // Limit titles per category
          coursesByCategory[c.category].push(c.title);
        }
      });

      const coursesContext = Object.entries(coursesByCategory)
        .map(([cat, titles]) => `Category: ${cat}\nCourses: ${titles.join(', ')}`)
        .join('\n\n');

      const systemInstruction = `
You are the "Esme AI Mentor", an expert career coach and technical guide for the "Esme Learning Academy" portal.
Your goal is to provide HIGHLY RELEVANT, personalized course recommendations and guidance.

USER CONTEXT:
- Email: ${email}
- Assigned Courses to this user: 
${lmsData.personalAssignments.length > 0 ? lmsData.personalAssignments.join('\n') : 'No courses currently assigned.'}

WEBSITE CONTEXT:
1. Current Performance (Top 5 on Leaderboard):
${lmsData.leaderboard.map((u, i) => `${i+1}. ${u.name} - ${u.hours} hrs (${u.courses} courses)`).join('\n')}

2. Available Course Catalog (Grouped by Category):
${coursesContext}

PERSONALIZATION GUIDELINES:
- When asked "what courses are assigned to me" or similar: 
  - List their specific assigned courses from the USER CONTEXT section above.
  - Mention the due date and status if available.
- When asked for recommendations for a ROLE (e.g., Sales, Marketing, Intern, Technician):
  - Map their role to the most relevant categories in the catalog.
  - Suggest 2-3 specific course titles from those categories.
  - Explain WHY those courses are good for that specific role.
- If no direct category match exists, suggest general professional development courses.
- Always encourage them to check the "All Courses" tab for the full list.
- Use Markdown (bolding, bullet points) to make recommendations "pop".
- Keep the tone professional, encouraging, and mentor-like.
`.trim();

      const validHistory = history.slice(0, -1).map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      }));

      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",
        systemInstruction: systemInstruction
      });
      const chat = model.startChat({ history: validHistory });
      
      const result = await chat.sendMessage(message);
      const reply = result.response.text();

      history.push({ role: 'model', content: reply });
      saveHistory();

      return res.json({ reply });
    } catch (err) {
      console.error('Gemini error:', err);
      console.log('[AI] Falling back to keyword search due to Gemini error');
    }
  } else {
    console.warn('[AI] Gemini not configured (GEMINI_API_KEY missing). Using keyword search fallback.');
  }

  handleKeywordSearch(message, res, history);
});

// Endpoint: Health Check for AI Service
app.get('/ai/health', (req, res) => {
  res.json({
    ok: true,
    status: 'AI service running',
    gemini_configured: !!genAI,
    firebase_configured: !!bucket,
    timestamp: new Date().toISOString()
  });
});

// Endpoint: Get list of sessions for a user
app.get('/ai/sessions', (req, res) => {
  const { email } = req.query;
  if (!email) return res.json({ sessions: [] });
  
  const userSessions = [];
  for (const [id, session] of conversationHistories.entries()) {
    // Check if session belongs to user (weak check if userId is loosely typed, but assuming email)
    if (session.userId === email) {
      userSessions.push({
        id,
        title: session.title,
        updatedAt: session.updatedAt || 0,
        preview: session.messages.length > 0 ? session.messages[session.messages.length-1].content.substring(0, 50) : ''
      });
    }
  }
  
  // Sort by newest first
  userSessions.sort((a, b) => b.updatedAt - a.updatedAt);
  res.json({ sessions: userSessions });
});

// Endpoint: Get specific session history
app.get('/ai/history', (req, res) => {
  const { sessionId } = req.query;
  console.log(`[GET /ai/history] Request for sessionId: ${sessionId}`);
  
  const session = conversationHistories.get(sessionId);
  if (!session) {
      console.log(`[GET /ai/history] Session not found: ${sessionId}`);
      return res.json({ history: [] });
  }
  
  // Guard against malformed session objects
  if (!session.messages && Array.isArray(session)) {
      console.log(`[GET /ai/history] Detected array-based session runtime fix for: ${sessionId}`);
      return res.json({ history: session });
  }
  
  const hist = session.messages || [];
  console.log(`[GET /ai/history] Returning ${hist.length} messages for ${sessionId}`);
  res.json({ history: hist });
});

// Endpoint: Delete a session
app.delete('/ai/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  console.log(`[DELETE /ai/session] Deleting session: ${sessionId}`);
  
  if (conversationHistories.has(sessionId)) {
      conversationHistories.delete(sessionId);
      saveHistory();
      console.log(`[DELETE /ai/session] Session deleted: ${sessionId}`);
      return res.json({ success: true, message: 'Session deleted' });
  }
  
  console.log(`[DELETE /ai/session] Session not found: ${sessionId}`);
  res.status(404).json({ success: false, message: 'Session not found' });
});

// Endpoint: Create new session
app.post('/ai/session', (req, res) => {
   const { email } = req.body;
   const newId = uuidv4();
   getOrCreateSession(newId, email); 
   saveHistory();
   res.json({ sessionId: newId });
});

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
    // Get assignments and completions data
    const sheets = await sheetsClient();
    const [assignR, compR] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SHEET_ID, range: 'AssignedCourses!A2:G' }),
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SHEET_ID, range: 'Completions!A2:J' })
    ]);
    
    const assigns = (assignR.data.values || []).map(r => ({ 
      email: r[0], 
      title: r[1], 
      due: r[4], 
      status: r[5] || 'Assigned',
      assignedDate: r[2]
    }));
    
    const comps = (compR.data.values || []).map(r => ({ 
      email: r[1], 
      title: r[2], 
      autoCompleted: r[5],
      status: r[6] || 'In Progress', 
      lastPosition: r[7],
      percent_watched: r[8],
      last_seen_at: r[9] || '' 
    }));

    const now = dayjs();
    const idleDays = 7;
    
    // Find users to nudge: assigned but not completed, and either idle >7 days or overdue
    const toNudge = assigns.filter(a => {
      // Skip if already completed
      const completed = comps.find(c => c.email === a.email && c.title === a.title && c.autoCompleted === 'TRUE');
      if (completed) return false;
      
      // Check if idle or overdue
      const comp = comps.find(c => c.email === a.email && c.title === a.title);
      const last = comp?.last_seen_at ? dayjs(comp.last_seen_at) : null;
      const idle = last ? now.diff(last, 'day') >= idleDays : true;
      const overdue = a.due ? now.isAfter(dayjs(a.due)) : false;
      
      return idle || overdue;
    });

    // Log nudge list for debugging
    console.log(`[Reminders] Found ${toNudge.length} users to nudge`);
    toNudge.forEach(t => console.log(`  - ${t.email}: ${t.title}`));

    let sentCount = 0;
    const sentList = [];
    const failedList = [];

    if (transporter) {
      // Send emails if SMTP is configured
      for (const item of toNudge) {
        try {
          const info = await transporter.sendMail({
            from: `"${process.env.SMTP_FROM_NAME || 'ESME Academia'}" <${process.env.SMTP_USER}>`,
            to: item.email,
            subject: `Reminder: Complete "${item.title}"`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #008aa6;">Course Reminder</h2>
                <p>Hi,</p>
                <p>This is a friendly reminder that you have an assigned course waiting for you:</p>
                <div style="background-color: #f8fbfe; padding: 15px; border-left: 4px solid #008aa6; margin: 20px 0;">
                  <p style="margin: 0;"><strong>${item.title}</strong></p>
                  ${item.due ? `<p style="margin: 5px 0; color: #666;">Due: ${dayjs(item.due).format('MMM DD, YYYY')}</p>` : ''}
                </div>
                <p>Please continue where you left off. We're here to support your learning journey!</p>
                <a href="http://localhost:3000" style="display: inline-block; background-color: #008aa6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-top: 10px;">Go to Dashboard</a>
                <p style="color: #999; font-size: 12px; margin-top: 30px;">Questions? Contact your admin.</p>
              </div>
            `,
            text: `Hi,\n\nPlease continue with the course: ${item.title}\n\nGo to: http://localhost:3000`
          });
          sentCount++;
          sentList.push({ email: item.email, title: item.title, messageId: info.messageId });
          console.log(`[Reminders] Email sent to ${item.email}`);
        } catch (err) {
          console.error(`[Reminders] Failed to send to ${item.email}: ${err.message}`);
          failedList.push({ email: item.email, title: item.title, error: err.message });
        }
      }
    } else {
      // SMTP not configured - just log what would be sent
      console.warn('[Reminders] SMTP not configured - reminders would be sent to:');
      toNudge.forEach(t => {
        console.warn(`  - ${t.email}: ${t.title}`);
        sentList.push({ email: t.email, title: t.title, status: 'would-send' });
      });
    }

    res.json({
      success: true,
      nudged: sentCount,
      total_eligible: toNudge.length,
      sent: sentList,
      failed: failedList,
      note: transporter ? 'Emails sent successfully' : 'SMTP not configured - preview mode',
      smtp_configured: !!transporter
    });
  } catch (e) {
    console.error('POST /admin/reminders/run failed:', e.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send reminders',
      error: e.message 
    });
  }
});

// ---------- Keyword Search Handler ----------
function handleKeywordSearch(message, res, history) {
  const q = message.toLowerCase();
  
  // DEBUG LOGGING
  console.log(`[Keyword Search] Query: "${q}"`);
  
  const queryWords = q.split(/[\s,?.!]+/)
       .filter(w => w.length > 3)
       .map(w => w.replace(/s$/, '')); 
  
  if (queryWords.length === 0) {
      return res.json({ reply: "I'm listening... Try asking about a specific topic like 'Leadership' or 'Adaptability'." });
  }
  
  const scores = competencies.map(c => {
      let score = 0;
      const content = (c.name + ' ' + c.definition + ' ' + c.behaviors).toLowerCase();
      queryWords.forEach(word => {
          if (content.includes(word)) score += 1;
          if (c.name.toLowerCase().includes(word)) score += 5;
      });
      return { c, score };
  });

  scores.sort((a, b) => b.score - a.score);
  const hits = scores.filter(s => s.score > 0).map(s => s.c);

  let reply;
  if (hits.length > 0) {
    const best = hits[0];
    reply = `
**${best.name}**

${best.definition}

**Key Behaviors to apply:**
${best.behaviors}
    `.trim();
  } else {
    const allNames = competencies.map(c => `• ${c.name}`).join('\n');
    reply = `I couldn't find a RAG match and my keyword fallback failed. Here are the topics I know:\n\n${allNames}`;
  }
  
  history.push({ role: 'model', content: reply });
  saveHistory();
  return res.json({ reply });
}

// GET admin completions data
app.get('/admin/completions', async (_req, res) => {
  try {
    const sheets = await sheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Completions!A2:I'
    });
    const rows = resp.data.values || [];
    const data = rows.map(r => ({
      timestamp: r[0] || '',
      email: r[1] || '',
      title: r[2] || '',
      category: r[3] || '',
      watchedSeconds: Number(r[4] || 0),
      autoCompleted: (r[5] || '').toUpperCase() === 'TRUE',
      status: r[6] || 'In Progress',
      lastPosition: Number(r[7] || 0),
      percent_watched: Number(r[8] || 0),
      last_seen_at: r[0] || new Date().toISOString()
    }));
    res.json({ success: true, data });
  } catch (e) {
    console.error('GET /admin/completions failed:', e.message);
    res.status(500).json({ success: false, message: 'Failed to fetch completions' });
  }
});

// ---------- Start ----------
const PORT = Number(process.env.PORT || 3002);
app.listen(PORT, () => console.log('Admin server running on', PORT));
