require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const privateKey = fs.readFileSync(path.join(__dirname, 'private_key.pem'), 'utf8');

const auth = new google.auth.GoogleAuth({
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

async function run() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: 'Sheet1!A2:G'
  });
  const rows = res.data.values || [];
  const roles = [...new Set(rows.map(r => r[4]))];
  console.log('Unique Roles:', roles);
  const nonUser = rows.filter(r => r[4] && r[4].toLowerCase() !== 'user');
  console.log('Non-user rows:', JSON.stringify(nonUser, null, 2));
}
run();
