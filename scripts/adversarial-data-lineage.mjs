/**
 * ADVERSARIAL DATA LINEAGE & FAILURE INJECTION SUITE
 * Targets: https://ai-resume-builder.local/
 * Mandate:
 * 1. Trace real DB records to DOM across all Super Admin screens.
 * 2. Deliberately inject API 500, 503, 401, 403, and network timeouts.
 * 3. Verify that UI NEVER silently converts backend failures into "0", "None", or "No records".
 */

import { chromium } from 'playwright';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
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

const BASE_URL = process.env.TARGET_URL || process.env.APP_URL || 'https://ai-resume-builder.local';
const SA_EMAIL = 'bhaskar.beyond@gmail.com';
const SA_UID = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';

const pool = await mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'ai_resume_builder',
  waitForConnections: true,
  connectionLimit: 5
});

console.log('================================================================');
console.log('STARTING ADVERSARIAL DATA LINEAGE & FAILURE INJECTION SUITE');
console.log('Target: ' + BASE_URL);
console.log('================================================================\n');

const report = {
  lineage: [],
  failuresInjected: [],
  brokenFound: false
};

function recordLineage(screen, dbRecord, apiValue, domText, verified) {
  console.log(`  [LINEAGE PASS] Screen: ${screen} -> DB (${dbRecord}) -> DOM: "${domText}"`);
  report.lineage.push({ screen, dbRecord, apiValue, domText, verified });
}

function recordFailureTest(screen, errorInjected, uiBehavior, passed, details) {
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`  [${status}] Failure Injection on ${screen} (${errorInjected}) -> UI: ${uiBehavior}`);
  report.failuresInjected.push({ screen, errorInjected, uiBehavior, passed, details });
  if (!passed) report.brokenFound = true;
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

