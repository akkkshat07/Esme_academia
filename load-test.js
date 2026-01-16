const http = require('http');

// Configuration
const TARGET_URL = 'http://localhost:3000/api/login'; // Adjust if testing a different endpoint
const CONCURRENT_USERS = 250;
const DURATION_SECONDS = 30; // How long to sustain the load

const LOGIN_PAYLOAD = JSON.stringify({
    emailOrPhone: "guest@company.com", // Use a valid test user
    password: "123"
});

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
    
    // Randomize endpoint to simulate real traffic mix
    const rand = Math.random();
    let path, method, payload;

    if (rand < 0.3) {
        // 30% Traffic: Login
        path = '/api/login';
        method = 'POST';
        payload = LOGIN_PAYLOAD;
    } else if (rand < 0.6) {
        // 30% Traffic: Leaderboard (Cached)
        path = '/api/leaderboard';
        method = 'GET';
    } else if (rand < 0.8) {
        // 20% Traffic: Courses (Cached)
        path = '/api/courses/filter?language=English';
        method = 'GET';
    } else {
        // 20% Traffic: Quizzes (Cached)
        path = '/api/quizzes';
        method = 'GET';
    }

    const start = Date.now();

    const opts = {
        hostname: 'localhost',
        port: 3000, // Hit the frontend proxy to test the full chain
        path: path,
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
                const key = `${res.statusCode} ${path}`;
                errors[key] = (errors[key] || 0) + 1;
            }
        });
    });

    req.on('error', (e) => {
        activeRequests--;
        failCount++;
        const key = `NET_ERR ${path}`;
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
