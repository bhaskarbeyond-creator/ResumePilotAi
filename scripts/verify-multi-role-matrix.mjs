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

// Generate tokens for each role with email_verified: true
const rolesConfig = {
    SUPER_ADMIN: { uid: 'OhZdiSIFL7ePA1TMkfu9bnR935D3', claims: { email: 'superadmin@example.com', email_verified: true, role: 'SUPER_ADMIN', superAdmin: true } },
    ADMIN: { uid: 'admin_test_user_id', claims: { email: 'admin@example.com', email_verified: true, role: 'ADMIN', admin: true } },
    SUPPORT: { uid: 'support_test_user_id', claims: { email: 'support@example.com', email_verified: true, role: 'SUPPORT' } },
    AUDITOR: { uid: 'auditor_test_user_id', claims: { email: 'auditor@example.com', email_verified: true, role: 'AUDITOR' } },
    NORMAL_USER: { uid: 'regular_client_user_id', claims: { email: 'client@example.com', email_verified: true, role: 'USER' } },
};

async function getRoleToken(roleKey) {
    if (roleKey === 'UNAUTHENTICATED') return null;
    const cfg = rolesConfig[roleKey];
    return await admin.auth().createCustomToken(cfg.uid, cfg.claims);
}

async function run() {
    console.log('=== MULTI-ROLE REAL BROWSER & API VERIFICATION ===\n');
    const browser = await chromium.launch({
        headless: true,
        args: ['--ignore-certificate-errors']
    });

    const report = [];

    for (const [roleName] of [...Object.entries(rolesConfig), ['UNAUTHENTICATED', null]]) {
        console.log(`\n--- Testing Role: ${roleName} ---`);
        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            ignoreHTTPSErrors: true
        });
        const page = await context.newPage();

        const token = await getRoleToken(roleName);

        if (token) {
            await page.goto((process.env.TARGET_URL || process.env.APP_URL));
            await page.evaluate(async (t) => {
                await window.fire.auth().signInWithCustomToken(t);
            }, token);
            await page.waitForTimeout(600);
        }

        // Test 1: Direct Route Navigation
        const routeTests = [
            { path: '/adm/dashboard', canViewRoute: ['SUPER_ADMIN', 'ADMIN', 'AUDITOR', 'SUPPORT'].includes(roleName) },
            { path: '/adm/audit-logs', canViewRoute: ['SUPER_ADMIN', 'ADMIN', 'AUDITOR'].includes(roleName) },
            { path: '/adm/security', canViewRoute: ['SUPER_ADMIN', 'ADMIN', 'AUDITOR'].includes(roleName) },
            { path: '/adm/help-desk', canViewRoute: ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'AUDITOR'].includes(roleName) },
            { path: '/adm/operators', canViewRoute: ['SUPER_ADMIN', 'ADMIN'].includes(roleName) },
        ];

        for (const rt of routeTests) {
            await page.goto(`${process.env.TARGET_URL || process.env.APP_URL}${rt.path}`);
            // Wait for auth verification and potential redirection to settle
            if (roleName === 'UNAUTHENTICATED') {
                await page.waitForFunction(() => !window.location.pathname.startsWith('/adm/'), { timeout: 10000 }).catch(() => {});
            } else if (roleName === 'NORMAL_USER') {
                await page.waitForFunction(() => !window.location.pathname.startsWith('/adm/'), { timeout: 10000 }).catch(() => {});
            } else if (!rt.canViewRoute) {
                await page.waitForFunction((expectedPath) => window.location.pathname !== expectedPath, rt.path, { timeout: 10000 }).catch(() => {});
            } else {
                await page.waitForTimeout(800);
            }

            const currentUrl = page.url();
            const urlPath = new URL(currentUrl).pathname;
            const stayedOnTargetRoute = (urlPath === rt.path);

            const matchesExpectation = (stayedOnTargetRoute === rt.canViewRoute);

            report.push({
                role: roleName,
                check: `UI Route Access: ${rt.path}`,
                expected: rt.canViewRoute ? 'STAY ON ROUTE' : 'DENIED/REDIRECTED AWAY',
                actual: stayedOnTargetRoute ? 'STAYED ON ROUTE' : `REDIRECTED TO ${urlPath}`,
                status: matchesExpectation ? 'PASS' : 'FAIL'
            });
        }

        // Test 2: Direct API Authorization via Fetch inside Browser Context
        const apiTests = [
            {
                endpoint: '/api/platform/command-center',
                method: 'GET',
                expectedStatus: ['SUPER_ADMIN', 'ADMIN', 'AUDITOR'].includes(roleName) ? 200 : (roleName === 'UNAUTHENTICATED' ? 401 : 403)
            },
            {
                endpoint: '/api/platform/security-events',
                method: 'GET',
                expectedStatus: ['SUPER_ADMIN', 'ADMIN', 'AUDITOR'].includes(roleName) ? 200 : (roleName === 'UNAUTHENTICATED' ? 401 : 403)
            },
            {
                endpoint: '/api/admin/platform/currency',
                method: 'PUT',
                body: { currency: 'USD' },
                expectedStatus: ['SUPER_ADMIN', 'ADMIN'].includes(roleName) ? 200 : (roleName === 'UNAUTHENTICATED' ? 401 : 403)
            },
            {
                endpoint: '/api/enterprise/platform/tenants',
                method: 'GET',
                expectedStatus: ['SUPER_ADMIN', 'ADMIN', 'AUDITOR'].includes(roleName) ? 200 : (roleName === 'UNAUTHENTICATED' ? 401 : 403)
            }
        ];

        for (const at of apiTests) {
            const apiResult = await page.evaluate(async ({ url, method, body }) => {
                try {
                    let authHeader = '';
                    if (window.fire?.auth()?.currentUser) {
                        const idTok = await window.fire.auth().currentUser.getIdToken();
                        authHeader = `Bearer ${idTok}`;
                    }
                    const res = await fetch(url, {
                        method,
                        headers: {
                            'Content-Type': 'application/json',
                            ...(authHeader ? { Authorization: authHeader } : {})
                        },
                        body: body ? JSON.stringify(body) : undefined
                    });
                    return { status: res.status, ok: res.ok };
                } catch (err) {
                    return { error: err.message };
                }
            }, { url: at.endpoint, method: at.method, body: at.body });

            const statusMatch = apiResult.status === at.expectedStatus || (at.expectedStatus === 403 && (apiResult.status === 401 || apiResult.status === 403));
            report.push({
                role: roleName,
                check: `API Auth: ${at.method} ${at.endpoint}`,
                expected: `HTTP ${at.expectedStatus}`,
                actual: `HTTP ${apiResult.status}`,
                status: statusMatch ? 'PASS' : 'FAIL'
            });
        }

        // Test 3: Tab and Button Visibility on Accessible Pages
        if (['SUPER_ADMIN', 'ADMIN', 'AUDITOR', 'SUPPORT'].includes(roleName)) {
            await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/adm/dashboard');
            await page.waitForTimeout(600);

            const sidebarLinks = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a[href^="/adm/"]'));
                return links.map(a => a.getAttribute('href'));
            });

            // Operators requires users.roles.manage
            const hasOperatorsLink = sidebarLinks.includes('/adm/operators');
            const expectedOperators = ['SUPER_ADMIN', 'ADMIN'].includes(roleName);
            report.push({
                role: roleName,
                check: 'Sidebar Link /adm/operators',
                expected: expectedOperators ? 'VISIBLE' : 'HIDDEN',
                actual: hasOperatorsLink ? 'VISIBLE' : 'HIDDEN',
                status: (hasOperatorsLink === expectedOperators) ? 'PASS' : 'FAIL'
            });
        }

        await context.close();
    }

    await browser.close();

    console.log('\n=== MULTI-ROLE VERIFICATION REPORT ===');
    console.table(report);
    const passed = report.filter(r => r.status === 'PASS').length;
    console.log(`\nTotal Checks: ${report.length} | Passed: ${passed} | Failed: ${report.length - passed}`);
    if (passed === report.length) {
        console.log('✓ 100% OF MULTI-ROLE UI AND API CONTROLS VERIFIED!');
    }
}

run().catch(console.error);
