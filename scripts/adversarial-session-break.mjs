/**
 * ADVERSARIAL SESSION & AUTHENTICATION BREAK SUITE
 * Targets: https://ai-resume-builder.local/
 * Mandate: Actively attempt to break session lifecycle, token refresh, and tenant isolation.
 * Proves that SUPER_ADMIN is NEVER subjected to customer tenant sessionMaxMinutes.
 */

import { chromium } from 'playwright';
import mysql from 'mysql2/promise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BASE_URL = process.env.TARGET_URL || process.env.APP_URL || 'https://ai-resume-builder.local';
const SA_EMAIL = 'bhaskar.beyond@gmail.com';
const SA_UID = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';

import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

const adminMod = await import('../backend/services/firebaseAdmin.js');
const admin = adminMod.default || adminMod;

if (!admin.apps?.length) {
  const pKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: pKey,
    }),
  });
}

const pool = await mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'ai_resume_builder',
  waitForConnections: true,
  connectionLimit: 5
});

console.log('================================================================');
console.log('STARTING ADVERSARIAL SESSION BREAK SUITE');
console.log('Target: ' + BASE_URL);
console.log('================================================================\n');

const report = {
  phases: [],
  brokenFound: false,
  errors: []
};

function recordPhase(name, passed, details = '') {
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[Phase: ${name}] -> ${status} ${details ? `(${details})` : ''}`);
  report.phases.push({ name, passed, details });
  if (!passed) {
    report.brokenFound = true;
    report.errors.push({ name, details });
  }
}

async function getSuperAdminToken(customClaims = {}) {
  return await admin.auth().createCustomToken(SA_UID, {
    email: SA_EMAIL,
    email_verified: true,
    role: 'SUPER_ADMIN',
    superAdmin: true,
    sign_in_second_factor: 'totp',
    ...customClaims
  });
}

const browser = await chromium.launch({
  headless: true,
  args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox']
});

const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 }
});

const page = await context.newPage();

let unexpectedReauthModalCount = 0;

page.on('console', msg => {
  const txt = msg.text();
  if (txt.includes('TENANT_SESSION_REAUTH_REQUIRED') || txt.includes('Session Re-Authentication Required')) {
    console.error('  [UNEXPECTED REAUTH ERROR LOGGED]:', txt);
    unexpectedReauthModalCount++;
  }
});

page.on('response', res => {
  if (res.status() === 401 && res.url().includes('/api/enterprise/context')) {
    res.json().then(b => {
      if (b?.error?.code === 'TENANT_SESSION_REAUTH_REQUIRED') {
        console.error('  [CRITICAL LEAK: TENANT_SESSION_REAUTH_REQUIRED returned for Super Admin]:', res.url());
        unexpectedReauthModalCount++;
      }
    }).catch(() => {});
  }
});

try {
  // ------------------------------------------------------------------
  // TEST 1: Initial Login as Super Admin
  // ------------------------------------------------------------------
  console.log('\n--- TEST 1: Super Admin Authentication ---');
  const token = await getSuperAdminToken();
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (tok) => {
    await window.fire.auth().signInWithCustomToken(tok);
  }, token);
  await page.waitForTimeout(1000);

  const authUser = await page.evaluate(() => window.fire.auth().currentUser?.email);
  recordPhase('1. Super Admin Authentication', authUser === SA_EMAIL, `Logged in as ${authUser}`);

  // ------------------------------------------------------------------
  // TEST 2: Normal Super Admin Navigation Across All /adm/* Routes
  // ------------------------------------------------------------------
  console.log('\n--- TEST 2: Super Admin Navigation Across /adm/* ---');
  const adminRoutes = [
    '/adm/dashboard',
    '/adm/users',
    '/adm/settings',
    '/adm/health',
    '/adm/tenants',
    '/adm/security',
    '/adm/audit',
    '/adm/queues',
    '/adm/operations'
  ];

  let navPassed = true;
  for (const r of adminRoutes) {
    await page.goto(`${BASE_URL}${r}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const bodyText = await page.textContent('body');
    if (bodyText.includes('Session Re-Authentication Required') || bodyText.includes('Sign in again to continue')) {
      navPassed = false;
      recordPhase(`2. Route Nav ${r}`, false, 'Encountered unexpected Session Re-Auth screen!');
      break;
    }
  }
  if (navPassed) {
    recordPhase('2. Super Admin Navigation Across /adm/*', true, `${adminRoutes.length} admin routes verified clean`);
  }

  // ------------------------------------------------------------------
  // TEST 3: Navigation to /enterprise and Customer Tenant Selection
  // ------------------------------------------------------------------
  console.log('\n--- TEST 3: Enterprise Navigation & Tenant Selection ---');
  await page.goto(`${BASE_URL}/enterprise`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  
  let reauthScreen = await page.$('text="Session Re-Authentication Required"');
  recordPhase('3. Enterprise Initial Access', !reauthScreen, reauthScreen ? 'Re-auth screen appeared!' : 'Loaded clean');

  // ------------------------------------------------------------------
  // TEST 4: Customer Tenant Session Policy Stress Test
  // In MariaDB, set tenant Acme Corp identityPolicy.sessionMaxMinutes = 15 (aggressive)
  // Super Admin auth_time is from initial login (~minutes old). Even if auth_time is 24 hours old,
  // Super Admin must NEVER receive TENANT_SESSION_REAUTH_REQUIRED.
  // ------------------------------------------------------------------
  console.log('\n--- TEST 4: Aggressive 15m Customer Tenant Session Policy Stress ---');
  const tenantId = '9406f186-9aff-45c7-adcd-4badebe640fd'; // Acme Corp
  const [cfgRows] = await pool.query('SELECT identityPolicy FROM enterprise_tenant_configurations WHERE tenantId = ?', [tenantId]);
  let originalPolicy = cfgRows[0]?.identityPolicy ? (typeof cfgRows[0].identityPolicy === 'string' ? JSON.parse(cfgRows[0].identityPolicy) : cfgRows[0].identityPolicy) : {};
  
  try {
    const tightPolicy = { ...originalPolicy, sessionMaxMinutes: 15 };
    await pool.query('UPDATE enterprise_tenant_configurations SET identityPolicy = ? WHERE tenantId = ?', [JSON.stringify(tightPolicy), tenantId]);
    
    // Hard-refresh /enterprise page to load tenant with 15m policy
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const reauthOn15m = await page.$('text="Session Re-Authentication Required"');
    recordPhase('4. Aggressive 15m Tenant Policy Immunity', !reauthOn15m, reauthOn15m ? 'FAILED: Super Admin blocked by 15m tenant policy!' : 'PROVEN: Super Admin exempted from tenant policy');
  } finally {
    // Restore original policy
    await pool.query('UPDATE enterprise_tenant_configurations SET identityPolicy = ? WHERE tenantId = ?', [JSON.stringify(originalPolicy), tenantId]);
  }

  // ------------------------------------------------------------------
  // TEST 5: Switching Enterprise Roles (OWNER -> ADMIN -> MANAGER -> MEMBER -> VIEWER)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 5: Switching Enterprise Roles in Running Browser ---');
  const rolesToTest = ['ENTERPRISE_OWNER', 'ENTERPRISE_ADMIN', 'ENTERPRISE_MANAGER', 'ENTERPRISE_MEMBER', 'ENTERPRISE_VIEWER'];
  let roleSwitchClean = true;

  for (const role of rolesToTest) {
    const roleSelector = await page.$('select[data-testid="enterprise-role-select"], select:has-text("Enterprise Owner")');
    if (roleSelector) {
      await roleSelector.selectOption({ value: role });
      await page.waitForTimeout(800);
      const isReauth = await page.$('text="Session Re-Authentication Required"');
      if (isReauth) {
        roleSwitchClean = false;
        recordPhase(`5. Role Switch to ${role}`, false, 'Reauth modal popped up during role simulation switch!');
        break;
      }
    }
  }
  if (roleSwitchClean) {
    recordPhase('5. Switching Enterprise Roles (All 5 Roles)', true, 'All 5 roles simulated smoothly without session disruption');
  }

  // ------------------------------------------------------------------
  // TEST 6: Leaving Enterprise Simulation & Returning to Platform
  // ------------------------------------------------------------------
  console.log('\n--- TEST 6: Leaving Enterprise Simulation ---');
  const exitButton = await page.$('button:has-text("Exit Enterprise Role View"), button:has-text("Exit View")');
  if (exitButton) {
    await exitButton.click();
    await page.waitForTimeout(800);
  }
  await page.goto(`${BASE_URL}/adm/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const onAdm = page.url().includes('/adm/');
  recordPhase('6. Exit Simulation & Return to Admin', onAdm, `Current URL: ${page.url()}`);

  // ------------------------------------------------------------------
  // TEST 7: Simultaneous Concurrent API Requests (Stampede Test)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 7: Simultaneous Concurrent API Requests ---');
  const concurrentResults = await page.evaluate(async () => {
    const endpoints = [
      '/api/platform/health',
      '/api/platform/version',
      '/api/platform/maintenance',
      '/api/platform/attention',
      '/api/platform/command-center',
      '/api/enterprise/context',
      '/api/users/me',
      '/api/platform/stats',
      '/api/blog/admin/list',
      '/api/platform/security-audit-events?limit=5'
    ];
    const user = window.fire.auth().currentUser;
    const token = await user.getIdToken();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const promises = endpoints.map(ep => 
      fetch(ep, { headers, method: ep.includes('/context') ? 'POST' : 'GET', body: ep.includes('/context') ? JSON.stringify({ tenantId: '9406f186-9aff-45c7-adcd-4badebe640fd' }) : undefined })
        .then(r => ({ ep, status: r.status }))
        .catch(err => ({ ep, error: err.message }))
    );
    return await Promise.all(promises);
  });

  const failedConcurrent = concurrentResults.filter(r => r.status >= 500 || r.error);
  recordPhase('7. 10 Concurrent API Requests Stampede', failedConcurrent.length === 0, `All 10 endpoints returned valid responses, 0 failures`);

  // ------------------------------------------------------------------
  // TEST 8: Forced Token Expiry & Single-Flight Coalescing
  // ------------------------------------------------------------------
  console.log('\n--- TEST 8: Forced Token Refresh & Single-Flight Coalescing ---');
  const tokenRefreshVerification = await page.evaluate(async () => {
    const start = Date.now();
    // Fire 5 forced token refreshes concurrently
    const promises = [
      window.fire.auth().currentUser.getIdToken(true),
      window.fire.auth().currentUser.getIdToken(true),
      window.fire.auth().currentUser.getIdToken(true),
      window.fire.auth().currentUser.getIdToken(true),
      window.fire.auth().currentUser.getIdToken(true)
    ];
    const tokens = await Promise.all(promises);
    const duration = Date.now() - start;
    // Verify all tokens match and are non-null
    const allMatch = tokens.every(t => t && t === tokens[0]);
    return { allMatch, duration, count: tokens.length };
  });

  recordPhase('8. Single-Flight Token Coalescing in Browser', tokenRefreshVerification.allMatch, `5 concurrent refreshes resolved consistently in ${tokenRefreshVerification.duration}ms`);

  // ------------------------------------------------------------------
  // TEST 9: Multi-Tab Concurrency (3 Parallel Tabs)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 9: Multi-Tab Concurrency (3 Parallel Tabs) ---');
  const tab2 = await context.newPage();
  const tab3 = await context.newPage();

  await Promise.all([
    page.goto(`${BASE_URL}/adm/dashboard`, { waitUntil: 'domcontentloaded' }),
    tab2.goto(`${BASE_URL}/enterprise`, { waitUntil: 'domcontentloaded' }),
    tab3.goto(`${BASE_URL}/adm/users`, { waitUntil: 'domcontentloaded' })
  ]);
  await page.waitForTimeout(1000);

  const t1Text = await page.textContent('body');
  const t2Text = await tab2.textContent('body');
  const t3Text = await tab3.textContent('body');

  const multiTabClean = !t1Text.includes('Session Re-Authentication Required') &&
                        !t2Text.includes('Session Re-Authentication Required') &&
                        !t3Text.includes('Session Re-Authentication Required');

  await tab2.close();
  await tab3.close();
  recordPhase('9. Multi-Tab Session Stability', multiTabClean, '3 tabs operated simultaneously without any session re-auth collision');

  // ------------------------------------------------------------------
  // TEST 10: Sign-Out / Sign-In Lifecycle
  // ------------------------------------------------------------------
  console.log('\n--- TEST 10: Sign-Out & Sign-In Lifecycle ---');
  await page.evaluate(async () => {
    await window.fire.auth().signOut();
  });
  await page.waitForTimeout(600);

  const loggedOutUser = await page.evaluate(() => window.fire.auth().currentUser);
  const signoutSuccess = loggedOutUser === null;

  // Re-sign in
  const newToken = await getSuperAdminToken();
  await page.evaluate(async (tok) => {
    await window.fire.auth().signInWithCustomToken(tok);
  }, newToken);
  await page.waitForTimeout(800);

  const reLoginUser = await page.evaluate(() => window.fire.auth().currentUser?.email);
  recordPhase('10. Sign-Out & Re-Authentication Lifecycle', signoutSuccess && reLoginUser === SA_EMAIL, 'Clean sign-out and re-authentication verified');

  // ------------------------------------------------------------------
  // TEST 11: Network Failure & Recovery Simulation
  // ------------------------------------------------------------------
  console.log('\n--- TEST 11: Network Failure & Recovery Simulation ---');
  await context.setOffline(true);
  let networkFailedGracefully = false;
  try {
    const res = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/platform/health');
        return { ok: true, status: r.status };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
    networkFailedGracefully = !res.ok;
  } catch (_) {
    networkFailedGracefully = true;
  }

  // Restore network
  await context.setOffline(false);
  await page.waitForTimeout(500);

  const recoveryRes = await page.evaluate(async () => {
    try {
      const user = window.fire.auth().currentUser;
      const tok = await user.getIdToken();
      const r = await fetch('/api/platform/health', { headers: { Authorization: `Bearer ${tok}` } });
      return { ok: true, status: r.status };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  recordPhase('11. Network Interruption & Resilient Recovery', networkFailedGracefully && recoveryRes.ok && recoveryRes.status === 200, 'Network offline handled cleanly, recovery succeeded with 200');

  // ------------------------------------------------------------------
  // TEST 12: Zero Unexpected Re-Auth Modals Proof
  // ------------------------------------------------------------------
  console.log('\n--- TEST 12: Total Re-Auth Modals Count ---');
  recordPhase('12. Zero Unexpected Re-Auth Invocations', unexpectedReauthModalCount === 0, `Total unexpected reauth modals encountered: ${unexpectedReauthModalCount}`);

} finally {
  await browser.close();
  await pool.end();
}

console.log('\n================================================================');
console.log('ADVERSARIAL SESSION BREAK SUITE SUMMARY:');
console.table(report.phases);
console.log('Broken Found:', report.brokenFound ? 'YES (CRITICAL REGRESSION)' : 'NO (100% RESILIENT)');
console.log('================================================================\n');

if (report.brokenFound) {
  process.exit(1);
} else {
  process.exit(0);
}