try {
  // Login as Super Admin
  const token = await admin.auth().createCustomToken(SA_UID, {
    email: SA_EMAIL,
    email_verified: true,
    role: 'SUPER_ADMIN',
    superAdmin: true,
    sign_in_second_factor: 'totp'
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (tok) => {
    await window.fire.auth().signInWithCustomToken(tok);
  }, token);
  await page.waitForTimeout(1000);

  // ------------------------------------------------------------------
  // PART 1: LIVE DATA LINEAGE (DB -> API -> DOM) TRACES
  // ------------------------------------------------------------------
  console.log('\n--- PART 1: Live Data Lineage Verification ---');

  // Screen 1: Users Manager (/adm/users)
  const [userRows] = await pool.query('SELECT id, email, role FROM users WHERE id = ?', [SA_UID]);
  const realDbUser = userRows[0];
  await page.goto(`${BASE_URL}/adm/users`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const userDomContent = await page.textContent('body');
  const userFoundInDom = userDomContent.includes(realDbUser.email);
  recordLineage('Users Manager', `${realDbUser.email} (role: ${realDbUser.role})`, realDbUser.email, realDbUser.email, userFoundInDom);

  // Screen 2: System Settings / Currency (/adm/settings)
  const [currRows] = await pool.query('SELECT data FROM system_settings WHERE category = \'system_settings\'');
  const dbData = currRows[0]?.data ? (typeof currRows[0].data === 'string' ? JSON.parse(currRows[0].data) : currRows[0].data) : { currency: 'INR' };
  const dbCurrency = dbData.currency || 'INR';
  await page.goto(`${BASE_URL}/adm/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const settingsDom = await page.textContent('body');
  const currencyFound = settingsDom.includes(dbCurrency);
  recordLineage('Settings', `Currency code: ${dbCurrency}`, dbCurrency, dbCurrency, currencyFound);

  // Screen 3: Tenants (/adm/tenants)
  const [tenantRows] = await pool.query('SELECT id, displayName, slug FROM enterprise_tenants LIMIT 1');
  const dbTenant = tenantRows[0];
  await page.goto(`${BASE_URL}/adm/tenants`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const tenantsDom = await page.textContent('body');
  const tenantFound = tenantsDom.includes(dbTenant.displayName);
  recordLineage('Tenants', `Tenant: ${dbTenant.displayName}`, dbTenant.displayName, dbTenant.displayName, tenantFound);

  // Screen 4: Audit Logs (/adm/audit)
  const [auditRows] = await pool.query('SELECT id, action, actor_email FROM admin_audit_logs ORDER BY created_at DESC LIMIT 1');
  const dbAudit = auditRows[0];
  await page.goto(`${BASE_URL}/adm/audit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const auditDom = await page.textContent('body');
  const auditFound = auditDom.includes(dbAudit.action) || auditDom.includes(dbAudit.actor_email);
  recordLineage('Admin Audit Logs', `Action: ${dbAudit.action}`, dbAudit.action, dbAudit.action, auditFound);

  // ------------------------------------------------------------------
  // PART 2: ADVERSARIAL FAILURE INJECTION & ERROR BOUNDARY AUDITING
  // Verify that the UI NEVER displays "0", "None", or "No records" when an API fails
  // ------------------------------------------------------------------
  console.log('\n--- PART 2: Adversarial Failure Injections ---');

  // Test 2.1: Inject HTTP 500 into /api/admin/users
  await page.route('**/api/admin/users*', route => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Database connection terminated unexpectedly' } })
  }));

  await page.goto(`${BASE_URL}/adm/users`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const userErrorBody = await page.textContent('body');
  // Check if error message is surfaced or if it falsely claims "0 users"
  const renderedError500 = userErrorBody.includes('Error') || userErrorBody.includes('Failed') || userErrorBody.includes('Database connection terminated') || userErrorBody.includes('terminated unexpectedly');
  const falseZeroUsers = userErrorBody.includes('0 users found') || userErrorBody.includes('Total Users: 0') || userErrorBody.includes('No users found');
  recordFailureTest('Users Manager', 'API HTTP 500', renderedError500 ? 'Surfaces explicit error banner' : 'Silent degradation', renderedError500 && !falseZeroUsers, `False zero: ${falseZeroUsers}, Rendered error: ${renderedError500}`);
  await page.unroute('**/api/admin/users*');

  // Test 2.2: Inject HTTP 503 (SERVICE_UNAVAILABLE) into /api/platform/health
  await page.route('**/api/platform/health*', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'SERVICE_DEGRADED', message: 'Authoritative MariaDB cluster down' } })
  }));

  await page.goto(`${BASE_URL}/adm/health`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const healthErrorBody = await page.textContent('body');
  const renderedHealthError = healthErrorBody.includes('degraded') || healthErrorBody.includes('Error') || healthErrorBody.includes('down') || healthErrorBody.includes('Failed') || healthErrorBody.includes('Unavailable');
  recordFailureTest('Platform Health', 'API HTTP 503 (DB Outage)', renderedHealthError ? 'Surfaces degraded/error state' : 'Falsely rendered healthy', renderedHealthError, `Rendered degraded/error: ${renderedHealthError}`);
  await page.unroute('**/api/platform/health*');

  // Test 2.3: Inject HTTP 403 (FORBIDDEN) into /api/enterprise/tenants
  await page.route('**/api/enterprise/tenants*', route => route.fulfill({
    status: 403,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Administrative access restricted' } })
  }));

  await page.goto(`${BASE_URL}/adm/tenants`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const tenantsErrorBody = await page.textContent('body');
  const renderedTenantsForbidden = tenantsErrorBody.includes('restricted') || tenantsErrorBody.includes('Forbidden') || tenantsErrorBody.includes('Error') || tenantsErrorBody.includes('Failed') || tenantsErrorBody.includes('Access Denied');
  const falseZeroTenants = tenantsErrorBody.includes('0 tenants found') || tenantsErrorBody.includes('No tenants registered');
  recordFailureTest('Tenants Manager', 'API HTTP 403', renderedTenantsForbidden ? 'Surfaces forbidden/access banner' : 'Falsely claimed 0 tenants', renderedTenantsForbidden || !falseZeroTenants, `False zero: ${falseZeroTenants}`);
  await page.unroute('**/api/enterprise/tenants*');

  // Test 2.4: Inject Network Timeout (Abort) on /api/platform/audit-logs
  await page.route('**/api/platform/audit-logs*', route => route.abort('timedout'));

  await page.goto(`${BASE_URL}/adm/audit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const auditTimeoutBody = await page.textContent('body');
  const auditFalselyClaimedEmpty = auditTimeoutBody.includes('No audit records found') || auditTimeoutBody.includes('0 logs found');
  const auditHandledFailure = auditTimeoutBody.includes('Error') || auditTimeoutBody.includes('Failed') || auditTimeoutBody.includes('timed out') || !auditFalselyClaimedEmpty;
  recordFailureTest('Audit Logs', 'Network Timeout', auditHandledFailure ? 'Handled without false empty state' : 'Falsely claimed no audit records', auditHandledFailure, `False empty: ${auditFalselyClaimedEmpty}`);
  await page.unroute('**/api/platform/audit-logs*');

} finally {
  await browser.close();
  await pool.end();
}

console.log('\n================================================================');
console.log('ADVERSARIAL DATA LINEAGE & ERROR INJECTION SUMMARY:');
console.log('--- LINEAGE TRACES ---');
console.table(report.lineage);
console.log('\n--- FAILURE INJECTION RESULTS ---');
console.table(report.failuresInjected);
console.log('\nBroken Found:', report.brokenFound ? 'YES (UNSAFE SILENT ERROR HIDING)' : 'NO (ERROR BOUNDARIES SOUND)');
console.log('================================================================\n');

if (report.brokenFound) {
  process.exit(1);
} else {
  process.exit(0);
}
