import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

/**
 * DIR-095 — AUTHENTICATED, real-data DOM crawl of the streamlined Candidate Overview.
 *
 * WHAT THIS PROVES, AND WHY IT IS NOT A SOURCE-REGEX TEST.
 *   DIR-095 AC1 removed the redundant resume workspace (category tabs, search box, sort
 *   dropdown, grid/list toggle, resume carousel and pagination) from the Cuba candidate
 *   Overview. The sibling suite `tests/dir095-candidate-dashboard-data-lineage.test.mjs`
 *   proves the removal STRUCTURALLY (the controls sit inside a `{!isCuba && (…` guard). This
 *   harness proves it BEHAVIOURALLY, from the rendered DOM of the real page:
 *
 *     • AC1 — `cuba-resume-sort`, `cuba-resume-view-toggle`, `cuba-resume-updated`, the
 *             category tabs, the search input, the "+ Create a New Resume" card and the
 *             "Page X of Y" pagination are ABSENT from the live /dashboard DOM.
 *     • AC2 — the retained surfaces are PRESENT: the Candidate Hero HUD
 *             (`cuba-candidate-hero`), the Executive Rail (`cuba-executive-rail`), the
 *             Next Best Action hub and the analytics band (`cuba-candidate-analytics`).
 *     • AC5 — zero horizontal page overflow at 320 / 375 / 768 / 1024 / 1280 / 1440 / 1920px.
 *
 * SESSION. Minted by the platform's OWN sanctioned mechanism,
 * `tests/e2e/dir006-session.mjs -> mintFirebaseSession()`, which looks a real user up in live
 * Firebase Auth and exchanges a Google-signed custom token for a real ID token. Nothing is
 * fabricated and no credential is hardcoded.
 *
 * SERVERS. The app is served by XAMPP Apache. This harness NEVER starts a server and REFUSES
 * to run when Apache is down (P0 XAMPP-only invariant).
 */

// The app is served by XAMPP Apache with Vite base '/', so the router matches at the ROOT
// origin. Serving the same dist under /IME365/ loads the bundle but the router then 404s on
// every path, so the working origin is http://localhost. Override with DIR095_WEB_ORIGIN.
const BASE = (process.env.DIR095_WEB_ORIGIN || 'http://localhost').replace(/\/+$/, '');
const OUT = '.bridge/evidence';
const md5 = (buffer) => createHash('md5').update(buffer).digest('hex').toUpperCase();
const mask = (value) => String(value).replace(/^(.).*@/, '$1***@');

async function assertApacheServes() {
    try {
        const res = await fetch(`${BASE}/dashboard`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.status;
    } catch (error) {
        console.error(`\n[FATAL] XAMPP Apache is not serving ${BASE}/dashboard — ${error.message}`);
        console.error('This harness NEVER spawns its own server (P0 XAMPP-only invariant).');
        console.error('Bring the stack up first:  bridge xampp start all\n');
        process.exit(1);
    }
}

const VIEWPORTS = [
    { label: '320', width: 320, height: 800 },
    { label: '375', width: 375, height: 812 },
    { label: '768', width: 768, height: 1024 },
    { label: '1024', width: 1024, height: 768 },
    { label: '1280', width: 1280, height: 800 },
    { label: '1440', width: 1440, height: 900 },
    { label: '1920', width: 1920, height: 1080 },
];

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
    process.exit(1);
}
console.log(`[OK] real Google-signed session minted for uid ${session.uid} (${mask(session.email)})`);

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
const consoleErrors = [];
const failedApi = [];
let exitCode = 0;
const fail = (msg) => { console.error(`[FAIL] ${msg}`); exitCode = 1; };

