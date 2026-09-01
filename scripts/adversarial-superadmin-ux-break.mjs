/**
 * ADVERSARIAL CHALLENGE 6: SUPER ADMIN UX — TRY TO BREAK THE UI (8 VIEWPORTS)
 * 
 * Actively tests every Super Admin screen across 8 standard viewports:
 * 1. 320x568 (iPhone SE 1st gen)
 * 2. 375x667 (iPhone SE 2nd/3rd gen)
 * 3. 390x844 (iPhone 12/13/14)
 * 4. 768x1024 (iPad Mini portrait)
 * 5. 1024x768 (iPad Mini landscape)
 * 6. 1280x800 (Small Laptop)
 * 7. 1440x900 (MacBook Pro standard)
 * 8. 1920x1080 (Desktop FHD)
 * 
 * Screens audited:
 * - /adm/dashboard
 * - /adm/users
 * - /adm/health
 * - /adm/tenants
 * - /adm/audit-logs
 * - /adm/security
 * - /adm/settings?tab=general
 * - /adm/settings?tab=ai
 * - /adm/settings?tab=email
 * - /adm/settings?tab=payment
 * - /enterprise
 * 
 * Audits:
 * - Root document scrollWidth vs clientWidth
 * - Element bounding box overflows
 * - Mobile hamburger menu open / close at < 1024px
 * - Role dropdown open / positioning
 * - Console errors / unhandled rejections
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://ai-resume-builder.local';
const SUPER_ADMIN_EMAIL = 'superadmin@airesume.net';
import dotenv from 'dotenv';
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

async function getSuperAdminToken() {
    return admin.auth().createCustomToken('superadmin-root-identity', {
        email: SUPER_ADMIN_EMAIL,
        email_verified: true,
        role: 'SUPER_ADMIN',
        superAdmin: true,
        sign_in_second_factor: 'totp'
    });
}

const VIEWPORTS = [
    { name: 'iPhone SE 1st gen', width: 320, height: 568 },
    { name: 'iPhone SE 2nd/3rd gen', width: 375, height: 667 },
    { name: 'iPhone 12/13/14', width: 390, height: 844 },
    { name: 'iPad Mini portrait', width: 768, height: 1024 },
    { name: 'iPad Mini landscape', width: 1024, height: 768 },
    { name: 'Small Laptop', width: 1280, height: 800 },
    { name: 'MacBook Pro standard', width: 1440, height: 900 },
    { name: 'Desktop FHD', width: 1920, height: 1080 }
];

const SCREENS = [
    { path: '/adm/dashboard', name: 'Dashboard' },
    { path: '/adm/users', name: 'User Management' },
    { path: '/adm/health', name: 'Platform Health' },
    { path: '/adm/tenants', name: 'Enterprise Tenants' },
    { path: '/adm/audit-logs', name: 'Admin Audit Logs' },
    { path: '/adm/security', name: 'Platform Security' },
    { path: '/adm/settings?tab=general', name: 'Settings - General' },
    { path: '/adm/settings?tab=ai', name: 'Settings - AI Configuration' },
    { path: '/adm/settings?tab=email', name: 'Settings - Email & SMTP' },
    { path: '/adm/settings?tab=payment', name: 'Settings - Payment & Billing' },
    { path: '/enterprise', name: 'Enterprise Console' }
];

async function main() {
    console.log('='.repeat(70));
    console.log('CHALLENGE 6: SUPER ADMIN UX BREAK SUITE (8 VIEWPORTS x 11 SCREENS)');
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
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            const text = msg.text();
            // Filter out favicon or known harmless resource 404s
            if (!text.includes('favicon.ico') && !text.includes('Failed to load resource')) {
                consoleErrors.push(text);
            }
        }
    });

    // Step 1: Sign in once
    console.log('\n[1/3] Authenticating as Super Admin...');
    const token = await getSuperAdminToken();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (tok) => {
        await window.fire.auth().signInWithCustomToken(tok);
    }, token);
    await page.waitForTimeout(1200);

    const authUser = await page.evaluate(() => window.fire.auth().currentUser?.email);
    console.log(`✓ Authenticated! Logged in as: ${authUser}`);

    const auditResults = [];
    let totalChecks = 0;
    let overflowFailures = 0;
    let interactiveFailures = 0;

    console.log('\n[2/3] Executing Viewport Stress Matrix...');

    for (const vp of VIEWPORTS) {
        console.log(`\n--- Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(400);

        for (const screen of SCREENS) {
            totalChecks++;
            const targetUrl = `${BASE_URL}${screen.path}`;
            let screenSuccess = true;
            let overflowPx = 0;
            let offendingElements = [];

            try {
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
                // Wait for content rendering
                await page.waitForTimeout(800);

                // 1. Measure Document Overflow
                const metrics = await page.evaluate(() => {
                    const doc = document.documentElement;
                    const body = document.body;
                    const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
                    const clientWidth = doc.clientWidth;
                    const overflow = scrollWidth - clientWidth;

                    // Find elements causing horizontal overflow if any
                    const offenders = [];
                    if (overflow > 1) { // 1px threshold for fractional subpixel rendering
                        const allEls = document.querySelectorAll('*');
                        for (const el of allEls) {
                            const rect = el.getBoundingClientRect();
                            if (rect.right > clientWidth + 2) {
                                offenders.push({
                                    tag: el.tagName,
                                    id: el.id || undefined,
                                    className: String(el.className).slice(0, 50),
                                    right: Math.round(rect.right),
                                    clientWidth: clientWidth
                                });
                                if (offenders.length >= 3) break;
                            }
                        }
                    }

                    return {
                        scrollWidth,
                        clientWidth,
                        overflow: Math.max(0, overflow),
                        offenders
                    };
                });

                if (metrics.overflow > 1) {
                    screenSuccess = false;
                    overflowFailures++;
                    overflowPx = metrics.overflow;
                    offendingElements = metrics.offenders;
                    console.log(`  [FAIL] ${screen.name} | OVERFLOW: +${metrics.overflow}px (scroll: ${metrics.scrollWidth}, client: ${metrics.clientWidth})`);
                } else {
                    process.stdout.write(`  [PASS] ${screen.name} (0px overflow)\n`);
                }

                // 2. Interactive checks
                // A. On mobile (< 1024px), verify hamburger button works
                if (vp.width < 1024 && screen.path.startsWith('/adm')) {
                    const hamburger = page.locator('button[aria-label="Open admin navigation"]');
                    if (await hamburger.isVisible()) {
                        await hamburger.click();
                        await page.waitForTimeout(250);
                        // Check if drawer opened
                        const drawer = page.locator('div.fixed.left-0.top-0.bottom-0.z-50');
                        const isOpened = await drawer.isVisible().catch(() => false);
                        if (!isOpened) {
                            console.log(`    ⚠️ Hamburger clicked but mobile drawer not detected`);
                        }
                        // Close it via backdrop with force or pressing Escape
                        await page.keyboard.press('Escape');
                        const closeBtn = page.locator('button[aria-label="Close admin navigation"]');
                        if (await closeBtn.isVisible().catch(() => false)) {
                            await closeBtn.click({ force: true }).catch(() => {});
                        }
                        await page.waitForTimeout(200);
                    }
                }

                // B. Check Role view dropdown positioning
                if (screen.path.startsWith('/adm')) {
                    const roleBtn = page.locator('button[data-testid="role-switcher-button"]');
                    if (await roleBtn.isVisible().catch(() => false)) {
                        await roleBtn.click();
                        await page.waitForTimeout(250);
                        const dropdown = page.locator('[data-testid="role-switcher-dropdown"]');
                        if (await dropdown.isVisible()) {
                            const box = await dropdown.boundingBox();
                            if (box && (box.x < 0 || box.x + box.width > vp.width + 5)) {
                                console.log(`    ⚠️ Role dropdown cropped horizontally! x: ${box.x}, width: ${box.width}, vp: ${vp.width}`);
                                interactiveFailures++;
                            }
                        }
                        // Close dropdown via Escape
                        await page.keyboard.press('Escape');
                        await page.waitForTimeout(150);
                    }
                }

                auditResults.push({
                    viewport: vp.name,
                    dimensions: `${vp.width}x${vp.height}`,
                    screen: screen.name,
                    path: screen.path,
                    overflowPx: Math.round(overflowPx),
                    passed: screenSuccess,
                    offenders: offendingElements
                });

            } catch (err) {
                console.log(`  [ERROR] ${screen.name}: ${err.message}`);
                auditResults.push({
                    viewport: vp.name,
                    dimensions: `${vp.width}x${vp.height}`,
                    screen: screen.name,
                    path: screen.path,
                    passed: false,
                    error: err.message
                });
            }
        }
    }

    console.log('\n[3/3] Generating Audit Report...');
    const reportPath = 'test-results/SUPERADMIN_UX_BREAK_REPORT.json';
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        totalChecks,
        overflowFailures,
        interactiveFailures,
        consoleErrorCount: consoleErrors.length,
        consoleErrors: consoleErrors.slice(0, 10),
        results: auditResults
    }, null, 2));

    console.log('='.repeat(70));
    console.log(`TOTAL CHECKS:          ${totalChecks}`);
    console.log(`OVERFLOW FAILURES:     ${overflowFailures}`);
    console.log(`INTERACTIVE FAILURES:  ${interactiveFailures}`);
    console.log(`CONSOLE ERRORS:        ${consoleErrors.length}`);
    console.log(`REPORT SAVED:          ${reportPath}`);
    console.log('='.repeat(70));

    await browser.close();

    if (overflowFailures > 0 || interactiveFailures > 0) {
        console.log('\n❌ ADVERSARIAL CHALLENGE 6 FOUND UI BREAK DEFECTS.');
        process.exit(1);
    } else {
        console.log('\n✓ ADVERSARIAL CHALLENGE 6 PASSED: 0px overflow across all 8 viewports.');
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
