const { google } = require('googleapis');
require('dotenv').config();

async function checkDuration() {
  const auth = new google.auth.GoogleAuth({
    keyFile: './admin-server/firebase-admin.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  
  // Check Completions sheet
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: 'Completions!A1:I10'
  });
  
  console.log('Completions Headers & Data:');
  resp.data.values.forEach((row, i) => {
    console.log(i === 0 ? 'HEADER: ' : `Row ${i}: `, row);
  });
  
  // Check Courses sheet
  const coursesResp = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: 'Courses!A1:I10'
  });
  
  console.log('\n\nCourses Headers & Data:');
  coursesResp.data.values.forEach((row, i) => {
    console.log(i === 0 ? 'HEADER: ' : `Row ${i}: `, row);
  });
}

checkDuration().catch(console.error);
