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

const TARGET_URL = process.env.TARGET_URL || process.env.APP_URL || 'https://ai-resume-builder.local';
const ARTIFACTS_DIR = path.join(__dirname, '../artifacts/live_audit');
if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const SCREENS = [
    { name: 'Dashboard', path: '/adm/dashboard' },
    { name: 'Users Manager', path: '/adm/users' },
    { name: 'Tenants Management', path: '/adm/tenants' },
    { name: 'Subscriptions', path: '/adm/subscriptions' },
    { name: 'Attention Ledger', path: '/adm/attention' },
    { name: 'Operators', path: '/adm/operators' },
    { name: 'Platform Operations', path: '/adm/operations' },
    { name: 'Audit Logs', path: '/adm/audit-logs' },
    { name: 'Platform Security', path: '/adm/security' },
    { name: 'Platform Health', path: '/adm/health' },
    { name: 'Enterprise Queues', path: '/adm/queues' },
    { name: 'General Settings', path: '/adm/settings' },
    { name: 'AI Settings', path: '/adm/settings/ai' },
    { name: 'Export Settings', path: '/adm/settings/export' },
    { name: 'Help Desk', path: '/adm/helpdesk' }
];

async function run() {
    console.log('=== DEEP LIVE DOM ADVERSARIAL AUDIT ===');
    console.log(`Target: ${TARGET_URL}\n`);

    const customToken = await admin.auth().createCustomToken('OhZdiSIFL7ePA1TMkfu9bnR935D3', {
        email: 'bhaskar.beyond@gmail.com',
        email_verified: true,
        role: 'SUPER_ADMIN',
        superAdmin: true,
        sign_in_second_factor: 'totp'
    });

    const browser = await chromium.launch({
        headless: true,
        args: ['--ignore-certificate-errors']
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true
    });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    const networkFailures = [];

    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push({ text: msg.text(), location: msg.location() });
        }
    });

    page.on('pageerror', err => {
        pageErrors.push({ message: err.message, stack: err.stack });
    });

    page.on('response', res => {
        const status = res.status();
        const url = res.url();
        if (status >= 400 && !url.includes('favicon.ico')) {
            networkFailures.push({ url, status, statusText: res.statusText() });
        }
    });

    // Authenticate
    await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (tok) => {
        await window.fire.auth().signInWithCustomToken(tok);
    }, customToken);
    await page.waitForTimeout(800);

    const screenResults = [];

    for (const scr of SCREENS) {
        console.log(`Auditing screen: ${scr.name} (${scr.path})...`);
        const startErrCount = consoleErrors.length;
        const startNetCount = networkFailures.length;

        await page.goto(`${TARGET_URL}${scr.path}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        // Visual checks
        const check = await page.evaluate(() => {
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            const hasOverflow = docWidth > winWidth;
            const bodyLength = document.body.innerText.trim().length;
            const isBlank = bodyLength < 20;

            // Check if stuck in infinite spinner
            const spinners = document.querySelectorAll('.animate-spin');
            const hasSpinners = spinners.length > 2; // more than 2 persistent loading spinners

            // Check button labels
            const buttons = Array.from(document.querySelectorAll('button'));
            const emptyButtons = buttons.filter(b => !b.innerText.trim() && !b.getAttribute('aria-label') && !b.querySelector('svg'));

            return {
                hasOverflow,
                overflowDiff: docWidth - winWidth,
                isBlank,
                bodyLength,
                emptyButtonsCount: emptyButtons.length,
                hasSpinners
            };
        });

        // Screenshot
        const snapName = `${scr.name.toLowerCase().replace(/\s+/g, '_')}.png`;
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, snapName) });

        const screenConsoleErrors = consoleErrors.slice(startErrCount);
        const screenNetErrors = networkFailures.slice(startNetCount);

        const passed = !check.hasOverflow && !check.isBlank && check.emptyButtonsCount === 0 && screenNetErrors.length === 0;

        screenResults.push({
            screen: scr.name,
            path: scr.path,
            overflow: check.hasOverflow ? `+${check.overflowDiff}px` : '0px',
            contentLength: `${check.bodyLength} chars`,
            emptyButtons: check.emptyButtonsCount,
            networkErrors: screenNetErrors.length,
            consoleErrors: screenConsoleErrors.length,
            status: passed ? 'PASS' : (screenNetErrors.length > 0 ? 'FAIL_NET' : 'WARN')
        });
    }

    await browser.close();

    console.log('\n=== LIVE DOM ADVERSARIAL AUDIT RESULTS ===');
    console.table(screenResults);

    const app4xx = networkFailures.filter(f => f.status >= 400 && f.status < 500 && f.url.includes('/api/'));
    const app5xx = networkFailures.filter(f => f.status >= 500 && f.url.includes('/api/'));
    const unexpected404 = networkFailures.filter(f => f.status === 404);
    const unexpected401 = networkFailures.filter(f => f.status === 401);
    const unexpected403 = networkFailures.filter(f => f.status === 403);
    const unexpected500 = networkFailures.filter(f => f.status === 500);

    const summary = {
        totalScreensAudited: SCREENS.length,
        consoleErrorsCount: consoleErrors.length,
        consoleErrors,
        pageErrorsCount: pageErrors.length,
        pageErrors,
        applicationOwned4xxCount: app4xx.length,
        applicationOwned4xx: app4xx,
        applicationOwned5xxCount: app5xx.length,
        applicationOwned5xx: app5xx,
        unexpected404Count: unexpected404.length,
        unexpected404,
        unexpected401Count: unexpected401.length,
        unexpected401,
        unexpected403Count: unexpected403.length,
        unexpected403,
        unexpected500Count: unexpected500.length,
        unexpected500,
        screenResults
    };

    console.log('\n--- LIVE ADVERSARIAL DOM METRICS ---');
    console.log(`Console Errors: ${consoleErrors.length}`);
    console.log(`Page Errors: ${pageErrors.length}`);
    console.log(`Application-Owned 4xx: ${app4xx.length}`);
    console.log(`Application-Owned 5xx: ${app5xx.length}`);
    console.log(`Unexpected 404: ${unexpected404.length}`);
    console.log(`Unexpected 401: ${unexpected401.length}`);
    console.log(`Unexpected 403: ${unexpected403.length}`);
    console.log(`Unexpected 500: ${unexpected500.length}`);

    fs.writeFileSync(
        path.join(ARTIFACTS_DIR, 'live_dom_adversarial_report.json'),
        JSON.stringify(summary, null, 2)
    );
}

run();
