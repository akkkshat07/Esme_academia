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

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Courses!A2:E200' // Fetch more rows, check categories/titles
    });

    const rows = resp.data.values || [];
    console.log(`Scanned ${rows.length} rows.`);

    const hindiRows = rows.filter(r => JSON.stringify(r).toLowerCase().includes('hindi'));
    
    if (hindiRows.length > 0) {
      console.log('\n--- FOUND "HINDI" IN THESE ROWS ---');
      hindiRows.slice(0, 5).forEach(r => console.log(r));
    } else {
      console.log('\n--- NO "HINDI" KEYWORD FOUND IN FIRST 200 ROWS ---');
      // Print a few distinct headers to see if languages are separate categories
      const categories = [...new Set(rows.map(r => r[0]))];
      console.log('\n--- DISTINCT MAIN CATEGORIES ---');
      console.log(categories);
    }

  } catch (e) {
    console.error(e);
  }
}

run();