import https from 'node:https';
import fs from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const dotenv = fs.readFileSync('backend/.env', 'utf8');
const getVal = key => {
  const m = dotenv.match(new RegExp('^' + key + '=(.*)$', 'm'));
  return m ? m[1].replace(/^["']|["']$/g, '').trim() : null;
};
const pk = getVal('FIREBASE_PRIVATE_KEY');
const ce = getVal('FIREBASE_CLIENT_EMAIL');
const pid = getVal('FIREBASE_PROJECT_ID');
const apiKey = getVal('FIREBASE_API_KEY') || getVal('VITE_FIREBASE_KEY');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: pid,
      clientEmail: ce,
      privateKey: pk.replace(/\\n/g, '\n')
    }),
    projectId: pid
  });
}

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = options.body ? JSON.stringify(options.body) : null;
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(options.headers || {})
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  const uid = 'probe_prod_crud_' + Date.now();
  console.log('Generating custom token for uid:', uid);
  const customToken = await getAuth().createCustomToken(uid, { role: 'USER' });
  console.log('Custom Token Generated, Length:', customToken.length);

  // Exchange with Identity Toolkit
  const exchangeUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`;
  const res = await request(exchangeUrl, {
    method: 'POST',
    body: { token: customToken, returnSecureToken: true }
  });

  console.log('Exchange Status:', res.status);
  if (res.status === 200) {
    console.log('ID Token acquired successfully! Token prefix:', res.data.idToken.substring(0, 30) + '...');
    return { uid, idToken: res.data.idToken };
  } else {
    console.error('Exchange failed:', res.data);
  }
}

run().catch(console.error);
