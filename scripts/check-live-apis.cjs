const https = require('https');

const API_KEY = process.env.VITE_FIREBASE_KEY || 'AIzaSyDigXT7n4Pyf-8WHQtvjHa0wGvJ86nmrwc';
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
        email: 'forensic@projectdemo.guru',
        password: 'Forensic@2026!',
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
    return status;
}

async function run() {
    try {
        const token = await login();
        await checkApi('/api/admin/audit-logs', token);
        await checkApi('/api/admin/audit-logs/stats', token);
        await checkApi('/api/enterprise/platform/tenants', token);
        await checkApi('/api/platform/queues', token);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

run();
