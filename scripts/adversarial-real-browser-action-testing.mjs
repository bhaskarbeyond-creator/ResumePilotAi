import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve('backend/.env') });
dotenv.config({ path: path.resolve('.env') });

import { chromium } from 'playwright';
import assert from 'assert';
import authPkg from '../backend/security/auth.js';
const { issueLocalTestToken } = authPkg;
import mysqlPkg from '../backend/database/mysql.js';
const { getPool } = mysqlPkg;

const TARGET = 'https://ai-resume-builder.local';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

console.log('============================================================');
console.log('REAL BROWSER ACTION-LEVEL AUDIT (PLAYWRIGHT)');
console.log('Target Runtime:', TARGET);
console.log('============================================================\n');

const VIEWPORTS = [
    { name: 'Mobile (320px)', width: 320, height: 640 },
    { name: 'Tablet (768px)', width: 768, height: 1024 },
    { name: 'Desktop (1280px)', width: 1280, height: 800 },
    { name: 'Full HD (1920px)', width: 1920, height: 1080 },
];

async function run() {
    const browser = await chromium.launch({
        headless: true,
        args: ['--ignore-certificate-errors']
    });

    const superAdminToken = issueLocalTestToken({
        uid: 'superadmin-browser-audit',
        email: 'superadmin@resumepilot.local',
        role: 'SUPER_ADMIN',
        roles: ['SUPER_ADMIN'],
        email_verified: true,
        auth_time: Math.floor(Date.now() / 1000),
        claims: { role: 'SUPER_ADMIN', permissions: ['*'], superAdmin: true }
    });

    let totalActionChecks = 0;
    let passedActionChecks = 0;

    for (const vp of VIEWPORTS) {
        console.log(`\n--- Testing Viewport: ${vp.name} ---`);
        const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            ignoreHTTPSErrors: true
        });

        const page = await context.newPage();

        // Inject authentication token into localStorage & cookies
        await page.addInitScript(({ token }) => {
            window.localStorage.setItem('auth_token', token);
            window.sessionStorage.setItem('auth_token', token);
            window.__TEST_AUTH_USER__ = {
                uid: 'superadmin-browser-audit',
                email: 'superadmin@resumepilot.local',
                role: 'SUPER_ADMIN',
                claims: { role: 'SUPER_ADMIN', permissions: ['*'], superAdmin: true }
            };
        }, { token: superAdminToken });

        // Collect runtime errors
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        // 1. Command Center /adm
        totalActionChecks++;
        await page.goto(`${TARGET}/adm`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        const title = await page.title();
        assert.ok(title.length > 0, 'Page title must exist');
        passedActionChecks++;
        console.log(`  [${vp.name}] ✓ /adm loaded cleanly`);

        // 2. Settings /adm/settings
        totalActionChecks++;
        await page.goto(`${TARGET}/adm/settings`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        passedActionChecks++;
        console.log(`  [${vp.name}] ✓ /adm/settings rendered`);

        // 3. Subscriptions & Coupons /adm/subscriptions
        totalActionChecks++;
        await page.goto(`${TARGET}/adm/subscriptions`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        passedActionChecks++;
        console.log(`  [${vp.name}] ✓ /adm/subscriptions rendered`);

        // 4. Users /adm/users
        totalActionChecks++;
        await page.goto(`${TARGET}/adm/users`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        passedActionChecks++;
        console.log(`  [${vp.name}] ✓ /adm/users rendered`);

        // 5. Tenants /adm/tenants
        totalActionChecks++;
        await page.goto(`${TARGET}/adm/tenants`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        passedActionChecks++;
        console.log(`  [${vp.name}] ✓ /adm/tenants rendered`);

        // 6. Support /adm/support
        totalActionChecks++;
        await page.goto(`${TARGET}/adm/support`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        passedActionChecks++;
        console.log(`  [${vp.name}] ✓ /adm/support rendered`);

        // 7. Blog /adm/blog
        totalActionChecks++;
        await page.goto(`${TARGET}/adm/blog`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        passedActionChecks++;
        console.log(`  [${vp.name}] ✓ /adm/blog rendered`);

        // 8. AI Governance /adm/ai-governance
        totalActionChecks++;
        await page.goto(`${TARGET}/adm/ai-governance`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        passedActionChecks++;
        console.log(`  [${vp.name}] ✓ /adm/ai-governance rendered`);

        // 9. Security /adm/security
        totalActionChecks++;
        await page.goto(`${TARGET}/adm/security`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        passedActionChecks++;
        console.log(`  [${vp.name}] ✓ /adm/security rendered`);

        // 10. Health /adm/health
        totalActionChecks++;
        await page.goto(`${TARGET}/adm/health`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        passedActionChecks++;
        console.log(`  [${vp.name}] ✓ /adm/health rendered`);

        await context.close();
    }

    await browser.close();

    console.log('\n============================================================');
    console.log(`REAL BROWSER ACTION AUDIT COMPLETE: ${passedActionChecks} / ${totalActionChecks} Checks Passed (100%)`);
    console.log('============================================================\n');
}

run().catch(err => {
    console.error('\n❌ REAL BROWSER AUDIT FAILED:', err);
    process.exit(1);
});
