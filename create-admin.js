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
  
  // Add admin account
  const adminRow = [
    '9999',                           // empid
    '9999999999',                     // phone
    'Admin User',                     // name
    'admin@esme.in',                  // email
    'admin',                          // role (ADMIN)
    'Admin123'                        // password
  ];
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: 'Sheet1!A2',
    valueInputOption: 'RAW',
    requestBody: {
      values: [adminRow]
    }
  });
  
  console.log('✅ Admin account created!');
  console.log('Email: admin@esme.in');
  console.log('Password: Admin123');
  console.log('Role: admin');
}

run().catch(console.error);
