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

const TARGET_URL = (process.env.TARGET_URL || process.env.APP_URL);
const ARTIFACTS_DIR = path.join(__dirname, '../artifacts/viewports');
if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const VIEWPORTS = [
    { name: '320px-mobile-small', width: 320, height: 640 },
    { name: '375px-mobile-medium', width: 375, height: 667 },
    { name: '414px-mobile-large', width: 414, height: 896 },
    { name: '768px-tablet-portrait', width: 768, height: 1024 },
    { name: '1024px-tablet-landscape', width: 1024, height: 768 },
    { name: '1280px-desktop-standard', width: 1280, height: 800 },
    { name: '1440px-desktop-macbook', width: 1440, height: 900 },
    { name: '1600px-desktop-wide', width: 1600, height: 900 },
    { name: '1920px-desktop-fhd', width: 1920, height: 1080 },
];

async function run() {
    console.log('=== 9-VIEWPORT RESPONSIVE AUDIT: SUPER ADMIN ROLE SWITCHER ===\n');

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

    const viewportResults = [];

    for (const vp of VIEWPORTS) {
        const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            ignoreHTTPSErrors: true
        });
        const page = await context.newPage();

        // Sign in
        await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(async (t) => {
            await window.fire.auth().signInWithCustomToken(t);
        }, customToken);
        await page.waitForTimeout(600);

        // Navigate to Super Admin
        await page.goto(`${TARGET_URL}/adm/dashboard`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="role-switcher-button"]', { timeout: 15000 });

        // Check horizontal overflow
        const overflow = await page.evaluate(() => {
            const docWidth = document.documentElement.scrollWidth;
            const winWidth = window.innerWidth;
            return {
                hasOverflow: docWidth > winWidth,
                docWidth,
                winWidth,
                diff: docWidth - winWidth
            };
        });

        // Click dropdown to verify positioning within viewport
        await page.click('[data-testid="role-switcher-button"]');
        await page.waitForSelector('[data-testid="role-switcher-dropdown"]', { timeout: 3000 });

        const dropdownBounds = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="role-switcher-dropdown"]');
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {
                left: rect.left,
                right: rect.right,
                bottom: rect.bottom,
                windowWidth: window.innerWidth,
                windowHeight: window.innerHeight,
                clippedRight: rect.right > window.innerWidth,
                clippedLeft: rect.left < 0
            };
        });

        // Screenshot
        const screenshotFile = `${vp.name}.png`;
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, screenshotFile) });

        const passed = !overflow.hasOverflow && !dropdownBounds?.clippedRight && !dropdownBounds?.clippedLeft;

        viewportResults.push({
            viewport: vp.name,
            dimensions: `${vp.width}x${vp.height}`,
            horizontalOverflow: overflow.hasOverflow ? `YES (+${overflow.diff}px)` : 'NO (0px)',
            dropdownContained: (dropdownBounds && !dropdownBounds.clippedRight && !dropdownBounds.clippedLeft) ? 'YES' : 'NO',
            status: passed ? 'PASS' : 'FAIL'
        });

        await context.close();
    }

    await browser.close();

    console.log('\n=== VIEWPORT AUDIT RESULTS ===');
    console.table(viewportResults);

    const allPassed = viewportResults.every(r => r.status === 'PASS');
    console.log(`\n9-Viewport Audit Result: ${allPassed ? 'ALL 9 VIEWPORTS PASSED (9/9)' : 'OVERFLOW/CLIPPING DETECTED'}`);

    fs.writeFileSync(
        path.join(ARTIFACTS_DIR, 'viewport_audit_report.json'),
        JSON.stringify(viewportResults, null, 2)
    );
}

run();
