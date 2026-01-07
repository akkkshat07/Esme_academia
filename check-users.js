const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pemPath = path.join(__dirname, 'private_key.pem');
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

async function run() {
  try {
    const client = await sheetsAuth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // Get headers and first row
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Sheet1!A1:K2'
    });

    console.log('--- SHEET1 HEADERS & FIRST USER ---');
    const headers = resp.data.values[0];
    const firstUser = resp.data.values[1];
    
    headers.forEach((h, i) => console.log(`Col ${String.fromCharCode(65+i)} (${i}): ${h}`));
    
    console.log('\n--- FIRST USER DATA ---');
    firstUser.forEach((val, i) => console.log(`Col ${String.fromCharCode(65+i)} (${i}): ${val}`));

  } catch (e) {
    console.error(e);
  }
}

run();
