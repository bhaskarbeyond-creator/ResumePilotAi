// DIR-010 stage 4 clipping-vs-scrolling forensics probe.
//
// STAGE 4 QUESTION: `worstOverflow = 170` is reported as 22 "clipped" descendants.
// Is that real clipping (DIR-010 §2 defect still present), or is it the scrollable
// remainder rendering below the fold at scrollTop=0?
//
// The arithmetic already hints at the answer: bodyScrollHeight(346) -
// bodyClientHeight(175) = 171 ~= worstOverflow(170). If that identity holds at the
// BOTTOM of the scroll range too, the content is REACHABLE by scrolling and was
// never clipped. If it does NOT resolve at the bottom, real clipping is present and
// the product must be fixed.
//
// This drives the LIVE app, mints a REAL identity, and reads REAL MariaDB rows.
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { chromium } from '@playwright/test';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR010_WEB_ORIGIN || 'http://localhost:3000';

const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});
const [[{ job_id: jobId }]] = await conn.query(
    'SELECT job_id FROM applications GROUP BY job_id ORDER BY COUNT(*) DESC LIMIT 1',
);
await conn.end();
console.log('target jobId =', jobId);

const email = process.env.DIR010_RECRUITER_EMAIL || process.env.ADMIN_EMAIL;
const session = await mintFirebaseSession({ email });
console.log('identity =', session?.email);

const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 720 } });

// Seed the browser session exactly the way the suite's bootSession() does.
await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
    const authUser = {
        uid,
        email,
        emailVerified: true,
        displayName: email.split('@')[0],
        isAnonymous: false,
        stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
        createdAt: String(Date.now()),
        lastLoginAt: String(Date.now()),
        apiKey,
        appName: '[DEFAULT]',
    };
    localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(authUser));
    localStorage.setItem('user', uid);
    localStorage.setItem('preferredLanguage', 'en');
    localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
    localStorage.setItem('ime365_privacy_consent_v1', 'denied');
}, {
    uid: session.uid,
    email: session.email,
    token: session.idToken,
    refreshToken: session.refreshToken,
    apiKey: session.apiKey,
});

await page.goto(`${WEB_ORIGIN}/employer/jobs`, { waitUntil: 'domcontentloaded' });

// Wait for the target requisition row to mount.
const row = page.locator(`[data-job-id="${jobId}"]`);
await row.waitFor({ state: 'visible', timeout: 60_000 });
await row.getByRole('button', { name: /applications?|candidatures?/i }).click();

const dialog = page.getByRole('dialog');
await dialog.waitFor({ state: 'visible', timeout: 60_000 });
await page.locator('#job-applications-total').waitFor({ state: 'visible', timeout: 60_000 });
// Let the fetch settle out of its loading state.
await page.waitForFunction(
    () => !/loading/i.test(document.querySelector('#job-applications-total')?.textContent || ''),
    { timeout: 60_000 },
);

const expanders = dialog.getByRole('button', { name: /^Expand application from /i });
await expanders.first().click({ timeout: 30_000 });
await dialog.getByRole('button', { name: /^Collapse application from /i })
    .waitFor({ state: 'visible', timeout: 30_000 });
/**
 * Measures overflow against BOTH the panel box and the SCROLL PORT's visible box.
 * The distinction is the whole point:
 *   - overflow vs panel     => content below the fold at the current scroll offset.
 *   - overflow vs scrollport => content clipped with NO way to scroll it into view.
 * Only the second is a genuine DIR-010 section-2 clipping defect.
 */
const probe = async (label) => page.evaluate((lbl) => {
    const panel = document.querySelector('[role="dialog"]');
    const panelRect = panel.getBoundingClientRect();

    const scrollable = [...panel.querySelectorAll('*')].find((el) => {
        const cs = getComputedStyle(el);
        return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
    }) || null;
    const body = scrollable || panel;
    const bodyRect = body.getBoundingClientRect();

    let worstVsPanel = 0;
    let clippedVsScrollport = 0;
    for (const el of panel.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) continue;
        worstVsPanel = Math.max(worstVsPanel, r.bottom - panelRect.bottom);
        // Only descendants INSIDE the scroll port can be clipped by it. Header/filter
        // chrome lives outside and is bounded by the panel, not the port.
        if (body !== panel && body.contains(el)) {
            clippedVsScrollport = Math.max(clippedVsScrollport, r.bottom - bodyRect.bottom);
        }
    }

    return {
        label: lbl,
        scrollTop: body.scrollTop,
        scrollHeight: body.scrollHeight,
        clientHeight: body.clientHeight,
        scrollRemainder: body.scrollHeight - body.clientHeight,
        worstVsPanel,
        clippedVsScrollport,
        bottomContentReachable: clippedVsScrollport <= 1,
    };
}, label);

const atTop = await probe('scrollTop=0 (initial)');

// Scroll the modal body to the very bottom.
await page.evaluate(() => {
    const panel = document.querySelector('[role="dialog"]');
    const body = [...panel.querySelectorAll('*')].find((el) => {
        const cs = getComputedStyle(el);
        return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
    });
    if (body) body.scrollTop = body.scrollHeight;
});
await page.waitForTimeout(500);
const atBottom = await probe('scrollTop=max (scrolled to end)');

console.log('\n=== AT TOP ===');
console.log(JSON.stringify(atTop, null, 2));
console.log('\n=== AT BOTTOM ===');
console.log(JSON.stringify(atBottom, null, 2));

console.log('\n=== VERDICT ===');
if (atBottom.clippedVsScrollport <= 1) {
    console.log('NO REAL CLIPPING: every descendant is reachable inside the scroll port at max scroll.');
    console.log('The stage-4 worstOverflow number is the scrollable remainder at scrollTop=0,');
    console.log('i.e. a MEASUREMENT ARTIFACT of the probe, not a DIR-010 section-2 product defect.');
} else {
    console.log('REAL CLIPPING PRESENT: content cannot be scrolled into view. Product must be fixed.');
}

await browser.close();