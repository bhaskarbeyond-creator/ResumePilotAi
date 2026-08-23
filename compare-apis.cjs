require('dotenv').config({ path: 'backend/.env' });
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const fs = require('fs');

async function getFirebaseToken() {
    const key = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_KEY;
    if (!key) throw new Error('Set FIREBASE_WEB_API_KEY or VITE_FIREBASE_KEY.');
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            email: process.env.LIVE_ADMIN_EMAIL,
            password: process.env.LIVE_ADMIN_PASSWORD,
            returnSecureToken: true
        })
    });
    const data = await res.json();
    return data.idToken;
}

async function run() {
    const token = await getFirebaseToken();
    const res = await fetch('https://airesume.projectdemo.guru/api/platform/operational-status', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    const liveEndpoints = new Set(data.apiMatrix.routes.map(r => `${r.method} ${r.path}`));
    console.log(`Live total: ${liveEndpoints.size}`);

    // Parse FINAL_API_INVENTORY.md
    const source = fs.readFileSync('docs/FINAL_API_INVENTORY.md', 'utf8');
    const start = source.indexOf('## 5. Full endpoint table');
    const body = start === -1 ? source : source.slice(start);
    
    const docEndpoints = new Set();
    for (const line of body.split('\n')) {
        const match = line.match(/^\|\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\|\s*`([^`]+)`/);
        if (match) {
            docEndpoints.add(`${match[1]} ${match[2]}`);
        }
    }
    console.log(`Doc total: ${docEndpoints.size}`);

    console.log('\nIn Live but not in Doc:');
    for (const ep of liveEndpoints) {
        if (!docEndpoints.has(ep)) console.log(ep);
    }
    
    console.log('\nIn Doc but not in Live:');
    for (const ep of docEndpoints) {
        if (!liveEndpoints.has(ep)) console.log(ep);
    }
}

run();
