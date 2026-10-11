import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

/**
 * DIR-090 AC2 — the AUTHENTICATED, real-data capture that never previously existed.
 *
 * WHY THIS FILE IS ADDITIVE AND NOT A CHANGE TO THE FROZEN HARNESS.
 * DIR-090 is APPROVED_FROZEN. Its AC2 was reported BLOCKED because an Apache-served, unmocked
 * capture of /dashboard returned an empty shell: the managed backend API answers 401 to a stub
 * session, so no data-backed surface renders. This script closes that gap WITHOUT touching the
 * certified artifact and WITHOUT fabricating anything:
 *
 *   • The session is minted by the platform's OWN sanctioned mechanism,
 *     `tests/e2e/dir006-session.mjs -> mintFirebaseSession()`, which looks a REAL user up in live
 *     Firebase Auth and exchanges a Google-signed custom token for a real ID token. It returns
 *     null when unconfigured, in which case this script reports the limitation instead of
 *     pretending. Nothing is invented and no credential is hardcoded.
 *   • The app is still served by XAMPP Apache (never by a server this script starts).
 *   • Data APIs are NOT mocked, so every figure in the capture is a real MariaDB-backed value.
 *   • The capture is only accepted if the dashboard actually rendered, the scroll really moved,
 *     and the below-the-fold artifact is proven by MD5 to differ from the viewport shot.
 *
 * It also dumps the live DOM of the audited surfaces, so the DIR-090 findings (the rail's
 * measured insights, the chart legend, the absence of match badges) are evidenced from the
 * rendered page rather than from source alone.
 */

const BASE = (process.env.DIR090_WEB_ORIGIN || 'http://localhost/IME365').replace(/\/+$/, '');
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
    console.error('[BLOCKED] No sanctioned candidate identity configured (DIR009_CANDIDATE_EMAIL / ADMIN_EMAIL).');
    process.exit(1);
}

