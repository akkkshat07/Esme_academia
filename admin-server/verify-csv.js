
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const compPath = path.join(__dirname, '../RSM & ASM Competencies.xlsx - RSM (1).csv');

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
    console.log(`Total Rows Parsed: ${rows.length}`);
    
    // Check Header
    console.log('Row 1 (Header candidate):', rows[1]);

    const competencies = rows.slice(1).map(r => ({
      name: r[1] || '',
      definition: r[2] || '',
      behaviors: r[3] || ''
    })).filter(c => c.name && c.name !== 'Competencies'); // Filter out header and empty names

    console.log(`Loaded ${competencies.length} valid competencies.`);
    
    if (competencies.length > 0) {
        console.log('\n--- Sample Competency ---');
        console.log('Name:', competencies[0].name);
        console.log('Def:', competencies[0].definition.substring(0, 50) + '...');
        console.log('Beh:', competencies[0].behaviors.substring(0, 50) + '...');
    }
    
  } catch (e) {
    console.error('Failed to load competencies CSV:', e.message);
  }
} else {
    console.error("File not found at:", compPath);
}
