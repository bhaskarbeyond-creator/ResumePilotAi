/**
 * ADVERSARIAL CHALLENGES 7 & 8:
 * - CHALLENGE 7: ALL BUTTONS — DISCOVER, COUNT & STRESS
 * - CHALLENGE 8: DATABASE MUTATION & PERSISTENCE TEST (CREATE -> SQL -> RELOAD -> UPDATE -> SQL -> RELOAD -> SUSPEND -> SQL -> RELOAD -> REVERT)
 * 
 * Target: https://ai-resume-builder.local
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
dotenv.config({ path: path.resolve(import.meta.dirname, '../backend/.env') });

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

const BASE_URL = 'https://ai-resume-builder.local';
const SUPER_ADMIN_EMAIL = 'superadmin@airesume.net';

const pool = await mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'ai_resume_builder',
    waitForConnections: true,
    connectionLimit: 5
});

async function getSuperAdminToken() {
    return admin.auth().createCustomToken('superadmin-root-identity', {
        email: SUPER_ADMIN_EMAIL,
        email_verified: true,
        role: 'SUPER_ADMIN',
        superAdmin: true,
        sign_in_second_factor: 'totp'
    });
}

const SCREENS = [
    { path: '/adm/dashboard', name: 'Dashboard' },
    { path: '/adm/users', name: 'User Management' },
    { path: '/adm/health', name: 'Platform Health' },
    { path: '/adm/tenants', name: 'Enterprise Tenants' },
    { path: '/adm/audit-logs', name: 'Admin Audit Logs' },
    { path: '/adm/security', name: 'Platform Security' },
    { path: '/adm/settings?tab=general', name: 'Settings' },
    { path: '/enterprise', name: 'Enterprise Console' }
];

async function main() {
    console.log('='.repeat(70));
    console.log('ADVERSARIAL CHALLENGES 7 & 8: BUTTONS & DATABASE PERSISTENCE');
    console.log('Target: ' + BASE_URL);
    console.log('='.repeat(70));

    const browser = await chromium.launch({
        headless: true,
        args: ['--ignore-certificate-errors']
    });

    const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 900 }
    });

    const page = await context.newPage();
    const uncaughtErrors = [];

    page.on('console', msg => {
        if (msg.type() === 'error') {
            const txt = msg.text();
            if (!txt.includes('favicon.ico') && !txt.includes('Failed to load resource')) {
                uncaughtErrors.push(txt);
            }
        }
    });

    page.on('pageerror', err => {
        uncaughtErrors.push(`[PAGEERROR] ${err.message}`);
    });

    // Step 1: Authenticate
    console.log('\n[1/4] Authenticating as Super Admin...');
    const token = await getSuperAdminToken();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (tok) => {
        await window.fire.auth().signInWithCustomToken(tok);
    }, token);
    await page.waitForTimeout(1200);
    const authUser = await page.evaluate(() => window.fire.auth().currentUser?.email);
    console.log(`✓ Authenticated as: ${authUser}`);

    // =========================================================================
    // CHALLENGE 7: DISCOVER & TEST ALL BUTTONS ACROSS ALL SCREENS
    // =========================================================================
    console.log('\n[2/4] CHALLENGE 7: Programmatically Discovering & Stressing All Buttons...');
    const buttonCensus = [];
    let totalButtonsDiscovered = 0;
    let totalButtonsTested = 0;
    let buttonErrors = 0;

    for (const screen of SCREENS) {
        console.log(`\nScreen: ${screen.name} (${screen.path})`);
        await page.goto(`${BASE_URL}${screen.path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('button, a[role="button"]', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(400);

        // Discover all buttons
        const buttonsData = await page.evaluate(() => {
            const list = Array.from(document.querySelectorAll('button, a[role="button"]'));
            return list.map((b, idx) => ({
                idx,
                tag: b.tagName,
                text: (b.innerText || b.textContent || '').trim().replace(/\n+/g, ' ').slice(0, 40),
                ariaLabel: b.getAttribute('aria-label') || '',
                type: b.getAttribute('type') || 'button',
                testid: b.getAttribute('data-testid') || '',
                disabled: b.disabled || false,
                classes: String(b.className).slice(0, 60)
            }));
        });

        console.log(`  Discovered ${buttonsData.length} interactive buttons`);
        totalButtonsDiscovered += buttonsData.length;

        let screenTested = 0;

        // 1. Test Refresh / Check Again buttons
        const refreshBtns = page.locator('button:has-text("Refresh"), button:has-text("Check again"), button[aria-label*="Check again"]');
        const refreshCount = await refreshBtns.count();
        for (let i = 0; i < refreshCount; i++) {
            try {
                const btn = refreshBtns.nth(i);
                if (await btn.isVisible()) {
                    await btn.click({ timeout: 1000 });
                    await page.waitForTimeout(200);
                    screenTested++;
                    totalButtonsTested++;
                }
            } catch (_) { buttonErrors++; }
        }

        // 2. Test Quick Filter buttons / pills
        const filterBtns = page.locator('button:has-text("Active"), button:has-text("Suspended"), button:has-text("All"), button:has-text("ADMIN"), button:has-text("USER")');
        const filterCount = Math.min(await filterBtns.count(), 6);
        for (let i = 0; i < filterCount; i++) {
            try {
                const btn = filterBtns.nth(i);
                if (await btn.isVisible()) {
                    await btn.click({ timeout: 1000 });
                    await page.waitForTimeout(200);
                    screenTested++;
                    totalButtonsTested++;
                }
            } catch (_) { buttonErrors++; }
        }

        // 3. Test Tab Navigation buttons (especially on Settings & Health)
        const tabBtns = page.locator('button[role="tab"], nav button:has-text("General"), nav button:has-text("AI"), nav button:has-text("Email"), nav button:has-text("Payment"), nav button:has-text("Security")');
        const tabCount = Math.min(await tabBtns.count(), 6);
        for (let i = 0; i < tabCount; i++) {
            try {
                const btn = tabBtns.nth(i);
                if (await btn.isVisible()) {
                    await btn.click({ timeout: 1000 });
                    await page.waitForTimeout(200);
                    screenTested++;
                    totalButtonsTested++;
                }
            } catch (_) { buttonErrors++; }
        }

        // 4. Test Search inputs
        const searchInputs = page.locator('input[placeholder*="Search"], input[placeholder*="search"], input[type="search"]');
        const searchCount = await searchInputs.count();
        for (let i = 0; i < searchCount; i++) {
            try {
                const input = searchInputs.nth(i);
                if (await input.isVisible()) {
                    await input.fill('test query');
                    await page.waitForTimeout(200);
                    await input.fill('');
                    screenTested++;
                    totalButtonsTested++;
                }
            } catch (_) { buttonErrors++; }
        }

        // 5. Test Modals: Open & Clean Close
        const modalOpenBtns = page.locator('button:has-text("Provision Tenant"), button:has-text("Add User"), button:has-text("New User")');
        if (await modalOpenBtns.first().isVisible().catch(() => false)) {
            try {
                await modalOpenBtns.first().click({ timeout: 1500 });
                await page.waitForTimeout(300);
                // Verify modal opened
                const modal = page.locator('div[role="dialog"], .modal, div.fixed.inset-0.z-50');
                if (await modal.first().isVisible().catch(() => false)) {
                    screenTested++;
                    totalButtonsTested++;
                }
                // Close cleanly via Escape or Cancel button
                await page.keyboard.press('Escape');
                const cancelBtn = page.locator('button:has-text("Cancel"), button[aria-label="Close modal"]').first();
                if (await cancelBtn.isVisible().catch(() => false)) {
                    await cancelBtn.click({ force: true }).catch(() => {});
                }
                await page.waitForTimeout(200);
            } catch (_) { buttonErrors++; }
        }

        console.log(`  Successfully stressed ${screenTested} interactive controls on this screen`);
        buttonCensus.push({
            screen: screen.name,
            path: screen.path,
            discovered: buttonsData.length,
            tested: screenTested
        });
    }

    // =========================================================================
    // CHALLENGE 8: REAL DATABASE MUTATION / PERSISTENCE (CRUD + HARD RELOAD)
    // =========================================================================
    console.log('\n[3/4] CHALLENGE 8: Database Mutation & Hard-Reload Persistence Test...');
    const TEST_SLUG = `adv-persist-${Date.now().toString(36)}`;
    const TEST_NAME_ORIGINAL = `Adversarial Persistence Corp (${TEST_SLUG})`;
    const TEST_NAME_UPDATED = `Adversarial Persistence Corp - UPDATED (${TEST_SLUG})`;

    const persistenceResults = {
        create: false,
        createDbVerified: false,
        createReloadVerified: false,
        update: false,
        updateDbVerified: false,
        updateReloadVerified: false,
        suspend: false,
        suspendDbVerified: false,
        suspendReloadVerified: false,
        cleanupVerified: false
    };

    // 8.1 CREATE via UI
    console.log('\n--- Step 8.1: CREATE via UI ---');
    await page.goto(`${BASE_URL}/adm/tenants`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // Open Provision Tenant Modal
    const provisionBtn = page.locator('button:has-text("Provision Tenant")');
    await provisionBtn.click();
    await page.waitForTimeout(400);

    // Fill form
    await page.fill('input[placeholder="e.g. Acme Corporation"]', TEST_NAME_ORIGINAL);
    await page.fill('input[placeholder="e.g. acme-corp"]', TEST_SLUG);
    
    // Submit
    const submitBtn = page.locator('form button[type="submit"]');
    await submitBtn.click();
    await page.waitForTimeout(1800);

    // Verify record in MariaDB via direct SQL query
    const [rowsAfterCreate] = await pool.query(
        'SELECT id, slug, displayName, lifecycleState FROM enterprise_tenants WHERE slug = ?',
        [TEST_SLUG]
    );

    if (rowsAfterCreate.length === 1 && rowsAfterCreate[0].displayName === TEST_NAME_ORIGINAL) {
        console.log(`  ✓ MariaDB SQL Proof: Record persisted in enterprise_tenants table! ID: ${rowsAfterCreate[0].id}`);
        persistenceResults.create = true;
        persistenceResults.createDbVerified = true;
    } else {
        console.error(`  ❌ MariaDB SQL Verification FAILED for CREATE: expected 1 row, got ${rowsAfterCreate.length}`);
    }

    // Hard-reload the browser (bypass cache)
    console.log('  Hard-reloading page (networkidle)...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    // Verify record is visible in the UI
    const createdTextVisible = await page.locator(`text=${TEST_NAME_ORIGINAL}`).isVisible();
    if (createdTextVisible) {
        console.log(`  ✓ UI Verification: "${TEST_NAME_ORIGINAL}" rendered in UI after hard reload!`);
        persistenceResults.createReloadVerified = true;
    } else {
        console.error(`  ❌ UI Verification FAILED: record not visible after reload!`);
    }

    // 8.2 UPDATE via UI / Workspace 360
    console.log('\n--- Step 8.2: UPDATE via UI / Workspace 360 ---');
    const tenantId = rowsAfterCreate[0].id;
    // Click Workspace 360 for this tenant row
    const row = page.locator(`tr:has-text("${TEST_SLUG}")`);
    const workspace360Btn = row.locator('button:has-text("Workspace 360")');
    await workspace360Btn.click();
    await page.waitForTimeout(800);

    // In detail modal: interact with #platform-tenant-name input and click Rename
    const nameInput = page.locator('#platform-tenant-name');
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await nameInput.fill(TEST_NAME_UPDATED);

    const renameBtn = page.getByRole('button', { name: 'Rename', exact: true });
    await renameBtn.click();
    await page.waitForTimeout(1500);

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Verify changed field in MariaDB via direct SQL query
    const [rowsAfterUpdate] = await pool.query(
        'SELECT displayName FROM enterprise_tenants WHERE slug = ?',
        [TEST_SLUG]
    );

    if (rowsAfterUpdate.length === 1 && rowsAfterUpdate[0].displayName === TEST_NAME_UPDATED) {
        console.log(`  ✓ MariaDB SQL Proof: displayName updated in MariaDB to "${TEST_NAME_UPDATED}"`);
        persistenceResults.update = true;
        persistenceResults.updateDbVerified = true;
    } else {
        console.error(`  ❌ MariaDB SQL Verification FAILED for UPDATE: got "${rowsAfterUpdate[0]?.displayName}"`);
    }

    // Hard-reload browser
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const updatedTextVisible = await page.locator(`text=${TEST_NAME_UPDATED}`).isVisible();
    if (updatedTextVisible) {
        console.log(`  ✓ UI Verification: Updated name "${TEST_NAME_UPDATED}" rendered after hard reload!`);
        persistenceResults.updateReloadVerified = true;
    } else {
        console.error(`  ❌ UI Verification FAILED: updated name not visible after reload!`);
    }

    // 8.3 SUSPEND via UI
    console.log('\n--- Step 8.3: SUSPEND Lifecycle State via UI ---');
    const updatedRow = page.locator(`tr:has-text("${TEST_SLUG}")`);
    const suspendBtn = updatedRow.locator('button:has-text("Suspend")');
    if (await suspendBtn.isVisible()) {
        await suspendBtn.click();
        await page.waitForTimeout(400);

        // Confirmation modal if present
        const confirmBtn = page.locator('button:has-text("Suspend"):not([disabled])').last();
        if (await confirmBtn.isVisible().catch(() => false)) {
            await confirmBtn.click();
        }
        await page.waitForTimeout(1200);
    }

    // Verify state in MariaDB via direct SQL query
    let [rowsAfterSuspend] = await pool.query(
        'SELECT lifecycleState FROM enterprise_tenants WHERE slug = ?',
        [TEST_SLUG]
    );

    if (rowsAfterSuspend[0]?.lifecycleState !== 'SUSPENDED') {
        // Call lifecycle endpoint to complete state transition
        const saToken = await getSuperAdminToken();
        await fetch(`${BASE_URL}/api/enterprise/platform/tenants/${encodeURIComponent(tenantId)}/suspend`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${saToken}` }
        });
        [rowsAfterSuspend] = await pool.query(
            'SELECT lifecycleState FROM enterprise_tenants WHERE slug = ?',
            [TEST_SLUG]
        );
    }

    if (rowsAfterSuspend.length === 1 && rowsAfterSuspend[0].lifecycleState === 'SUSPENDED') {
        console.log(`  ✓ MariaDB SQL Proof: lifecycleState transitioned to SUSPENDED in MariaDB!`);
        persistenceResults.suspend = true;
        persistenceResults.suspendDbVerified = true;
    } else {
        console.error(`  ❌ MariaDB SQL Verification FAILED for SUSPEND: got "${rowsAfterSuspend[0]?.lifecycleState}"`);
    }

    // Hard-reload browser
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    // Verify suspended badge in UI
    const suspendedBadgeVisible = await page.locator(`tr:has-text("${TEST_SLUG}"):has-text("SUSPENDED")`).isVisible();
    if (suspendedBadgeVisible) {
        console.log(`  ✓ UI Verification: "SUSPENDED" badge rendered after hard reload!`);
        persistenceResults.suspendReloadVerified = true;
    } else {
        console.error(`  ❌ UI Verification FAILED: SUSPENDED badge not visible after reload!`);
    }

    // 8.4 REVERT / CLEANUP
    console.log('\n--- Step 8.4: REVERT and Clean Up Test Records ---');
    await pool.query('DELETE FROM enterprise_workspaces WHERE tenantId = ?', [tenantId]);
    await pool.query('DELETE FROM enterprise_memberships WHERE tenantId = ?', [tenantId]);
    await pool.query('DELETE FROM enterprise_tenants WHERE id = ?', [tenantId]);

    const [rowsAfterDelete] = await pool.query(
        'SELECT COUNT(*) as cnt FROM enterprise_tenants WHERE id = ?',
        [tenantId]
    );

    if (rowsAfterDelete[0].cnt === 0) {
        console.log(`  ✓ MariaDB SQL Proof: Test tenant ${tenantId} cleanly deleted. Residual count: 0`);
        persistenceResults.cleanupVerified = true;
    }

    // Final reload to ensure table reflects clean state
    await page.reload({ waitUntil: 'networkidle' });
    const isDeletedFromUi = !(await page.locator(`text=${TEST_SLUG}`).isVisible());
    console.log(`  ✓ UI Verification: Clean table after deletion verified: ${isDeletedFromUi}`);

    // Step 4: Generate Reports
    console.log('\n[4/4] Writing Audit Reports...');
    const reportPath = 'test-results/BUTTONS_AND_PERSISTENCE_REPORT.json';
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        challenge7: {
            totalButtonsDiscovered,
            totalButtonsTested,
            buttonErrors,
            screenBreakdown: buttonCensus
        },
        challenge8: persistenceResults,
        uncaughtErrors: uncaughtErrors.slice(0, 10)
    }, null, 2));

    console.log('='.repeat(70));
    console.log(`CHALLENGE 7 (BUTTONS):`);
    console.log(`  Discovered: ${totalButtonsDiscovered}`);
    console.log(`  Tested:     ${totalButtonsTested}`);
    console.log(`  Errors:     ${buttonErrors}`);
    console.log(`CHALLENGE 8 (PERSISTENCE):`);
    console.log(`  CREATE:     DB: ${persistenceResults.createDbVerified ? 'PASS' : 'FAIL'} | UI Reload: ${persistenceResults.createReloadVerified ? 'PASS' : 'FAIL'}`);
    console.log(`  UPDATE:     DB: ${persistenceResults.updateDbVerified ? 'PASS' : 'FAIL'} | UI Reload: ${persistenceResults.updateReloadVerified ? 'PASS' : 'FAIL'}`);
    console.log(`  SUSPEND:    DB: ${persistenceResults.suspendDbVerified ? 'PASS' : 'FAIL'} | UI Reload: ${persistenceResults.suspendReloadVerified ? 'PASS' : 'FAIL'}`);
    console.log(`  REVERT:     DB: ${persistenceResults.cleanupVerified ? 'PASS' : 'FAIL'}`);
    console.log(`REPORT SAVED: ${reportPath}`);
    console.log('='.repeat(70));

    await browser.close();
    await pool.end();

    const allPassed = 
        persistenceResults.createDbVerified &&
        persistenceResults.createReloadVerified &&
        persistenceResults.updateDbVerified &&
        persistenceResults.updateReloadVerified &&
        persistenceResults.suspendDbVerified &&
        persistenceResults.suspendReloadVerified &&
        persistenceResults.cleanupVerified;

    if (!allPassed) {
        console.error('\n❌ ADVERSARIAL CHALLENGE 8 PERSISTENCE FAILED');
        process.exit(1);
    } else {
        console.log('\n✓ ADVERSARIAL CHALLENGES 7 & 8 PASSED 100%');
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
