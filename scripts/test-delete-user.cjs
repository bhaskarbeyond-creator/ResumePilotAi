const https = require('https');

const API_KEY = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_KEY;
const ADMIN_EMAIL = process.env.LIVE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.LIVE_ADMIN_PASSWORD;
const DELETE_EMAIL = process.env.LIVE_DELETE_EMAIL;
const DELETE_PASSWORD = process.env.LIVE_DELETE_PASSWORD;
if (!API_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD || !DELETE_EMAIL || !DELETE_PASSWORD) throw new Error('Set FIREBASE_WEB_API_KEY (or VITE_FIREBASE_KEY), LIVE_ADMIN_EMAIL, LIVE_ADMIN_PASSWORD, LIVE_DELETE_EMAIL, and LIVE_DELETE_PASSWORD.');
const BASE_URL = 'https://airesume.projectdemo.guru';

async function fetchJson(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
                } catch(e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function login() {
    const postData = JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        returnSecureToken: true
    });
    const { status, data } = await fetchJson(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, { method: 'POST', body: postData });
    if (status !== 200) throw new Error(`Login failed: ${status}`);
    return data.idToken;
}

async function checkApi(endpoint, token, method = 'GET', body = null) {
    console.log(`\nChecking ${method} ${endpoint}...`);
    const options = {
        method,
        headers: { 'Authorization': `Bearer ${token}` }
    };
    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    const { status, data } = await fetchJson(`${BASE_URL}${endpoint}`, options);
    console.log(`Status: ${status}`);
    console.log('Response:', typeof data === 'string' ? data.slice(0,200) + '...' : data);
    return { status, data };
}

async function run() {
    try {
        console.log('--- Logging in as Super Admin ---');
        const token = await login();
        console.log('Token acquired.');

        // 1. Create a dummy user directly via Firebase REST API
        console.log('\n--- Creating dummy user to delete ---');
        const signUpData = JSON.stringify({
            email: DELETE_EMAIL,
            password: DELETE_PASSWORD,
            returnSecureToken: true
        });
        const signUpRes = await fetchJson(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, { method: 'POST', body: signUpData });
        const uid = signUpRes.data.localId;
        console.log(`Dummy user created with UID: ${uid}`);

        // 2. Call the delete-user admin endpoint to delete the user!
        console.log('\n--- Testing /api/admin/delete-user endpoint ---');
        const deleteRes = await checkApi('/api/admin/delete-user', token, 'POST', { uid, email: DELETE_EMAIL });
        
        if (deleteRes.status === 200 && deleteRes.data.success) {
            console.log('\n✅ DELETE_USER_ACCOUNT returned 200 OK! The 500 error is fixed!');
        } else {
            console.log('\n❌ DELETE_USER_ACCOUNT failed!');
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
}

run();