console.log(`Minting a REAL session for ${mask(identity)} ...`);
const session = await mintFirebaseSession({ email: identity });
if (!session) {
    console.error('[BLOCKED] mintFirebaseSession returned null — the FIREBASE_* credentials are not usable here.');
    console.error('AC2 stays BLOCKED. Nothing is fabricated to work around it.');
    process.exit(1);
}
console.log(`[OK] real Google-signed session minted for uid ${session.uid} (${mask(session.email)})`);

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
const consoleErrors = [];
const failedApi = [];

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
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600000 },
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

    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error' && !/favicon|Content Security Policy/i.test(msg.text())) consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on('response', (response) => {
        const { pathname } = new URL(response.url());
        if (pathname.startsWith('/api/') && response.status() >= 400) failedApi.push(`${response.status()} ${pathname}`);
    });

    console.log('Navigating to /dashboard with the real session ...');
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);

    // ── The page must have really rendered a data-backed candidate workspace ──
    const renderProbe = await page.evaluate(() => ({
        rail: document.querySelectorAll('[data-testid="cuba-executive-rail"]').length,
        hud: document.querySelectorAll('[data-testid="cuba-copilot-hud"]').length,
        band: document.querySelectorAll('[data-testid="cuba-candidate-analytics"]').length,
        bodyText: (document.body?.innerText || '').trim().length,
        url: location.href,
        title: document.title,
        bodySnippet: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
        hasPasswordField: Boolean(document.querySelector('input[type="password"]')),
        seededAuthKeyPresent: Object.keys(localStorage).some((k) => k.startsWith('firebase:authUser:')),
    }));
    console.log(`render probe: ${JSON.stringify(renderProbe)}`);
    if (renderProbe.rail === 0 || renderProbe.band === 0) {
        console.error('[FATAL] the candidate workspace did not render, so AC2 cannot be evidenced.');
        console.error(`failed /api responses: ${JSON.stringify(failedApi.slice(0, 10))}`);
        process.exitCode = 1;
    }

    // ── Live DOM audit of the surfaces DIR-090 reported on ──
    const dom = await page.evaluate(() => {
        const textOf = (sel) => (document.querySelector(sel)?.innerText || '').trim();
        const rail = document.querySelector('[data-testid="cuba-rail-insights"]');
        const bandText = textOf('[data-testid="cuba-candidate-analytics"]');
        return {
            railInsightRows: rail ? Array.from(rail.querySelectorAll('li')).map((li) => li.innerText.replace(/\s+/g, ' ').trim()) : [],
            atsCardText: textOf('[data-testid="cuba-metric-ats"]').replace(/\s+/g, ' '),
            analyticsBandText: bandText.replace(/\s+/g, ' '),
            matchPercentTokensInBand: (bandText.match(/\d{1,3}\s*%/g) || []),
            sortControlPresent: Boolean(document.querySelector('[data-testid="cuba-resume-sort"]')),
            viewTogglePresent: Boolean(document.querySelector('[data-testid="cuba-resume-view-toggle"]')),
            resumeCardCount: document.querySelectorAll('[data-testid="cuba-resume-updated"]').length,
        };
    });
    console.log(`live DOM audit: ${JSON.stringify(dom, null, 2)}`);

    await fs.mkdir(OUT, { recursive: true });
    const shoot = async (name, options = {}) => {
        const buffer = await page.screenshot(options);
        await fs.writeFile(path.join(OUT, name), buffer);
        console.log(`  saved ${name} (${buffer.length} bytes, md5 ${md5(buffer)})`);
        return { name, bytes: buffer.length, md5: md5(buffer) };
    };

    const viewport = await shoot('dir090-ac2-authenticated-live-1920.png');

    // ── Scroll the REAL scroller, then prove the bottom artifact differs ──
    const scroll = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('*')).filter((el) => {
            const overflowY = getComputedStyle(el).overflowY;
            return /(auto|scroll|overlay)/.test(overflowY) && el.scrollHeight > el.clientHeight + 8;
        });
        const target = candidates.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0]
            || document.scrollingElement;
        if (!target) return { found: false, before: 0, after: 0, scrollHeight: 0, clientHeight: 0 };
        const before = target.scrollTop;
        target.scrollTop = target.scrollHeight;
        return { found: true, tag: target.tagName, before, after: target.scrollTop, scrollHeight: target.scrollHeight, clientHeight: target.clientHeight };
    });
    console.log(`scroll: ${JSON.stringify(scroll)}`);
    await page.waitForTimeout(1200);
    const bottom = await shoot('dir090-ac2-authenticated-bottom-analytics.png');

    const scrolled = scroll.found && scroll.after > scroll.before;
    const distinct = bottom.md5 !== viewport.md5;
    if (!scrolled) { console.error('[FATAL] the dashboard did not scroll — no genuine below-the-fold evidence.'); process.exitCode = 1; }
    if (!distinct) { console.error('[FATAL] the bottom artifact is BYTE-IDENTICAL to the viewport shot.'); process.exitCode = 1; }
    if (scrolled && distinct) console.log(`[OK] scrolled ${scroll.before} -> ${scroll.after}; bottom artifact differs (${viewport.md5} != ${bottom.md5}).`);

    await page.evaluate(() => { if (document.scrollingElement) document.scrollingElement.scrollTop = 0; });
    await page.waitForTimeout(400);
    const full = await shoot('dir090-ac2-authenticated-fullpage.png', { fullPage: true });

    const manifest = {
        directive: 'DIR-090',
        acceptanceCriterion: 'AC2 — bottom analytics row compared against the reference',
        servedBy: 'XAMPP Apache',
        base: BASE,
        apacheStatus,
        dataMode: 'REAL (MariaDB via the managed backend API, authenticated with a Google-signed ID token)',
        identity: mask(session.email),
        sessionSource: 'tests/e2e/dir006-session.mjs -> mintFirebaseSession()',
        capturedAt: new Date().toISOString(),
        renderProbe,
        scroll,
        belowFoldIsDistinct: distinct,
        scrollVerified: scrolled,
        artifacts: [viewport, bottom, full],
        failedApiResponses: failedApi.slice(0, 20),
        consoleErrorCount: consoleErrors.length,
        consoleErrors: consoleErrors.slice(0, 20),
        dom,
    };
    await fs.writeFile(path.join(OUT, 'dir090-ac2-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log('\nmanifest: .bridge/evidence/dir090-ac2-manifest.json');
    console.log(`failed /api responses: ${failedApi.length}; console errors: ${consoleErrors.length}`);
} catch (error) {
    console.error('[FATAL] authenticated capture failed:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
}

