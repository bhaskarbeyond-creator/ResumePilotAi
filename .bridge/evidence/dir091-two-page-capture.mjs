import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

/**
 * DIR-091 S8 — the AUTHENTICATED, real-data capture of BOTH reference pages.
 *
 * Same sanctioned mechanism as DIR-090's AC2 harness (which is APPROVED_FROZEN, so this is a NEW
 * additive file rather than a change to it):
 *   • the app is served by XAMPP Apache — never by a server this script starts;
 *   • the session is minted by the platform's OWN `mintFirebaseSession()` (a real user looked up in
 *     live Firebase Auth, exchanged for a Google-signed ID token);
 *   • data APIs are NOT mocked, so every rendered figure is a real MariaDB-backed value;
 *   • if the credentials are unusable the script reports BLOCKED rather than fabricating a result.
 *
 * It then asserts, from the LIVE DOM, the DIR-091 deliverables: the 4-level breadcrumb (three
 * ancestor links to /dashboard plus an aria-current final segment), the StepShell headerActions
 * buttons, and the required-fields badge.
 */

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

// XAMPP serves this app from the DOCUMENT ROOT (verified: http://localhost/dashboard renders the
// real workspace, while http://localhost/IME365/dashboard does not — the client uses BrowserRouter
// with no basename, so a subpath mount cannot match its routes).
const BASE = (process.env.DIR091_WEB_ORIGIN || 'http://localhost').replace(/\/+$/, '');
const OUT = '.bridge/evidence';
const md5 = (buffer) => createHash('md5').update(buffer).digest('hex').toUpperCase();
const mask = (value) => String(value).replace(/^(.).*@/, '$1***@');

async function assertApacheServes() {
    try {
        const res = await fetch(`${BASE}/dashboard`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.status;
    } catch (error) {
        console.error(`[FATAL] XAMPP Apache is not serving ${BASE}/dashboard — ${error.message}`);
        console.error('Bring the stack up first:  bridge xampp start all');
        process.exit(1);
    }
}

const apacheStatus = await assertApacheServes();
console.log(`XAMPP Apache serving ${BASE} (HTTP ${apacheStatus})`);

const identity = process.env.DIR009_CANDIDATE_EMAIL || process.env.ADMIN_EMAIL || '';
if (!identity) {
    console.error('[BLOCKED] No sanctioned identity configured (DIR009_CANDIDATE_EMAIL / ADMIN_EMAIL).');
    process.exit(1);
}

console.log(`Minting a REAL session for ${mask(identity)} ...`);
const session = await mintFirebaseSession({ email: identity });
if (!session) {
    console.error('[BLOCKED] mintFirebaseSession returned null — the FIREBASE_* credentials are not usable here.');
    console.error('S8 stays BLOCKED. Nothing is fabricated to work around it.');
    process.exit(1);
}
console.log(`[OK] real Google-signed session minted for uid ${session.uid} (${mask(session.email)})`);

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
const consoleErrors = [];
const failedApi = [];

const wire = (page) => {
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300)); });
    page.on('response', (res) => {
        if (/\/api\//.test(res.url()) && res.status() >= 400) failedApi.push(`${res.status()} ${res.url().slice(0, 160)}`);
    });
};

await fs.mkdir(OUT, { recursive: true });
const results = {};
let page;

