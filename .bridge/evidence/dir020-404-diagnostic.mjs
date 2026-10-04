// @ts-check
/**
 * DIR-020 DIAGNOSTIC: identify EXACTLY which network resources 404 on
 * /dashboard/job-tracker, so the fix targets the real offender instead of
 * blanket-suppressing every "Failed to load resource" console error.
 *
 * This prints the URL + status of every non-2xx response and every failing
 * request, plus whether any /api/* route 404s (which WOULD be a real defect).
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { chromium } from '@playwright/test';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const EMAIL = process.env.DIR020_EMAIL
    || process.env.ADMIN_EMAIL
    || process.env.DIR019_EMAIL
    || process.env.DIR006_EMAIL;
const ORIGIN = process.env.DIR020_WEB_ORIGIN || 'http://localhost:3000';

const session = await mintFirebaseSession({ email: EMAIL });
if (!session) throw new Error('No live identity configured.');

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
    localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
        uid,
        email,
        emailVerified: true,
        isAnonymous: false,
        stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: String(Date.now() + 3_600_000) },
    }));
    localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
}, {
    uid: session.uid,
    email: session.email,
    token: session.idToken,
    refreshToken: session.refreshToken,
    apiKey: session.apiKey,
});

const page = await context.newPage();
const nonOk = [];
const failed = [];
const consoleErrors = [];

page.on('response', (response) => {
    if (response.status() >= 400) {
        nonOk.push(`${response.status()} ${response.request().resourceType()} ${response.url()}`);
    }
});
page.on('requestfailed', (request) => {
    failed.push(`${request.failure()?.errorText} ${request.resourceType()} ${request.url()}`);
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`console.error: ${message.text()}`);
});

await page.goto(`${ORIGIN}/dashboard/job-tracker`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: 'Job Tracker', exact: true }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(6_000);

console.log('=== non-2xx/3xx responses ===');
console.log(nonOk.length ? nonOk.join('\n') : '(none)');
console.log('\n=== failed requests ===');
console.log(failed.length ? failed.join('\n') : '(none)');
console.log('\n=== console errors ===');
console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)');

console.log('\n=== 404 summary by host/path ===');
const apiFourOhFour = nonOk.filter((line) => line.includes('/api/'));
console.log(apiFourOhFour.length ? `API 404s (REAL DEFECTS):\n${apiFourOhFour.join('\n')}` : 'No /api/* returned 404.');

await browser.close();