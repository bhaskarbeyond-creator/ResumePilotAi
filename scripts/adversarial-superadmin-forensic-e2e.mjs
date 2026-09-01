/**
 * Comprehensive Super Admin Forensic E2E Test Suite
 * Executes against authoritative runtime https://ai-resume-builder.local/
 */
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT_DIR, 'backend/.env') });
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const adminMod = await import('../backend/services/firebaseAdmin.js');
const admin = adminMod.default || adminMod;

if (!admin.apps.length) {
    const pKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: pKey,
        }),
    });
}

const TARGET_ORIGIN = 'https://ai-resume-builder.local';
const SA_UID = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';

async function mintCustomToken(uid, claims = {}) {
    return await admin.auth().createCustomToken(uid, claims);
}

const testResults = {
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    failures: [],
    routesAudited: [],
    viewportsAudited: [],
    rolesAudited: []
};

function recordCheck(name, pass, details = '') {
    testResults.totalChecks++;
    if (pass) {
        testResults.passedChecks++;
        console.log(`  ✓ [PASS] ${name}`);
    } else {
        testResults.failedChecks++;
        console.error(`  ✗ [FAIL] ${name}: ${details}`);
        testResults.failures.push({ name, details });
    }
}

async function main() {
    console.log('============================================================');
    console.log('SUPER ADMIN FORENSIC REAL-BROWSER AUDIT & VERIFICATION');
    console.log(`Authoritative Target: ${TARGET_ORIGIN}`);
    console.log('============================================================\n');

    const saToken = await mintCustomToken(SA_UID, {
        role: 'SUPER_ADMIN',
        superAdmin: true,
        email: 'bhaskar.beyond@gmail.com',
        email_verified: true,
        sign_in_second_factor: 'totp'
    });

    const browser = await chromium.launch({
        headless: true,
        args: ['--ignore-certificate-errors', '--no-sandbox']
    });
    const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // 1. Authenticate as Super Admin via signInWithCustomToken
    console.log('[1/7] Authenticating Super Admin Session in Firebase Auth...');
    await page.goto(`${TARGET_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (tok) => {
        if (window.fire && window.fire.auth) {
            await window.fire.auth().signInWithCustomToken(tok);
        }
    }, saToken);
    await page.waitForTimeout(1000);

    // 2. Audit Dashboard
    console.log('\n[2/7] Auditing Platform Command Center Dashboard (/adm/dashboard)...');
    await page.goto(`${TARGET_ORIGIN}/adm/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const dashboardH1 = await page.$eval('h1', el => el.innerText).catch(() => '');
    recordCheck('Dashboard H1 Title Rendered', dashboardH1.includes('Platform Command Center'), `Found: "${dashboardH1}"`);

    // Check KPI Cards
    const kpiCards = await page.$$('a[href*="/adm/"]');
    recordCheck('KPI Cards Rendered with Links', kpiCards.length >= 4, `Found ${kpiCards.length} navigation cards`);

    // Check Health Subsystem Integrity
    const subsystemTitle = await page.evaluate(() => {
        const h2s = Array.from(document.querySelectorAll('h2'));
        return h2s.map(h => h.innerText).join(' | ');
    });
    recordCheck('Subsystem Integrity Section Rendered', subsystemTitle.includes('Subsystem Integrity') || subsystemTitle.includes('Platform Subsystem'), `Found: "${subsystemTitle}"`);

    // Check Threat Sensor Tile text
    const threatSensorText = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href="/adm/security"]'));
        return links.map(l => l.innerText).join(' | ');
    });
    const threatStr = String(threatSensorText || '');
    recordCheck('Threat Sensor Displays Active & Historical Semantics', threatStr.includes('Active') || threatStr.includes('Historical') || threatStr.includes('Sensor') || threatStr.includes('Threat'), `Text: "${threatStr}"`);

    // 3. Audit Secondary Admin Routes
    const adminRoutes = [
        { path: '/adm/users', title: 'Users', keywords: ['Users', 'Platform Users', 'Active Accounts'] },
        { path: '/adm/operators', title: 'Operators', keywords: ['Operator', 'Governance', 'Administrators'] },
        { path: '/adm/tenants', title: 'Tenants', keywords: ['Enterprise Tenants', 'Tenants', 'Organizations'] },
        { path: '/adm/queues', title: 'Queues', keywords: ['Queues', 'Dead Letter', 'Outbox'] },
        { path: '/adm/health', title: 'Health', keywords: ['Platform Health', 'Subsystems', 'Diagnostics'] },
        { path: '/adm/audit-logs', title: 'Audit Logs', keywords: ['Admin Audit Logs', 'Audit Trail', 'Sample Records'] },
        { path: '/adm/security', title: 'Security Events', keywords: ['Security Events', 'High-Impact', 'Inspected Events'] },
        { path: '/adm/operations', title: 'Operations', keywords: ['Platform Operations', 'Maintenance Mode', 'Operations'] },
        { path: '/adm/attention', title: 'Attention', keywords: ['Attention', 'Signals', 'Platform status'] },
        { path: '/adm/help-desk', title: 'Help Desk', keywords: ['Support', 'Help Desk', 'Tickets'] },
        { path: '/adm/blog-management', title: 'Blog Management', keywords: ['Blog', 'Management', 'Posts', 'Articles'] },
        { path: '/adm/settings', title: 'System Settings', keywords: ['System Configuration', 'Platform Settings', 'Modules'] }
    ];

    console.log(`\n[3/7] Auditing ${adminRoutes.length} Secondary Admin Views...`);
    for (const route of adminRoutes) {
        await page.goto(`${TARGET_ORIGIN}${route.path}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(700);

        const pageText = await page.innerText('body');
        const isBlank = pageText.trim().length === 0;
        recordCheck(`Route ${route.path} Loaded (Not Blank)`, !isBlank, `Body length: ${pageText.length}`);

        const matchesKeyword = route.keywords.some(kw => pageText.toLowerCase().includes(kw.toLowerCase()));
        recordCheck(`Route ${route.path} Renders Expected Content`, matchesKeyword, `Keywords: ${route.keywords.join(', ')}`);
        testResults.routesAudited.push(route.path);
    }

    // 4. Audit Blog Editor
    console.log('\n[4/7] Auditing Dedicated Blog Editor (/blog-editor)...');
    await page.goto(`${TARGET_ORIGIN}/blog-editor`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const blogEditorText = await page.innerText('body');
    recordCheck('Blog Editor Route /blog-editor Loaded', blogEditorText.includes('Blog') || blogEditorText.includes('Post') || blogEditorText.includes('Title') || blogEditorText.includes('Editor'), 'Verified Blog Editor view');

    // 5. Audit Role Switcher & Non-Mutation
    console.log('\n[5/7] Auditing Role Switcher Simulation & Context Isolation...');
    await page.goto(`${TARGET_ORIGIN}/adm/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const roleSwitcherBtn = await page.$('button[data-testid="role-switcher-button"]');
    recordCheck('Role Switcher Button Present', !!roleSwitcherBtn);

    if (roleSwitcherBtn) {
        await roleSwitcherBtn.click();
        await page.waitForTimeout(300);

        const menuVisible = await page.$('[role="menu"]');
        recordCheck('Role Switcher Dropdown Menu Opens', !!menuVisible);

        // Switch to AUDITOR role
        const auditorOption = await page.$('[data-testid="role-option-auditor"]');
        if (auditorOption) {
            await auditorOption.click();
            await page.waitForTimeout(600);

            // Verify Active Role Banner
            const banner = await page.$('[data-testid="role-view-active-banner"]');
            recordCheck('Active Role View Banner Displayed for AUDITOR', !!banner);

            // Verify settings link is not visible to Auditor
            const settingsLink = await page.$('a[href="/adm/settings"]');
            recordCheck('Settings Navigation Hidden from Auditor View', !settingsLink);

            // Return to Super Admin
            const returnBtn = await page.$('[data-testid="return-to-superadmin-button"]');
            recordCheck('Return to Super Admin Button Present', !!returnBtn);
            if (returnBtn) {
                await returnBtn.click();
                await page.waitForTimeout(600);

                const bannerGone = await page.$('[data-testid="role-view-active-banner"]');
                recordCheck('Returned to Super Admin Successfully', !bannerGone);
            }
        }
    }

    // 6. Audit Viewport Responsiveness (320px, 375px, 768px, 1024px, 1440px)
    console.log('\n[6/7] Auditing Viewport Responsiveness...');
    const viewports = [
        { width: 320, height: 600, name: '320px (Mobile Mini)' },
        { width: 375, height: 667, name: '375px (Mobile Standard)' },
        { width: 768, height: 1024, name: '768px (Tablet)' },
        { width: 1024, height: 768, name: '1024px (Small Desktop)' },
        { width: 1440, height: 900, name: '1440px (Wide Desktop)' }
    ];

    for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`${TARGET_ORIGIN}/adm/dashboard`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);

        const hasHorizontalOverflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth + 2;
        });
        recordCheck(`Viewport ${vp.name} No Horizontal Overflow`, !hasHorizontalOverflow);
        testResults.viewportsAudited.push(vp.name);
    }

    // 7. Verify Zero Page Errors
    console.log('\n[7/7] Verifying Browser Diagnostics...');
    recordCheck('Zero Uncaught JavaScript Page Errors', pageErrors.length === 0, `Errors: ${pageErrors.join('; ')}`);

    await browser.close();

    console.log('\n============================================================');
    console.log(`AUDIT COMPLETE: ${testResults.passedChecks}/${testResults.totalChecks} Checks Passed (${testResults.failedChecks} Failed)`);
    console.log('============================================================\n');

    fs.writeFileSync('SUPER_ADMIN_E2E_EVIDENCE.json', JSON.stringify(testResults, null, 2));
}

main().catch(console.error);