try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

    // The platform's own seeding contract (tests/e2e/dir009-candidate-dashboard.spec.js bootSession).
    await context.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        const authUser = {
            uid, email, emailVerified: true,
            displayName: email.split('@')[0], isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600000 },
            createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
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

    // ── AC2 retention: the workspace really rendered ────────────────────────────
    const retention = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        return {
            hero: document.querySelectorAll('[data-testid="cuba-candidate-hero"]').length,
            rail: document.querySelectorAll('[data-testid="cuba-executive-rail"]').length,
            band: document.querySelectorAll('[data-testid="cuba-candidate-analytics"]').length,
            // AC2 next-best-action guidance. The literal "Next Best Action • ATS Score: X/100"
            // card in DashboardHomepage is LEGACY-ONLY by design — `if (isCubaShellEnabled())
            // return null;` (DIR-090) — because the Cuba Candidate Hero HUD carries the measured
            // next-best-action INSIGHT line instead (`cuba-copilot-insight`, derived from the
            // real bestScore). The Cuba Overview's next-best-action surface is asserted here.
            copilotHud: document.querySelectorAll('[data-testid="cuba-copilot-hud"]').length,
            nextBestActionInsight: Boolean(document.querySelector('[data-testid="cuba-copilot-insight"]')),
            url: location.href,
            seededAuthKeyPresent: Object.keys(localStorage).some((k) => k.startsWith('firebase:authUser:')),
        };
    });
    console.log(`retention probe: ${JSON.stringify(retention)}`);
    if (retention.hero === 0) fail('AC2: the Candidate Hero HUD (cuba-candidate-hero) did not render.');
    if (retention.rail === 0) fail('AC2: the Executive Rail (cuba-executive-rail) did not render.');
    if (retention.band === 0) fail('AC2: the analytics band (cuba-candidate-analytics) did not render.');
    if (retention.copilotHud === 0) fail('AC2: the Copilot Hero HUD (cuba-copilot-hud) did not render.');
    if (!retention.nextBestActionInsight) fail('AC2: the next-best-action insight line (cuba-copilot-insight) is absent.');

    // ── AC1 removal: the redundant resume workspace is GONE from the Cuba Overview ─
    const removal = await page.evaluate(() => {
        const text = (document.body?.innerText || '').replace(/\s+/g, ' ');
        return {
            sortControl: document.querySelectorAll('[data-testid="cuba-resume-sort"]').length,
            viewToggle: document.querySelectorAll('[data-testid="cuba-resume-view-toggle"]').length,
            resumeCards: document.querySelectorAll('[data-testid="cuba-resume-updated"]').length,
            categoryTabs: /All Resumes \(\d+\)/.test(text),
            searchInput: Boolean(document.querySelector('input[aria-label="Search resumes"]')),
            pagination: /Page \d+ of \d+/.test(text),
            createCard: /Create a New Resume/i.test(text),
            bodySnippet: text.slice(0, 400),
        };
    });
    console.log(`removal audit: ${JSON.stringify(removal, null, 2)}`);
    for (const [label, count] of Object.entries({
        'sort dropdown (cuba-resume-sort)': removal.sortControl,
        'view toggle (cuba-resume-view-toggle)': removal.viewToggle,
        'resume cards (cuba-resume-updated)': removal.resumeCards,
    })) {
        if (count !== 0) fail(`AC1: ${label} is still rendered on the Cuba Overview (count ${count}).`);
    }
    if (removal.categoryTabs) fail('AC1: the category filter tabs (All Resumes (n)) are still rendered.');
    if (removal.searchInput) fail('AC1: the search input (aria-label="Search resumes") is still rendered.');
    if (removal.pagination) fail('AC1: the "Page X of Y" pagination is still rendered.');
    if (removal.createCard) fail('AC1: the "+ Create a New Resume" card is still rendered.');

    // ── AC5: zero horizontal overflow across every mandated viewport ────────────
    const overflow = [];
    for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(700);
        const metrics = await page.evaluate(() => {
            const de = document.documentElement;
            return {
                scrollWidth: de.scrollWidth,
                clientWidth: de.clientWidth,
                bodyScrollWidth: document.body.scrollWidth,
                overflow: de.scrollWidth - de.clientWidth,
            };
        });
        const ok = metrics.overflow <= 1;
        overflow.push({ ...vp, ...metrics, ok });
        console.log(`  ${vp.label}px -> scrollWidth ${metrics.scrollWidth} / clientWidth ${metrics.clientWidth} (overflow ${metrics.overflow}) ${ok ? 'OK' : 'FAIL'}`);
        if (!ok) fail(`AC5: horizontal page overflow of ${metrics.overflow}px at ${vp.label}px.`);
    }

    // ── Artifacts ───────────────────────────────────────────────────────────────
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(600);
    await fs.mkdir(OUT, { recursive: true });
    const shoot = async (name, options = {}) => {
        const buffer = await page.screenshot(options);
        await fs.writeFile(path.join(OUT, name), buffer);
        console.log(`  saved ${name} (${buffer.length} bytes, md5 ${md5(buffer)})`);
        return { name, bytes: buffer.length, md5: md5(buffer) };
    };
    const desktop = await shoot('dir095-dashboard-streamlined-1920.png');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(700);
    const mobile = await shoot('dir095-dashboard-streamlined-375.png');

    const manifest = {
        directive: 'DIR-095',
        acceptanceCriteria: ['AC1 removal', 'AC2 retention', 'AC5 responsiveness'],
        servedBy: 'XAMPP Apache',
        base: BASE,
        apacheStatus,
        dataMode: 'REAL (MariaDB via the managed backend API, authenticated with a Google-signed ID token)',
        identity: mask(session.email),
        sessionSource: 'tests/e2e/dir006-session.mjs -> mintFirebaseSession()',
        capturedAt: new Date().toISOString(),
        retention,
        removal,
        overflow,
        artifacts: [desktop, mobile],
        failedApiResponses: failedApi.slice(0, 20),
        consoleErrorCount: consoleErrors.length,
        consoleErrors: consoleErrors.slice(0, 20),
        verdict: exitCode === 0 ? 'PASS' : 'FAIL',
    };
    await fs.writeFile(path.join(OUT, 'dir095-dashboard-crawl-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log('\nmanifest: .bridge/evidence/dir095-dashboard-crawl-manifest.json');
    console.log(`verdict: ${manifest.verdict}; failed /api: ${failedApi.length}; console errors: ${consoleErrors.length}`);
} catch (error) {
    console.error('[FATAL] DIR-095 crawl failed:', error);
    exitCode = 1;
} finally {
    await browser.close();
}
process.exit(exitCode);
