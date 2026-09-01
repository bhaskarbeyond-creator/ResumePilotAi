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
    role: 'SUPER_ADMIN',
    superAdmin: true,
});

const viewports = [320, 360, 375, 390, 414, 768, 1024, 1280, 1920];
const routes = [
    '/adm/dashboard',
    '/adm/users',
    '/adm/audit-logs',
    '/adm/security',
    '/adm/health',
    '/adm/settings',
    '/adm/jobs-manager',
    '/adm/employer-applications',
    '/adm/company-management',
    '/adm/messages',
    '/adm/reviews',
    '/adm/trustedby',
    '/adm/landing-pages',
    '/adm/phrases'
];

async function run() {
    const browser = await chromium.launch({
        headless: true,
        args: ['--ignore-certificate-errors']
    });

    const overflows = [];

    for (const width of viewports) {
        console.log(`\n=== Testing Viewport: ${width}px ===`);
        const context = await browser.newContext({
            viewport: { width, height: 850 },
            ignoreHTTPSErrors: true,
        });
        const page = await context.newPage();

        await page.goto((process.env.TARGET_URL || process.env.APP_URL));
        await page.evaluate(async (token) => {
            await window.fire.auth().signInWithCustomToken(token);
        }, customToken);
        await page.waitForTimeout(600);

        for (const route of routes) {
            try {
                await page.goto(`${process.env.TARGET_URL || process.env.APP_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                await page.waitForTimeout(400);

                const metrics = await page.evaluate(() => {
                    const doc = document.documentElement;
                    const body = document.body;
                    const adminRight = document.querySelector('.admin__right');
                    return {
                        docScroll: doc.scrollWidth,
                        docClient: doc.clientWidth,
                        bodyScroll: body.scrollWidth,
                        bodyClient: body.clientWidth,
                        rightScroll: adminRight?.scrollWidth || 0,
                        rightClient: adminRight?.clientWidth || 0,
                        hasOverflow: doc.scrollWidth > doc.clientWidth || body.scrollWidth > body.clientWidth,
                    };
                });

                if (metrics.hasOverflow) {
                    console.log(`[OVERFLOW] ${width}px on ${route}: docScroll=${metrics.docScroll}, docClient=${metrics.docClient}, excess=${metrics.docScroll - metrics.docClient}px`);
                    overflows.push({ width, route, metrics });
                }
            } catch (navErr) {
                console.warn(`Nav warning on ${route} (${width}px):`, navErr.message);
            }
        }

        await context.close();
    }

    await browser.close();

    console.log(`\n=== RESPONSIVE AUDIT RESULTS ===`);
    console.log(`Total viewport-route combinations tested: ${viewports.length * routes.length}`);
    console.log(`Total overflows detected: ${overflows.length}`);
    if (overflows.length > 0) {
        console.table(overflows.map(o => ({
            width: o.width,
            route: o.route,
            scrollWidth: o.metrics.docScroll,
            clientWidth: o.metrics.docClient,
            excessPx: o.metrics.docScroll - o.metrics.docClient
        })));
    } else {
        console.log('✓ Zero horizontal overflows detected across all 9 viewports!');
    }
}

run().catch(console.error);
