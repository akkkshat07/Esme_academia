require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const privateKey = fs.readFileSync(path.join(__dirname, 'private_key.pem'), 'utf8');

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

async function getUsers() {
  try {
    const client = await sheetsAuth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Sheet1!A2:F'
    });

    const rows = resp.data.values || [];
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('               VALID LOGIN CREDENTIALS                         ');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('Format: empid | phone | name | email | role | password\n');
    
    rows.forEach((row, idx) => {
      const empid = (row[0] || '').trim();
      const phone = (row[1] || '').trim();
      const name = (row[2] || '').trim();
      const email = (row[3] || '').trim();
      const role = (row[4] || '').trim();
      const password = (row[5] || '').trim();
      
      if (email || phone) {
        console.log(`${idx + 1}. Email: ${email || 'N/A'}`);
        console.log(`   Phone: ${phone || 'N/A'}`);
        console.log(`   Name: ${name}`);
        console.log(`   Role: ${role}`);
        console.log(`   Password: ${password}`);
        console.log('');
      }
    });
    
    console.log('═══════════════════════════════════════════════════════════════\n');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

getUsers();
