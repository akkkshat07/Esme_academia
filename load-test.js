const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const TARGET_URL = 'http://localhost:3000/api/login'; 
const TARGET_HOST = 'localhost';
const TARGET_PORT = 3000;
const CONCURRENT_USERS = 250;
const DURATION_SECONDS = 30; 

// Load Real Users from CSV
const csvPath = path.join(__dirname, 'Esme-Learning-Academy(Do Not Delete) - Sheet1.csv');
let TEST_USERS = [];

try {
    const data = fs.readFileSync(csvPath, 'utf8');
    const lines = data.split('\n').slice(1); // Skip header
    lines.forEach(line => {
        const cols = line.split(',');
        // empid=0, phone=1, email=3, password=5
        if (cols.length > 5) {
            const email = cols[3]?.trim();
            const phone = cols[1]?.trim();
            const password = cols[5]?.trim();
            if ((email || phone) && password) {
                TEST_USERS.push({ emailOrPhone: email || phone, password });
            }
        }
    });
    console.log(`✅ Loaded ${TEST_USERS.length} real users for testing.`);
} catch (err) {
    console.error('⚠️ Could not load CSV, falling back to guest user.', err.message);
    TEST_USERS.push({ emailOrPhone: "guest@company.com", password: "123" });
}

console.log(`🚀 Starting Load Test via Proxy (Port 3000) -> Backend (Port 3001)`);
console.log(`👥 Users: ${CONCURRENT_USERS}`);
console.log(`⏱️ Duration: ${DURATION_SECONDS}s`);

let successCount = 0;
let failCount = 0;
let activeRequests = 0;
let errors = {};

// Function to make a single request
function sendRequest() {
    activeRequests++;
    
    // Pick random user
    const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
    
    // Randomize endpoint to simulate real traffic mix
    const rand = Math.random();
    let pathStr, method, payload; 

    if (rand < 0.3) {
        // 30% Traffic: Login
        pathStr = '/api/login';
        method = 'POST';
        payload = JSON.stringify(user);
    } else if (rand < 0.6) {
        // 30% Traffic: Leaderboard (Cached)
        pathStr = '/api/leaderboard';
        method = 'GET';
    } else if (rand < 0.8) {
        // 20% Traffic: Courses (Cached)
        pathStr = '/api/courses/filter?language=English';
        method = 'GET';
    } else {
        // 20% Traffic: Quizzes (Cached)
        pathStr = '/api/quizzes';
        method = 'GET';
    }

    const start = Date.now();

    const opts = {
        hostname: 'localhost',
        port: 3000, 
        path: pathStr,
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': payload ? Buffer.byteLength(payload) : 0
        }
    };

    const req = http.request(opts, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
            activeRequests--;
            const duration = Date.now() - start;
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
                successCount++;
            } else {
                failCount++;
                const key = `${res.statusCode} ${pathStr}`;
                errors[key] = (errors[key] || 0) + 1;
            }
        });
    });

    req.on('error', (e) => {
        activeRequests--;
        failCount++;
        const key = `NET_ERR ${pathStr}`;
        errors[key] = (errors[key] || 0) + 1;
    });

    if (payload) req.write(payload);
    req.end();
}

// Start the flood
const startTime = Date.now();
const interval = setInterval(() => {
    // Maintain concurrent load
    if (activeRequests < CONCURRENT_USERS) {
        const needed = CONCURRENT_USERS - activeRequests;
        for (let i = 0; i < needed; i++) sendRequest();
    }

    if (Date.now() - startTime > DURATION_SECONDS * 1000) {
        clearInterval(interval);
        console.log('\n🛑 Test Finished. Waiting for pending requests...');
        setTimeout(report, 2000);
    }
}, 100);

function report() {
    console.log('\n====== LOAD TEST RESULTS ======');
    console.log(`✅ Successful Requests: ${successCount}`);
    console.log(`❌ Failed Requests:     ${failCount}`);
    console.log(`📉 Error Breakdown:`);
    console.table(errors);
    
    if (failCount > 0) {
         console.log('\nAnalyis:');
         if (errors['500 /api/login']) console.log('⚠️  500 Errors on Login -> Cache might be missing or backend crashing.');
         if (errors['502 /api/login']) console.log('⚠️  502 Errors -> Frontend Proxy to Backend connection failed.');
    } else {
        console.log('\n🎉 SUCCESS: System handled the load perfectly!');
    }
}
