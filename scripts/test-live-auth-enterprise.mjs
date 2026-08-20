import { createRequire } from 'node:module';
import https from 'node:https';
import path from 'node:path';

const require = createRequire(import.meta.url);
const admin = require('../backend/services/firebaseAdmin');
const dotenv = require('../backend/node_modules/dotenv');

dotenv.config({ path: path.resolve('backend/.env') });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

function request(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'airesume.projectdemo.guru',
      port: 443,
      path: urlPath,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

async function testLiveAuthEnterprise() {
  console.log('=== Live Authenticated Enterprise Production Probing ===\n');

  const testUid = 'controlled-enterprise-pilot-user-01';
  const testEmail = 'enterprise-pilot@projectdemo.guru';

  try {
    await admin.auth().getUser(testUid);
    console.log('[Auth] Found existing pilot test user:', testUid);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      await admin.auth().createUser({
        uid: testUid,
        email: testEmail,
        emailVerified: true,
        displayName: 'Enterprise Pilot Lead',
      });
      console.log('[Auth] Created new controlled pilot test user:', testUid);
    } else {
      throw err;
    }
  }

  // Create custom token
  const customToken = await admin.auth().createCustomToken(testUid, {
    email: testEmail,
    email_verified: true,
  });
  console.log('[Auth] Custom Token generated successfully for UID:', testUid);

  // Probe live server enterprise status
  const statusRes = await request('/api/enterprise/status');
  console.log('[Live Endpoint] /api/enterprise/status (Unauth):', statusRes.status, statusRes.body);

  // Clean up pilot test user
  await admin.auth().deleteUser(testUid);
  console.log('[Auth] Cleaned up controlled pilot test user successfully.');
}

testLiveAuthEnterprise().catch(console.error);
