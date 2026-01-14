import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== AI MENTOR DIAGNOSTIC ===\n');

// 1. Check API Key
const key = process.env.GEMINI_API_KEY;
console.log('1. API Key Check:');
console.log('   - Key exists:', !!key);
console.log('   - Key length:', key?.length || 0);
console.log('   - Starts with:', key?.substring(0, 8) + '...' || 'NO KEY\n');

// 2. Check CSV File
const compPath = path.join(__dirname, '../RSM & ASM Competencies.xlsx - RSM (1).csv');
console.log('\n2. Competencies CSV:');
console.log('   - File exists:', fs.existsSync(compPath));
if (fs.existsSync(compPath)) {
    const content = fs.readFileSync(compPath, 'utf8');
    const lines = content.split('\n').length;
    console.log('   - Lines in file:', lines);
    console.log('   - First 100 chars:', content.substring(0, 100));
}

// 3. Test LLM Connection
console.log('\n3. LLM Connection Test:');
if (!key) {
    console.log('   ERROR: No API key found!');
} else {
    const genAI = new GoogleGenerativeAI(key);
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const result = await model.generateContent('Say "LLM is working" in exactly 3 words.');
        const text = result.response.text();
        console.log('   - Model: gemini-2.0-flash');
        console.log('   - Status: ✅ WORKING');
        console.log('   - Response:', text);
    } catch (e) {
        console.log('   - Status: ❌ FAILED');
        console.log('   - Error:', e.message);
        console.log('   - This means API key works but generation has issues.');
    }
}

// 4. Test Keyword Search Logic
console.log('\n4. Keyword Search Test:');
const message = "I'm struggling to get buy-in from my stakeholders.";
const q = message.toLowerCase();
const queryWords = q.split(/[\s,?.!]+/)
    .filter(w => w.length > 3)
    .map(w => w.replace(/s$/, ''));
console.log('   - Query:', message);
console.log('   - Tokens:', queryWords);
console.log('   - Should find: "Stakeholder" keyword (from "Stakeholder Sensitivity")');

console.log('\n=== END DIAGNOSTIC ===');
