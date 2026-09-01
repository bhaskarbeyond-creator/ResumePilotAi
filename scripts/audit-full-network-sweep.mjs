import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
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

const customToken = await admin.auth().createCustomToken('OhZdiSIFL7ePA1TMkfu9bnR935D3', {
    email: 'superadmin@example.com',
    email_verified: true,
    role: 'SUPER_ADMIN',
    superAdmin: true,
});

const ALL_26_ROUTES = [
    '/adm/dashboard',
    '/adm/users',
    '/adm/user/ss?id=OhZdiSIFL7ePA1TMkfu9bnR935D3',
    '/adm/operators',
    '/adm/tenants',
    '/adm/audit-logs',
    '/adm/security',
    '/adm/queues',
    '/adm/operations',
    '/adm/attention',
    '/adm/health',
    '/adm/settings',
    '/adm/messages',
    '/adm/help-desk',
    '/adm/reviews',
    '/adm/trustedby',
    '/adm/employer-applications',
    '/adm/jobs-manager',
    '/adm/company-management',
    '/adm/blog-management',
    '/adm/landing-pages',
    '/adm/phrases',
    '/blog',
    '/blog-editor'
];

async function run() {
    console.log('=== FULL BROWSER NETWORK SWEEP ACROSS ALL SUPER ADMIN ROUTES ===\n');

    const browser = await chromium.launch({
        headless: true,
        args: ['--ignore-certificate-errors']
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        ignoreHTTPSErrors: true
    });
    const page = await context.newPage();

    const networkFailures = [];
    const consoleErrors = [];

    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push({ text: msg.text(), location: msg.location() });
        }
    });

    page.on('response', res => {
        const status = res.status();
        const url = res.url();
        // Capture any 4xx or 5xx response
        if (status >= 400) {
            networkFailures.push({
                url,
                status,
                method: res.request().method(),
                resourceType: res.request().resourceType()
            });
        }
    });

    page.on('requestfailed', req => {
        networkFailures.push({
            url: req.url(),
            status: 'FAILED',
            errorText: req.failure()?.errorText || 'Unknown failure',
            method: req.method(),
            resourceType: req.resourceType()
        });
    });

    // Authenticate
    await page.goto((process.env.TARGET_URL || process.env.APP_URL));
    await page.evaluate(async (tok) => {
        await window.fire.auth().signInWithCustomToken(tok);
    }, customToken);
    await page.waitForTimeout(600);

    for (const route of ALL_26_ROUTES) {
        process.stdout.write(`Scanning ${route}... `);
        try {
            await page.goto(`${process.env.TARGET_URL || process.env.APP_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 12000 });
            await page.waitForTimeout(600);
            console.log('✓ OK');
        } catch (e) {
            console.log(`⚠ ${e.message}`);
        }
    }

    await browser.close();

    console.log('\n=== NETWORK AUDIT SUMMARY ===');
    console.log(`Total Routes Checked: ${ALL_26_ROUTES.length}`);
    console.log(`Console Errors: ${consoleErrors.length}`);
    console.log(`HTTP >= 400 or Failed Network Requests: ${networkFailures.length}`);

    if (networkFailures.length > 0) {
        console.table(networkFailures);
    } else {
        console.log('✓ ZERO 4xx / 5xx or failed network requests detected across all routes!');
    }

    if (consoleErrors.length > 0) {
        console.log('\nConsole Errors:');
        consoleErrors.forEach(ce => console.log(' -', ce.text));
    }
}

run().catch(console.error);