try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

    // The platform's own seeding contract (tests/e2e/dir009-candidate-dashboard.spec.js bootSession).
    await context.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        const authUser = {
            uid,
            email,
            emailVerified: true,
            displayName: email.split('@')[0],
            isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 36000000 },
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
    }, { uid: session.uid, email: session.email, token: session.idToken, refreshToken: session.refreshToken, apiKey: session.apiKey });

    page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error' && !/favicon|Content Security Policy/i.test(msg.text())) consoleErrors.push(msg.text().slice(0, 300)); });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on('response', (response) => {
        const { pathname } = new URL(response.url());
        if (pathname.startsWith('/api/') && response.status() >= 400) failedApi.push(`${response.status()} ${pathname}`);
    });

    const shoot = async (name, options = {}) => {
        const buffer = await page.screenshot(options);
        await fs.writeFile(path.join(OUT, name), buffer);
        console.log(`  saved ${name} (${buffer.length} bytes, md5 ${md5(buffer)})`);
        return { name, bytes: buffer.length, md5: md5(buffer) };
    };

    // ───────────────────────── PAGE 1: /dashboard ─────────────────────────
    console.log('Navigating to /dashboard with the real session ...');
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);

    const dashboardProbe = await page.evaluate(() => ({
        rail: document.querySelectorAll('[data-testid="cuba-executive-rail"]').length,
        metricCards: document.querySelectorAll('[data-testid="cuba-metric-cards"]').length,
        analyticsBand: document.querySelectorAll('[data-testid="cuba-candidate-analytics"]').length,
        bodyTextLength: (document.body?.innerText || '').trim().length,
        url: location.href,
        hasPasswordField: Boolean(document.querySelector('input[type="password"]')),
        seededAuthKeyPresent: Object.keys(localStorage).some((k) => k.startsWith('firebase:authUser:')),
    }));
    console.log(`dashboard probe: ${JSON.stringify(dashboardProbe)}`);
    if (dashboardProbe.rail === 0 || dashboardProbe.metricCards === 0) {
        console.error('[FATAL] the candidate workspace did not render, so the dashboard cannot be evidenced.');
        console.error(`failed /api responses: ${JSON.stringify(failedApi.slice(0, 10))}`);
        process.exitCode = 1;
    }
    results.dashboard = { probe: dashboardProbe, viewport: await shoot('dir091-dashboard-1920.png') };

    // ─────────────────────── PAGE 2: /build-resume ───────────────────────
    const builderUrl = `${BASE}/build-resume/heading?new=1`;
    console.log(`Navigating to ${builderUrl} ...`);
    await page.goto(builderUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);

    const builderDom = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Resume builder breadcrumb"]');
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const textOf = (sel) => clean(document.querySelector(sel)?.innerText || '');
        const buttons = Array.from(document.querySelectorAll('button')).map((b) => clean(b.innerText));
        return {
            url: location.href,
            bodyTextLength: clean(document.body?.innerText).length,
            breadcrumbFound: Boolean(nav),
            breadcrumbVisible: nav ? getComputedStyle(nav).display !== 'none' : false,
            breadcrumbAncestorLinks: nav
                ? Array.from(nav.querySelectorAll('a')).map((a) => ({ text: clean(a.innerText), href: a.getAttribute('href') }))
                : [],
            breadcrumbHasButton: nav ? nav.querySelectorAll('button').length > 0 : null,
            breadcrumbCurrentSegment: nav ? clean(nav.querySelector('[aria-current="page"]')?.innerText || '') : '',
            autoFillButtonPresent: buttons.some((t) => /auto fill with ai/i.test(t)),
            resetSectionButtonPresent: buttons.some((t) => /reset section/i.test(t)),
            requiredBadgeText: clean((document.body?.innerText || '').match(/\d+\s+of\s+\d+\s+required fields/i)?.[0] || ''),
            personalInformationHeading: clean((document.body?.innerText || '').match(/Personal information/)?.[0] || ''),
            bodySnippet: clean(document.body?.innerText).slice(0, 300),
        };
    });
    console.log(`builder DOM: ${JSON.stringify(builderDom)}`);
    results.builder = { dom: builderDom, viewport: await shoot('dir091-build-resume-1920.png') };
    results.builder.fullpage = await shoot('dir091-build-resume-fullpage.png', { fullPage: true });

    // ─────────────────────────── live assertions + manifest ───────────────────────────
    const bc = builderDom.breadcrumbAncestorLinks;
    const checks = {
        'dashboard rendered the real workspace': dashboardProbe.rail > 0 && dashboardProbe.metricCards > 0,
        'breadcrumb present in the live DOM': builderDom.breadcrumbFound === true,
        'breadcrumb visible at 1920 (xl)': builderDom.breadcrumbVisible === true,
        'three ancestor links': bc.length === 3,
        'every ancestor links to /dashboard': bc.length > 0 && bc.every((a) => /\/dashboard$/.test(a.href || '')),
        'ancestor labels match the reference levels': bc.map((a) => a.text).join(' > ') === 'Dashboard > Resumes & Master CV > Build Resume',
        'breadcrumb contains no buttons': builderDom.breadcrumbHasButton === false,
        'final segment is the current page': builderDom.breadcrumbCurrentSegment.length > 0,
        'Auto Fill with AI rendered': builderDom.autoFillButtonPresent === true,
        'Reset section rendered': builderDom.resetSectionButtonPresent === true,
        'required-fields badge rendered': /required fields/i.test(builderDom.requiredBadgeText),
        'Personal information heading rendered': builderDom.personalInformationHeading === 'Personal information',
    };
    const failed = Object.entries(checks).filter(([, ok]) => !ok);
    console.log('\n── DIR-091 live DOM checks ──');
    for (const [label, ok] of Object.entries(checks)) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (failed.length) { console.error(`[FATAL] ${failed.length} live check(s) failed.`); process.exitCode = 1; }

    const manifest = {
        directive: 'DIR-091',
        scope: 'S8 — authenticated two-page capture of /dashboard and /build-resume',
        servedBy: 'XAMPP Apache',
        base: BASE,
        apacheStatus,
        dataMode: 'REAL (MariaDB via the managed backend API, authenticated with a Google-signed ID token)',
        identity: mask(session.email),
        sessionSource: 'tests/e2e/dir006-session.mjs -> mintFirebaseSession()',
        capturedAt: new Date().toISOString(),
        liveChecks: checks,
        failedLiveChecks: failed.map(([label]) => label),
        dashboard: results.dashboard,
        builder: results.builder,
        failedApiResponses: failedApi.slice(0, 20),
        consoleErrorCount: consoleErrors.length,
        consoleErrors: consoleErrors.slice(0, 20),
    };
    await fs.writeFile(path.join(OUT, 'dir091-two-page-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log('\nmanifest: .bridge/evidence/dir091-two-page-manifest.json');
    console.log(`failed /api responses: ${failedApi.length}; console errors: ${consoleErrors.length}`);
} catch (error) {
    console.error('[FATAL] two-page capture failed:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
}
