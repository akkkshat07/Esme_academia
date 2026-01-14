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
  
  // Get all sheets
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: process.env.SHEET_ID
  });
  
  console.log('Available sheets:');
  spreadsheet.data.sheets.forEach(s => console.log(`- ${s.properties.title}`));
  
  // Get Completions data
  console.log('\n--- COMPLETIONS DATA (first 5 rows) ---');
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Completions!A1:I6'
    });
    console.log(JSON.stringify(res.data.values, null, 2));
  } catch (e) {
    console.error('Error fetching Completions:', e.message);
  }
}

run().catch(console.error);
