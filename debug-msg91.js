// Debug script for MSG91
const fetch = require('node-fetch'); // Emulate fetch if needed, or run with node v18+

const AUTH_KEY = '488119Ay7NpDaaHow69674269P1';
const TEMPLATE_ID = '69676cd680671b66873ccc28';
const MOBILE = '917454993082'; // User's number
const OTP = '123456';

async function testStrategies() {
    console.log('--- STARTING MSG91 DEBUG ---');

    // Strategy 1: POST Mixed (Current)
    try {
        console.log('\n[1] Testing POST with URL params + JSON Body...');
        const url = new URL('https://control.msg91.com/api/v5/otp');
        url.searchParams.append('template_id', TEMPLATE_ID);
        url.searchParams.append('mobile', MOBILE);
        url.searchParams.append('authkey', AUTH_KEY);
        
        const res = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp: OTP, var1: OTP })
        });
        console.log('[1] Response:', await res.text());
    } catch (e) {
        console.error('[1] Error:', e.message);
    }

    // Strategy 2: GET Only (Legacy/Simple)
    try {
        console.log('\n[2] Testing GET with Query Params Only...');
        const url = new URL('https://control.msg91.com/api/v5/otp');
        url.searchParams.append('template_id', TEMPLATE_ID);
        url.searchParams.append('mobile', MOBILE);
        url.searchParams.append('authkey', AUTH_KEY);
        url.searchParams.append('otp', OTP);
        url.searchParams.append('var1', OTP);
        
        const res = await fetch(url.toString(), { method: 'GET' });
        console.log('[2] Response:', await res.text());
    } catch (e) {
        console.error('[2] Error:', e.message);
    }

    // Strategy 3: POST Body Only (Cleanest)
    try {
        console.log('\n[3] Testing POST with Body Only (Header Auth)...');
        const url = 'https://control.msg91.com/api/v5/otp';
        
        const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'authkey': AUTH_KEY 
            },
            body: JSON.stringify({
                template_id: TEMPLATE_ID,
                mobile: MOBILE,
                otp: OTP,
                var1: OTP
            })
        });
        console.log('[3] Response:', await res.text());
    } catch (e) {
        console.error('[3] Error:', e.message);
    }
}

testStrategies();
