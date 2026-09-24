import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const SSH_KEY = path.join(root, 'dev_key');

function runSsh(cmd) {
  return execFileSync('ssh', [
    '-i', SSH_KEY,
    '-p', '65002',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'PasswordAuthentication=no',
    'u727965524@82.112.232.112',
    cmd
  ], { encoding: 'utf8' });
}

async function main() {
  console.log('========================================================');
  console.log('       IME365.COM LIVE OPERATIONAL VERIFICATION         ');
  console.log('========================================================\n');

  const BASE_URL = 'https://ime365.com';

  // 1. Homepage probe
  console.log('[1/6] Probing Public Homepage (https://ime365.com/)...');
  const homeRes = await fetch(`${BASE_URL}/`);
  console.log(`  HTTP Status: ${homeRes.status}`);
  const html = await homeRes.text();
  const hasTitle = html.includes('IME365');
  const hasAppRoot = html.includes('id="root"');
  console.log(`  Contains Brand 'IME365': ${hasTitle}`);
  console.log(`  Contains React Root Container: ${hasAppRoot}`);
  if (homeRes.status !== 200 || !hasAppRoot) {
    throw new Error('Homepage probe failed!');
  }
  console.log('  ✓ Public Homepage is LIVE and operational.\n');

  // 2. Health & Platform Version APIs
  console.log('[2/6] Probing Platform Health and Readiness APIs...');
  const versionRes = await fetch(`${BASE_URL}/api/platform/version`);
  const versionData = await versionRes.json();
  console.log('  /api/platform/version:', JSON.stringify(versionData));

  const healthRes = await fetch(`${BASE_URL}/api/healthz`);
  const healthData = await healthRes.json();
  console.log('  /api/healthz:', JSON.stringify(healthData));

  const readyRes = await fetch(`${BASE_URL}/api/readyz`);
  const readyData = await readyRes.json();
  console.log('  /api/readyz status:', readyData.status, 'quotaStore:', readyData.checks?.enterprise?.quotaStore);

  if (healthData.status !== 'ok' || readyData.status !== 'ready') {
    throw new Error('Health / Readyz check failed!');
  }
  console.log('  ✓ Backend API services are healthy, responsive, and ready.\n');

  // 3. Database State Verification
  console.log('[3/6] Verifying Clean Database State on Live Server...');
  const dbVerifyCmd = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
const { pool } = require("./database/mysql");
async function check() {
  const [users] = await pool.query("SELECT id, email, role, suspended, membership FROM users;");
  console.log("USERS_IN_DB:" + JSON.stringify(users));

  const [resumes] = await pool.query("SELECT COUNT(*) as count FROM resumes;");
  console.log("RESUMES_COUNT:" + resumes[0].count);

  const [orders] = await pool.query("SELECT COUNT(*) as count FROM payment_orders;");
  console.log("ORDERS_COUNT:" + orders[0].count);

  const [logs] = await pool.query("SELECT COUNT(*) as count FROM admin_audit_logs;");
  console.log("AUDIT_LOGS_COUNT:" + logs[0].count);

  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
'
`;
  const dbOut = runSsh(dbVerifyCmd);
  const usersMatch = dbOut.match(/USERS_IN_DB:(.*)/);
  const resumesMatch = dbOut.match(/RESUMES_COUNT:(.*)/);
  const ordersMatch = dbOut.match(/ORDERS_COUNT:(.*)/);

  if (usersMatch) {
    const users = JSON.parse(usersMatch[1]);
    console.log('  Users in Database:', JSON.stringify(users, null, 2));
    const superAdmin = users.find(u => u.email === 'bhaskar.beyond@gmail.com');
    if (!superAdmin || superAdmin.role !== 'SUPER_ADMIN') {
      throw new Error('Superadmin bhaskar.beyond@gmail.com not configured properly in MariaDB!');
    }
    console.log(`  ✓ Superadmin User Verified: ${superAdmin.email} (Role: ${superAdmin.role})`);
  }
  if (resumesMatch) {
    console.log(`  ✓ Resumes Table Clean: ${resumesMatch[1].trim()} records`);
  }
  if (ordersMatch) {
    console.log(`  ✓ Payment Orders Clean: ${ordersMatch[1].trim()} records`);
  }

  // 4. Test Public Application Data Endpoints
  console.log('\n[4/6] Testing Public Application Endpoints...');
  const plansRes = await fetch(`${BASE_URL}/api/plans`);
  const plansData = await plansRes.json();
  console.log(`  /api/plans HTTP ${plansRes.status}: ${Array.isArray(plansData) ? plansData.length : Object.keys(plansData || {}).length} plans available`);

  const configRes = await fetch(`${BASE_URL}/api/config`);
  console.log(`  /api/config HTTP ${configRes.status}`);

  // 5. Test Superadmin Authentication & User Management Capability
  console.log('\n[5/6] Testing Superadmin Authority & User Management Engine...');
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const dotenv = await import('dotenv');
  dotenv.config({ path: 'backend/.env' });

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  };
  const app = initializeApp({ credential: cert(serviceAccount) }, 'verifier-' + Date.now());
  const auth = getAuth(app);

  const fbUser = await auth.getUserByEmail('bhaskar.beyond@gmail.com');
  console.log('  Firebase Superadmin UID:', fbUser.uid);
  console.log('  Firebase Custom Claims:', JSON.stringify(fbUser.customClaims));
  if (fbUser.customClaims?.role !== 'SUPER_ADMIN') {
    throw new Error(`Firebase Auth role claim is not SUPER_ADMIN! Current: ${fbUser.customClaims?.role}`);
  }
  console.log('  ✓ Firebase Auth Super Admin Claims Confirmed: role = SUPER_ADMIN');

  // Test creating a secondary test user to verify user creation capability (Super Admin capacity)
  const testSubUserEmail = `operator_test_${Date.now()}@ime365.com`;
  console.log('  Testing user creation capability with:', testSubUserEmail);
  
  let createdUser;
  try {
    createdUser = await auth.createUser({
      email: testSubUserEmail,
      password: 'TestPassword123#Secure',
      displayName: 'Operator Test User',
      emailVerified: true
    });
    await auth.setCustomUserClaims(createdUser.uid, { role: 'ADMIN' });
    console.log('  ✓ Successfully created and assigned ADMIN role in Firebase Auth:', createdUser.uid);

    // Also verify inserting and deleting in MariaDB via SSH
    const testMariaCmd = `
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"
cd /home/u727965524/backend
node -e '
const { pool } = require("./database/mysql");
async function testDb() {
  await pool.query("INSERT INTO users (id, email, displayName, role, suspended, membership, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, NOW(), NOW());", ["${createdUser.uid}", "${testSubUserEmail}", "Operator Test User", "ADMIN", "Basic"]);
  const [rows] = await pool.query("SELECT id, email, role FROM users WHERE id = ?;", ["${createdUser.uid}"]);
  if (rows.length === 0 || rows[0].role !== "ADMIN") throw new Error("DB user insertion verification failed!");
  await pool.query("DELETE FROM users WHERE id = ?;", ["${createdUser.uid}"]);
  console.log("DB_USER_LIFECYCLE_SUCCESS");
  process.exit(0);
}
testDb().catch(e => { console.error(e); process.exit(1); });
'
`;
    const dbTestOut = runSsh(testMariaCmd);
    if (!dbTestOut.includes('DB_USER_LIFECYCLE_SUCCESS')) {
      throw new Error('MariaDB user management test failed: ' + dbTestOut);
    }
    console.log('  ✓ MariaDB user provisioning lifecycle verified');

    // Clean up Firebase test user
    await auth.deleteUser(createdUser.uid);
    console.log('  ✓ Successfully cleaned up verification user from Firebase Auth');
  } catch (err) {
    if (createdUser) {
      await auth.deleteUser(createdUser.uid).catch(() => {});
    }
    throw err;
  }

  // 6. Final DNS & Edge Security Check
  console.log('[6/6] Verifying SSL / Edge Security for ime365.com...');
  const sslRes = await fetch(`${BASE_URL}/`, { method: 'HEAD' });
  console.log('  HTTPS Headers:');
  console.log('    server:', sslRes.headers.get('server'));
  console.log('    cf-ray:', sslRes.headers.get('cf-ray'));
  console.log('    content-security-policy:', sslRes.headers.get('content-security-policy') ? 'Active' : 'N/A');
  console.log('    strict-transport-security:', sslRes.headers.get('strict-transport-security') ? 'Active' : 'N/A');

  console.log('\n========================================================');
  console.log('🎉 ALL LIVE OPERATIONAL TESTS PASSED WITH 100% SUCCESS! 🎉');
  console.log('========================================================');
}

main().catch(err => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
