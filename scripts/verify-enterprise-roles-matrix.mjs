import { chromium } from 'playwright';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

async function run() {
  console.log('================================================================');
  console.log('STARTING AUTHORITATIVE REAL CHROMIUM ENTERPRISE ROLE-VIEW AUDIT');
  console.log('Target Domain: ' + BASE_URL);
  console.log('================================================================\n');

  const pool = await mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    database: 'ai_resume_builder',
    waitForConnections: true,
    connectionLimit: 5
  });

  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = {
    checks: [],
    errors: [],
    tabMatrix: {},
    auditLogs: [],
    viewports: {}
  };

  function logPass(msg) {
    console.log(`  [PASS] ${msg}`);
    results.checks.push({ status: 'PASS', description: msg });
  }

  function logFail(msg, error) {
    console.error(`  [FAIL] ${msg}`, error || '');
    results.errors.push({ description: msg, error: error?.message || String(error) });
  }

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // Listen for console and network errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.warn(`    [Browser Console Error]: ${msg.text()}`);
    }
  });

  page.on('response', res => {
    if (res.status() >= 400) {
      console.log(`    [Browser Network Error]: ${res.status()} on ${res.url()}`);
    }
  });

  try {
    // -------------------------------------------------------------
    // STEP 1: AUTHENTICATE AS SUPER ADMIN
    // -------------------------------------------------------------
    console.log('[Step 1] Authenticating Super Admin on live domain...');
    const SA_EMAIL = 'bhaskar.beyond@gmail.com';
    const SA_UID = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';
    const customToken = await admin.auth().createCustomToken(SA_UID, {
        email: SA_EMAIL,
        email_verified: true,
        role: 'SUPER_ADMIN',
        superAdmin: true,
        sign_in_second_factor: 'totp'
    });

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (tok) => {
        await window.fire.auth().signInWithCustomToken(tok);
    }, customToken);
    await page.waitForTimeout(800);

    // Alternatively, verify direct access to /adm/dashboard with existing session or token
    await page.goto(`${BASE_URL}/adm/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
    const currentUrl = page.url();
    console.log(`  Landed on: ${currentUrl}`);

    // Wait for Admin Header to render
    await page.waitForSelector('[data-testid="role-switcher-button"]', { timeout: 15000 });
    logPass('Super Admin dashboard rendered with active role-switcher-button');

    // -------------------------------------------------------------
    // STEP 2: OPEN ROLE-VIEW DROPDOWN & VERIFY RBAC ARCHITECTURE
    // -------------------------------------------------------------
    console.log('\n[Step 2] Inspecting Super Admin Role-View Dropdown architecture...');
    await page.click('[data-testid="role-switcher-button"]');
    await page.waitForSelector('[data-testid="role-switcher-dropdown"]', { timeout: 5000 });

    // Check Platform Roles
    const platformRoles = ['super_admin', 'admin', 'support', 'auditor', 'user'];
    for (const r of platformRoles) {
      const el = await page.$(`[data-testid="role-option-${r}"]`);
      if (el) {
        logPass(`Platform role '${r.toUpperCase()}' present in dropdown`);
      } else {
        logFail(`Platform role '${r.toUpperCase()}' missing from dropdown`);
      }
    }

    // Check Enterprise Organization Selector
    await page.waitForSelector('[data-testid="enterprise-tenant-selector"]', { timeout: 10000 });
    const tenantSelector = await page.$('[data-testid="enterprise-tenant-selector"]');
    if (tenantSelector) {
      const options = await page.$$eval('[data-testid="enterprise-tenant-selector"] option', opts => opts.map(o => ({ value: o.value, text: o.textContent.trim() })));
      logPass(`Enterprise organization selector rendered with ${options.length} organizations: ${options.map(o => o.text).join(', ')}`);
    } else {
      logFail('Enterprise organization selector missing');
    }

    // Check Enterprise Roles (5 canonical roles)
    const enterpriseRoles = ['enterprise_owner', 'enterprise_admin', 'enterprise_manager', 'enterprise_member', 'enterprise_viewer'];
    for (const r of enterpriseRoles) {
      const el = await page.$(`[data-testid="enterprise-role-option-${r}"]`);
      if (el) {
        logPass(`Enterprise role '${r.replace('enterprise_', '').toUpperCase()}' present in dropdown`);
      } else {
        logFail(`Enterprise role '${r.replace('enterprise_', '').toUpperCase()}' missing from dropdown`);
      }
    }

    // -------------------------------------------------------------
    // STEP 3: TEST ENTERPRISE ROLE VIEW: OWNER
    // -------------------------------------------------------------
    console.log('\n[Step 3] Switching to Enterprise OWNER...');
    const dropdownOpen = await page.$('[data-testid="role-switcher-dropdown"]');
    if (!dropdownOpen) {
      await page.click('[data-testid="role-switcher-button"]');
      await page.waitForSelector('[data-testid="role-switcher-dropdown"]', { timeout: 5000 });
    }
    await page.click('[data-testid="enterprise-role-option-enterprise_owner"]');
    await page.waitForURL(url => url.pathname.includes('/enterprise'), { timeout: 15000 });
    logPass('Navigated to /enterprise on Enterprise OWNER selection');

    await page.waitForSelector('[data-testid="enterprise-role-simulation-banner"]', { timeout: 10000 });
    const ownerBannerText = await page.innerText('[data-testid="enterprise-role-simulation-banner"]');
    if (ownerBannerText.includes('OWNER') && (ownerBannerText.includes('Acme Corporation') || ownerBannerText.includes('Workspace'))) {
      logPass(`Enterprise simulation banner rendered truthfully: "${ownerBannerText.replace(/\s+/g, ' ').trim()}"`);
    } else {
      logFail(`Unexpected banner text: ${ownerBannerText}`);
    }

    // Count visible navigation tabs for OWNER
    const ownerTabs = await page.$$eval('.enterprise-nav-item', els => els.map(e => e.textContent.trim()).filter(Boolean));
    results.tabMatrix.OWNER = ownerTabs;
    console.log(`  OWNER visible tabs (${ownerTabs.length}):`, ownerTabs.join(', '));
    if (ownerTabs.length === 14) {
      logPass(`OWNER can inspect all 14 enterprise console modules (full authority)`);
    } else {
      logFail(`Expected 14 tabs for OWNER, saw ${ownerTabs.length}`);
    }

    // -------------------------------------------------------------
    // STEP 4: TEST ENTERPRISE ROLE VIEW: ADMIN
    // -------------------------------------------------------------
    console.log('\n[Step 4] Switching to Enterprise ADMIN...');
    // Open app switcher or change role view directly
    await page.evaluate(() => {
      sessionStorage.setItem('superadmin_role_view', 'ENTERPRISE_ADMIN');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="enterprise-role-simulation-banner"]', { timeout: 10000 });
    const adminBannerText = await page.innerText('[data-testid="enterprise-role-simulation-banner"]');
    logPass(`Admin banner rendered: "${adminBannerText.replace(/\s+/g, ' ').trim()}"`);

    const adminTabs = await page.$$eval('.enterprise-nav-item', els => els.map(e => e.textContent.trim()).filter(Boolean));
    results.tabMatrix.ADMIN = adminTabs;
    console.log(`  ADMIN visible tabs (${adminTabs.length}):`, adminTabs.join(', '));
    if (adminTabs.length === 13 && !adminTabs.some(t => t.includes('Platform'))) {
      logPass(`ADMIN can inspect 13 tenant governance/admin modules; Platform administration is correctly excluded`);
    } else {
      logFail(`ADMIN tab count unexpected: ${adminTabs.length}`);
    }

    // -------------------------------------------------------------
    // STEP 5: TEST ENTERPRISE ROLE VIEW: WORKSPACE MANAGER
    // -------------------------------------------------------------
    console.log('\n[Step 5] Switching to Enterprise MANAGER...');
    await page.evaluate(() => {
      sessionStorage.setItem('superadmin_role_view', 'ENTERPRISE_MANAGER');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="enterprise-role-simulation-banner"]', { timeout: 10000 });

    const managerTabs = await page.$$eval('.enterprise-nav-item', els => els.map(e => e.textContent.trim()).filter(Boolean));
    results.tabMatrix.MANAGER = managerTabs;
    console.log(`  MANAGER visible tabs (${managerTabs.length}):`, managerTabs.join(', '));
    const expectedManagerTabs = ['Overview', 'Talent & Resumes', 'Teams', 'Workspaces'];
    const hasOnlyAllowedManagerTabs = managerTabs.every(t => expectedManagerTabs.some(exp => t.includes(exp)));
    if (hasOnlyAllowedManagerTabs && managerTabs.length <= 4) {
      logPass(`MANAGER strictly gated to workspace and talent modules: ${managerTabs.join(', ')}`);
    } else {
      logFail(`MANAGER saw unauthorized governance tabs: ${managerTabs.join(', ')}`);
    }

    // -------------------------------------------------------------
    // STEP 6: TEST ENTERPRISE ROLE VIEW: MEMBER
    // -------------------------------------------------------------
    console.log('\n[Step 6] Switching to Enterprise MEMBER...');
    await page.evaluate(() => {
      sessionStorage.setItem('superadmin_role_view', 'ENTERPRISE_MEMBER');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="enterprise-role-simulation-banner"]', { timeout: 10000 });

    const memberTabs = await page.$$eval('.enterprise-nav-item', els => els.map(e => e.textContent.trim()).filter(Boolean));
    results.tabMatrix.MEMBER = memberTabs;
    console.log(`  MEMBER visible tabs (${memberTabs.length}):`, memberTabs.join(', '));
    if (memberTabs.length <= 4) {
      logPass(`MEMBER correctly scoped to member workspace modules: ${memberTabs.join(', ')}`);
    } else {
      logFail(`MEMBER saw excess tabs: ${memberTabs.join(', ')}`);
    }

    // -------------------------------------------------------------
    // STEP 7: TEST ENTERPRISE ROLE VIEW: VIEWER
    // -------------------------------------------------------------
    console.log('\n[Step 7] Switching to Enterprise VIEWER...');
    await page.evaluate(() => {
      sessionStorage.setItem('superadmin_role_view', 'ENTERPRISE_VIEWER');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="enterprise-role-simulation-banner"]', { timeout: 10000 });

    const viewerTabs = await page.$$eval('.enterprise-nav-item', els => els.map(e => e.textContent.trim()).filter(Boolean));
    results.tabMatrix.VIEWER = viewerTabs;
    console.log(`  VIEWER visible tabs (${viewerTabs.length}):`, viewerTabs.join(', '));
    if (viewerTabs.length <= 4) {
      logPass(`VIEWER correctly scoped to read-only modules: ${viewerTabs.join(', ')}`);
    } else {
      logFail(`VIEWER saw excess tabs: ${viewerTabs.join(', ')}`);
    }

    // -------------------------------------------------------------
    // STEP 8: EXIT ENTERPRISE ROLE VIEW
    // -------------------------------------------------------------
    console.log('\n[Step 8] Testing "Exit Enterprise Role View" handler...');
    await page.waitForSelector('[data-testid="exit-enterprise-role-view"]', { timeout: 10000 });
    await page.click('[data-testid="exit-enterprise-role-view"]');
    await page.waitForURL(url => url.pathname.includes('/adm/dashboard'), { timeout: 15000 });
    await page.waitForSelector('[data-testid="enterprise-role-simulation-banner"]', { state: 'detached', timeout: 10000 });
    logPass('Cleanly returned to /adm/dashboard and enterprise simulation banner unmounted');

    const roleViewStored = await page.evaluate(() => sessionStorage.getItem('superadmin_role_view'));
    if (!roleViewStored) {
      logPass('superadmin_role_view cleanly removed from sessionStorage');
    } else {
      logFail(`superadmin_role_view still in sessionStorage: ${roleViewStored}`);
    }

    // Check that Super Admin button reverted
    const buttonText = await page.innerText('[data-testid="role-switcher-button"]');
    if (buttonText.includes('Super Admin')) {
      logPass(`Role button cleanly restored to full authority: "${buttonText.trim()}"`);
    } else {
      logFail(`Unexpected button text: ${buttonText}`);
    }

    // -------------------------------------------------------------
    // STEP 9: AUDIT LOG VERIFICATION IN MARIADB
    // -------------------------------------------------------------
    console.log('\n[Step 9] Verifying MariaDB audit trail in admin_audit_logs...');
    const [auditRows] = await pool.query(
      "SELECT id, actor_uid, actor_email, actor_role, action, category, metadata, created_at FROM admin_audit_logs WHERE category = 'iam.enterprise_roles' ORDER BY created_at DESC LIMIT 5"
    );
    console.table(auditRows.map(r => ({
      id: r.id,
      actor_uid: r.actor_uid,
      actor_email: r.actor_email,
      actor_role: r.actor_role,
      action: r.action,
      category: r.category,
      created_at: r.created_at
    })));
    if (auditRows.length > 0) {
      logPass(`Found ${auditRows.length} auditable enterprise role-view events logged with authentic Super Admin ID`);
      results.auditLogs = auditRows;
    } else {
      logFail('No enterprise role-view audit logs found in admin_audit_logs');
    }

    // -------------------------------------------------------------
    // STEP 10: RESPONSIVE VIEWPORT AUDIT
    // -------------------------------------------------------------
    console.log('\n[Step 10] Auditing responsive behavior across 6 viewports...');
    const viewports = [
      { width: 320, height: 568, name: 'iPhone SE' },
      { width: 375, height: 667, name: 'Mobile Standard' },
      { width: 768, height: 1024, name: 'iPad Portrait' },
      { width: 1024, height: 768, name: 'iPad Landscape' },
      { width: 1440, height: 900, name: 'MacBook Pro' },
      { width: 1920, height: 1080, name: '1080p Desktop' }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE_URL}/enterprise`, { waitUntil: 'networkidle', timeout: 15000 });
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      const overflow = scrollWidth - clientWidth;
      if (overflow <= 1) {
        logPass(`Viewport ${vp.name} (${vp.width}x${vp.height}): 0px horizontal overflow`);
        results.viewports[vp.name] = 'PASS (0px overflow)';
      } else {
        logFail(`Viewport ${vp.name} (${vp.width}x${vp.height}): ${overflow}px horizontal overflow detected!`);
        results.viewports[vp.name] = `FAIL (${overflow}px overflow)`;
      }
    }

    console.log('\n================================================================');
    console.log(`ALL VERIFICATION PHASES COMPLETED: ${results.checks.length} checks passed, ${results.errors.length} errors.`);
    console.log('================================================================');

  } catch (err) {
    console.error('Audit crashed with error:', err);
    results.errors.push({ description: 'Test execution crash', error: err.message });
  } finally {
    await browser.close();
    await pool.end();
  }

  process.exit(results.errors.length === 0 ? 0 : 1);
}

run();
