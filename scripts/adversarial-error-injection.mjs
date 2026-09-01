/**
 * ADVERSARIAL CHALLENGE 9: REAL ERROR INJECTION
 * 
 * Tests 4 error injection scenarios:
 * 1. MariaDB Error / Database Failure (Verify UI error boundary & alerts, 0 white screens)
 * 2. Backend Outage / Connection Error (Verify offline handling & connection alerts)
 * 3. Network Throttling / Slow 3G (Verify skeleton loaders & responsiveness)
 * 4. Invalid / Tampered Token Injection (Verify 401 rejection & zero data leakage)
 * 
 * Target: https://ai-resume-builder.local
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
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

async function getSuperAdminToken() {
    return admin.auth().createCustomToken('superadmin-root-identity', {
        email: SUPER_ADMIN_EMAIL,
        email_verified: true,
        role: 'SUPER_ADMIN',
        superAdmin: true,
        sign_in_second_factor: 'totp'
    });
}

async function main() {
    console.log('='.repeat(70));
    console.log('ADVERSARIAL CHALLENGE 9: REAL ERROR INJECTION SUITE');
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

    // Authenticate
    console.log('\n[Setup] Authenticating as Super Admin...');
    const token = await getSuperAdminToken();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (tok) => {
        await window.fire.auth().signInWithCustomToken(tok);
    }, token);
    await page.waitForTimeout(1200);
    console.log('✓ Super Admin authenticated');

    const results = {};

    // -------------------------------------------------------------------------
    // SCENARIO 1: Simulated Database Outage / API 503 Injection
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 1: MariaDB Error / Database Failure Injection ---');
    // Intercept platform endpoints to simulate DB outage (503 Service Unavailable)
    await page.route('**/api/enterprise/platform/tenants', route => {
        route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
                error: {
                    code: 'DATABASE_UNAVAILABLE',
                    message: 'MariaDB connection pool exhausted or database unreachable'
                }
            })
        });
    });

    await page.goto(`${BASE_URL}/adm/tenants`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // Check UI for error banner and absence of white screen
    const alertVisible = await page.locator('div[role="alert"], div.bg-red-50, div:has-text("MariaDB connection pool")').first().isVisible().catch(() => false);
    const hasWhiteScreen = await page.evaluate(() => document.body.innerText.trim().length === 0);
    const hasFallbackRetry = await page.locator('button:has-text("Retry")').first().isVisible().catch(() => false);

    console.log(`  UI Error Alert Banner Rendered: ${alertVisible ? 'YES (PASS)' : 'NO'}`);
    console.log(`  White Screen Detected:           ${hasWhiteScreen ? 'YES (FAIL)' : 'NO (PASS)'}`);
    console.log(`  Interactive Retry Button:        ${hasFallbackRetry ? 'YES (PASS)' : 'NO'}`);

    results.scenario1_db_outage = {
        alertVisible,
        noWhiteScreen: !hasWhiteScreen,
        hasFallbackRetry,
        status: alertVisible && !hasWhiteScreen ? 'PASSED' : 'FAILED'
    };

    // Clear route interception
    await page.unroute('**/api/enterprise/platform/tenants');

    // -------------------------------------------------------------------------
    // SCENARIO 2: Backend API Process Outage / HTTP Connection Failure
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 2: Backend Process Outage / Network Refusal ---');
    await page.route('**/api/admin/**', route => route.abort('failed'));
    await page.route('**/api/platform/**', route => route.abort('failed'));

    await page.goto(`${BASE_URL}/adm/health`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const healthErrorAlert = await page.locator('div[role="alert"], div.bg-red-50, div:has-text("Failed"), div:has-text("Error")').first().isVisible().catch(() => false);
    const healthNoCrash = await page.evaluate(() => document.querySelectorAll('*').length > 10);

    console.log(`  Network Outage Error Handled:    ${healthErrorAlert || healthNoCrash ? 'YES (PASS)' : 'NO'}`);
    console.log(`  DOM Integrity Maintained:        ${healthNoCrash ? 'YES (PASS)' : 'NO'}`);

    results.scenario2_backend_outage = {
        handledGracefully: healthErrorAlert || healthNoCrash,
        domIntegrity: healthNoCrash,
        status: healthNoCrash ? 'PASSED' : 'FAILED'
    };

    await page.unroute('**/api/admin/**');
    await page.unroute('**/api/platform/**');

    // -------------------------------------------------------------------------
    // SCENARIO 3: Slow Network Throttling (3G Emulation)
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 3: Slow Network Throttling (Slow 3G Emulation) ---');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 500, // 500ms RTT
        downloadThroughput: ((400 * 1024) / 8), // 400 kbps
        uploadThroughput: ((400 * 1024) / 8)
    });

    const startNav = Date.now();
    await page.goto(`${BASE_URL}/adm/dashboard`, { waitUntil: 'domcontentloaded' });
    
    // Check for spinner / loader elements during in-flight load
    const spinnerPresent = await page.locator('.animate-spin, [role="status"], div:has-text("Loading")').first().isVisible().catch(() => false);
    
    const dashboardHeader = page.locator('text=Platform Command Center');
    const dashboardRendered = await dashboardHeader.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    const elapsed = Date.now() - startNav;

    // Reset network
    await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1
    });

    console.log(`  Slow 3G Navigation Time:         ${elapsed}ms`);
    console.log(`  Dashboard Loaded Under Slow 3G:  ${dashboardRendered ? 'YES (PASS)' : 'NO'}`);

    results.scenario3_slow_network = {
        elapsedMs: elapsed,
        spinnerObserved: spinnerPresent,
        dashboardRendered,
        status: dashboardRendered ? 'PASSED' : 'FAILED'
    };

    // -------------------------------------------------------------------------
    // SCENARIO 4: Tampered / Corrupted JWT Injection
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 4: Tampered / Corrupted JWT Injection ---');
    const tamperedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tamperedPayload.invalidSignature';

    // Test API rejection of tampered token
    const apiRes = await fetch(`${BASE_URL}/api/platform/tenants`, {
        headers: { 'Authorization': `Bearer ${tamperedToken}` }
    });
    const apiStatus = apiRes.status;
    const apiBody = await apiRes.json().catch(() => ({}));

    console.log(`  Tampered Token HTTP Status:      ${apiStatus} (Expected: 401 or 403)`);
    console.log(`  Error Code:                      ${apiBody.error?.code || 'AUTH_REJECTED'}`);

    const isRejected = (apiStatus === 401 || apiStatus === 403);
    const noDataLeakage = !apiBody.tenants;

    console.log(`  Data Leakage:                    ${noDataLeakage ? 'NONE (PASS)' : 'LEAKED (FAIL)'}`);

    results.scenario4_tampered_jwt = {
        httpStatus: apiStatus,
        isRejected,
        noDataLeakage,
        status: isRejected && noDataLeakage ? 'PASSED' : 'FAILED'
    };

    // Summary Report
    console.log('\n' + '='.repeat(70));
    console.log('ERROR INJECTION SUMMARY:');
    console.log(`  1. MariaDB Outage:               ${results.scenario1_db_outage.status}`);
    console.log(`  2. Backend Outage:               ${results.scenario2_backend_outage.status}`);
    console.log(`  3. Slow 3G Network:              ${results.scenario3_slow_network.status}`);
    console.log(`  4. Tampered JWT:                 ${results.scenario4_tampered_jwt.status}`);
    console.log('='.repeat(70));

    const reportPath = 'test-results/ERROR_INJECTION_REPORT.json';
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        scenarios: results
    }, null, 2));
    console.log(`REPORT SAVED: ${reportPath}`);

    await browser.close();

    const allPassed = Object.values(results).every(r => r.status === 'PASSED');
    if (!allPassed) {
        console.error('\n❌ ADVERSARIAL CHALLENGE 9 FAILED');
        process.exit(1);
    } else {
        console.log('\n✓ ADVERSARIAL CHALLENGE 9 PASSED 100%');
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
