import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const adminMod = await import('../backend/services/firebaseAdmin.js');
const admin = adminMod.default || adminMod;

if (!admin.apps.length) {
    const pKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: pKey,
        }),
    });
}

const mysqlMod = await import('mysql2/promise');
const mysql = mysqlMod.default || mysqlMod;

const TARGET_URL = (process.env.TARGET_URL || process.env.APP_URL);
const ARTIFACTS_DIR = path.join(__dirname, '../artifacts');
if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

async function run() {
    console.log('=== REAL CHROMIUM E2E: SUPER ADMIN ROLE DASHBOARD SWITCHER ===\n');
    console.log(`Target URL: ${TARGET_URL}`);

    const saUid = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';
    const saEmail = 'bhaskar.beyond@gmail.com';
    const saClaims = {
        email: saEmail,
        email_verified: true,
        role: 'SUPER_ADMIN',
        superAdmin: true,
        sign_in_second_factor: 'totp'
    };

    const customToken = await admin.auth().createCustomToken(saUid, saClaims);

    const browser = await chromium.launch({
        headless: true,
        args: ['--ignore-certificate-errors']
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true
    });
    const page = await context.newPage();

    const results = {
        roleSwitcherRendered: false,
        dropdownOpened: false,
        all5RolesPresent: false,
        supportViewSwitched: false,
        supportBannerVisible: false,
        supportPrivilegesConstrained: false,
        returnToSuperAdminFromSupport: false,
        userViewSwitched: false,
        userBannerVisible: false,
        returnToSuperAdminFromUser: false,
        privilegesPreserved: false,
        auditLogsRecorded: false,
        auditRecords: []
    };

    try {
        // Step 1: Sign in as Super Admin
        console.log('[Step 1] Navigating to target site & authenticating as Super Admin...');
        await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.evaluate(async (t) => {
            await window.fire.auth().signInWithCustomToken(t);
        }, customToken);
        await page.waitForTimeout(1000);

        // Step 2: Navigate to Super Admin console
        console.log('[Step 2] Navigating to /adm/dashboard...');
        await page.goto(`${TARGET_URL}/adm/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('[data-testid="role-switcher-button"]', { timeout: 15000 });
        results.roleSwitcherRendered = true;
        console.log('✓ Role Switcher button rendered in header');

        // Step 3: Open Role Switcher Dropdown
        console.log('[Step 3] Opening Role Switcher dropdown...');
        await page.click('[data-testid="role-switcher-button"]');
        await page.waitForSelector('[data-testid="role-switcher-dropdown"]', { timeout: 5000 });
        results.dropdownOpened = true;

        const superAdminOpt = await page.$('[data-testid="role-option-super_admin"]');
        const adminOpt = await page.$('[data-testid="role-option-admin"]');
        const supportOpt = await page.$('[data-testid="role-option-support"]');
        const auditorOpt = await page.$('[data-testid="role-option-auditor"]');
        const userOpt = await page.$('[data-testid="role-option-user"]');

        if (superAdminOpt && adminOpt && supportOpt && auditorOpt && userOpt) {
            results.all5RolesPresent = true;
            console.log('✓ All 5 authoritative RBAC roles present in dropdown');
        }

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'role_switcher_1_dropdown.png') });

        // Step 4: Switch to SUPPORT view
        console.log('[Step 4] Selecting SUPPORT role view...');
        await page.click('[data-testid="role-option-support"]');
        await page.waitForSelector('[data-testid="role-view-active-banner"]', { timeout: 10000 });
        results.supportViewSwitched = true;

        const bannerText = await page.textContent('[data-testid="role-view-active-banner"]');
        if (bannerText.includes('SUPPORT')) {
            results.supportBannerVisible = true;
            console.log('✓ Active Mode Banner displays SUPPORT simulation');
        }

        // Verify sidebar hides high-privilege items (security/queues/tenants) for Support view
        await page.waitForTimeout(600);
        const securityLink = await page.$('a[href="/adm/security"]');
        const queuesLink = await page.$('a[href="/adm/queues"]');
        const usersLink = await page.$('a[href="/adm/users"]');

        if (!securityLink && !queuesLink && usersLink) {
            results.supportPrivilegesConstrained = true;
            console.log('✓ UI successfully simulated SUPPORT visibility (Security & Queues hidden, Users visible)');
        }

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'role_switcher_2_support_view.png') });

        // Step 5: Return to Super Admin from Support view
        console.log('[Step 5] Clicking "Return to Super Admin"...');
        await page.click('[data-testid="return-to-superadmin-button"]');
        await page.waitForTimeout(600);

        const bannerAfterReturn = await page.$('[data-testid="role-view-active-banner"]');
        const securityLinkRestored = await page.$('a[href="/adm/security"]');
        if (!bannerAfterReturn && securityLinkRestored) {
            results.returnToSuperAdminFromSupport = true;
            console.log('✓ Successfully returned to native Super Admin view (Security restored, banner dismissed)');
        }

        // Step 6: Switch to USER view
        console.log('[Step 6] Opening Role Switcher and selecting USER view...');
        await page.click('[data-testid="role-switcher-button"]');
        await page.waitForSelector('[data-testid="role-option-user"]', { timeout: 5000 });
        await page.click('[data-testid="role-option-user"]');

        await page.waitForURL(/dashboard/, { timeout: 10000 });
        results.userViewSwitched = true;
        console.log('✓ Navigated to candidate User Dashboard');

        await page.waitForSelector('[data-testid="superadmin-user-view-banner"]', { timeout: 10000 });
        results.userBannerVisible = true;
        console.log('✓ Persistent User View Banner is visible on /dashboard');

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'role_switcher_3_user_view.png') });

        // Step 7: Return to Super Admin from User view
        console.log('[Step 7] Clicking "Return to Super Admin Console" from user view...');
        await page.click('[data-testid="return-from-user-view-button"]');
        await page.waitForURL(/adm\/dashboard/, { timeout: 15000 });
        results.returnToSuperAdminFromUser = true;
        console.log('✓ Successfully returned to /adm/dashboard from User View');

        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'role_switcher_4_returned_superadmin.png') });

        // Step 8: Verify real Super Admin authority preserved
        console.log('[Step 8] Testing live privileged API call with current token...');
        const apiTest = await page.evaluate(async () => {
            await new Promise(resolve => {
                if (window.fire?.auth()?.currentUser) return resolve();
                const unsub = window.fire?.auth()?.onAuthStateChanged(u => {
                    if (u) {
                        unsub();
                        resolve();
                    }
                });
            });
            const tok = await window.fire.auth().currentUser.getIdToken();
            const res = await fetch('/api/platform/health', {
                headers: { Authorization: `Bearer ${tok}` }
            });
            const data = await res.json();
            return { status: res.status, data };
        });

        console.log('[Step 8 API Test Response]:', JSON.stringify(apiTest));
        if (apiTest.status === 200 && (apiTest.data?.status === 'HEALTHY' || apiTest.data?.status === 'ok' || apiTest.data?.subsystems)) {
            results.privilegesPreserved = true;
            console.log('✓ Real Super Admin authority is fully intact (HTTP 200 /api/platform/health)');
        }

        // Step 9: Query MariaDB admin_audit_logs for audit events
        console.log('[Step 9] Querying MariaDB admin_audit_logs for SUPER_ADMIN_ROLE_VIEW_SWITCHED...');
        const db = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'resume_builder'
        });

        const [rows] = await db.query(
            "SELECT action, category, severity, actor_email, metadata, created_at FROM admin_audit_logs WHERE action = 'SUPER_ADMIN_ROLE_VIEW_SWITCHED' ORDER BY created_at DESC LIMIT 5"
        );
        await db.end();

        results.auditRecords = rows;
        if (rows.length >= 2) {
            results.auditLogsRecorded = true;
            console.log(`✓ Audit log verified: Found ${rows.length} SUPER_ADMIN_ROLE_VIEW_SWITCHED records in MariaDB!`);
        }

    } catch (err) {
        console.error('Test Execution Error:', err);
    } finally {
        await browser.close();
    }

    console.log('\n=== FINAL VERIFICATION SUMMARY ===');
    console.table({
        'Role Switcher Rendered': results.roleSwitcherRendered ? 'PASS' : 'FAIL',
        'Dropdown Opened': results.dropdownOpened ? 'PASS' : 'FAIL',
        'All 5 RBAC Roles Present': results.all5RolesPresent ? 'PASS' : 'FAIL',
        'Support View Switched': results.supportViewSwitched ? 'PASS' : 'FAIL',
        'Support Banner Visible': results.supportBannerVisible ? 'PASS' : 'FAIL',
        'Support Privileges Constrained': results.supportPrivilegesConstrained ? 'PASS' : 'FAIL',
        'Return From Support': results.returnToSuperAdminFromSupport ? 'PASS' : 'FAIL',
        'User View Switched': results.userViewSwitched ? 'PASS' : 'FAIL',
        'User Banner Visible': results.userBannerVisible ? 'PASS' : 'FAIL',
        'Return From User': results.returnToSuperAdminFromUser ? 'PASS' : 'FAIL',
        'Super Admin Privileges Preserved': results.privilegesPreserved ? 'PASS' : 'FAIL',
        'Audit Logs Recorded in MariaDB': results.auditLogsRecorded ? 'PASS' : 'FAIL',
    });

    const allPassed = Object.values(results).slice(0, 12).every(v => v === true);
    console.log(`\nOverall Result: ${allPassed ? 'ALL ASSERTIONS PASSED (12/12)' : 'SOME CHECKS FAILED'}`);

    fs.writeFileSync(
        path.join(ARTIFACTS_DIR, 'role_switcher_verification_report.json'),
        JSON.stringify(results, null, 2)
    );
}

run();
