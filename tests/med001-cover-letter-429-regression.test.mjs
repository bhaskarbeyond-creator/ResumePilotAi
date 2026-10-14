/**
 * MED-001 regression guard for the CoverLetter 429 crash.
 *
 * Root cause: `loadSavedLetters` propagated `getUserCoverLetters()` rejections
 * (429 / 5xx / network) as unhandled promise rejections, crashing the page
 * error handler with no user feedback.
 *
 * Fix: loadSavedLetters now catches failures and sets `lettersLoadFailed`,
 * and the gallery renders an honest error card with a retry affordance.
 *
 * These tests drive the REAL production bundle served by XAMPP at
 * MED001_TARGET_URL (default https://ime365.local) with a Firebase custom
 * token session, and force API failures via Playwright route interception.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const TARGET_URL = process.env.MED001_TARGET_URL || 'https://ime365.local';

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

const TEST_UID = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';

async function launchSignedInPage(t) {
    const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const customToken = await admin.auth().createCustomToken(TEST_UID, {
        email: 'bhaskar.beyond@gmail.com',
        email_verified: true,
        role: 'SUPER_ADMIN',
        superAdmin: true,
    });
    await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(async (token) => {
        await window.fire.auth().signInWithCustomToken(token);
    }, customToken);
    await page.waitForTimeout(1500);
    return page;
}

test('cover letters gallery survives a 429 from /api/covers with an honest retry state', { timeout: 180_000 }, async (t) => {
    const page = await launchSignedInPage(t);
    await page.route('**/api/covers**', (route) => {
        route.fulfill({
            status: 429,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again in a few moments.' } }),
        });
    });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

    await page.goto(`${TARGET_URL}/dashboard/cover-letters`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);

    const text = await page.evaluate(() => document.body.innerText);
    assert.equal(pageErrors.length, 0, `no unhandled rejections under 429 (got: ${pageErrors.join(' | ')})`);
    assert.ok(text.includes('Saved letters are temporarily unavailable'), 'honest error card renders under 429');
    assert.ok(text.includes('Try again'), 'retry affordance is offered under 429');
});

test('cover letters builder renders normally when the API is healthy', { timeout: 180_000 }, async (t) => {
    const page = await launchSignedInPage(t);
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

    await page.goto(`${TARGET_URL}/dashboard/cover-letters`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);

    const text = await page.evaluate(() => document.body.innerText);
    assert.equal(pageErrors.length, 0, `no page errors on the healthy path (got: ${pageErrors.join(' | ')})`);
    assert.ok(text.includes('Cover Letter'), 'builder renders on the healthy path');
    assert.ok(!text.includes('temporarily unavailable'), 'error card is absent on the healthy path');
});
