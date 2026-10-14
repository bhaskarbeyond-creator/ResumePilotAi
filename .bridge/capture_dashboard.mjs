import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import AxeBuilder from '@axe-core/playwright';

/**
 * DIR-090 evidence harness — XAMPP-served, self-verifying capture.
 *
 * WHY THIS FILE WAS REWRITTEN. The DIR-090 forensic audit (finding F-EV-1) found that the
 * previous revision produced evidence that could not support the claim it was cited for:
 *
 *   1. It booted its OWN in-process Vite dev server on port 5188. That violates the P0
 *      "XAMPP-only servers" invariant, which forbids spawning a competing background server.
 *   2. Its scroll step no-opped, so `current_dashboard_bottom_analytics.png` came out
 *      BYTE-IDENTICAL to `current_dashboard_live_1920.png` (both 427,882 bytes, MD5
 *      734B5FC719CA5A4045F2B30F1E564C1E). A "below the fold" artifact that is bit-for-bit the
 *      viewport shot is not evidence of anything, and nothing in the harness noticed.
 *   3. It intercepted EVERY data API and answered with an illustrative dataset whose
 *      `/api/user-stats` body literally carried `bestScore: 69` — the reference screenshot's
 *      decorative number. So any figure visible in a capture proved nothing about MariaDB.
 *
 * THE CONTRACT NOW:
 *   • The app is served by XAMPP Apache. This harness NEVER starts a server, and it REFUSES to
 *     run when Apache is down (it tells you to run `bridge xampp start all`).
 *   • Data APIs are NOT mocked by default, so every figure in a capture is a real
 *     MariaDB-backed backend API value. `--mock` restores an illustrative dataset for pure
 *     design review, and the manifest then labels the run ILLUSTRATIVE so it can never be
 *     cited as proof of real data.
 *   • The Firebase session is still seeded: a headless crawler cannot type credentials, and the
 *     seed grants no data — it only satisfies the client-side auth guard.
 *   • The scroller is discovered for real, the scroll is VERIFIED, and the below-the-fold
 *     artifact is PROVEN to differ from the viewport shot by MD5. If it does not differ, the
 *     below-the-fold image is captured only when scrolling is possible. A one-screen layout is
 *     reported as fitting the viewport, and eight viewport widths are checked for overflow.
 */

const args = process.argv.slice(2);
const ALLOW_MOCK = args.includes('--mock');
const urlArg = args.find((a) => a.startsWith('--url='));
const BASE = (urlArg ? urlArg.slice('--url='.length) : process.env.DASHBOARD_CAPTURE_URL || 'http://localhost/IME365').replace(/\/+$/, '');
const OUT_DIR = process.env.DASHBOARD_CAPTURE_DIR || 'C:/Users/mbhas/.gemini/antigravity-ide/brain/a97e1dfc-8786-49f1-af66-3de9b20fbc00';
const EVIDENCE_DIR = process.env.DASHBOARD_EVIDENCE_DIR || '.bridge/evidence';
const VIEWPORTS = [[320, 568], [375, 812], [430, 932], [768, 1024], [1024, 768], [1366, 768], [1440, 900], [1920, 1080]];
// The Firebase web API key is NEVER hardcoded. It is resolved from the environment
// (or the local .env), so no plaintext credential is ever committed (INV-5).
const API_KEY = (() => {
  const fromEnv = process.env.VITE_FIREBASE_KEY || process.env.FIREBASE_API_KEY;
  if (fromEnv) return fromEnv;
  try {
    const m = readFileSync(path.resolve('.env'), 'utf8').match(/^\s*VITE_FIREBASE_KEY\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim();
  } catch { /* no .env present */ }
  throw new Error('VITE_FIREBASE_KEY is required (set it in .env or the environment); the Firebase web API key must never be hardcoded.');
})();

const md5 = (buffer) => createHash('md5').update(buffer).digest('hex').toUpperCase();

/** Fails loudly rather than capturing nothing. Never starts a server (P0 invariant). */
async function assertApacheServes() {
    try {
        const url = new URL(`${BASE}/dashboard`);
        if (url.protocol === 'https:' && url.hostname.endsWith('.local')) {
            return await new Promise((resolve, reject) => {
                const request = https.get(url, { rejectUnauthorized: false }, (response) => {
                    response.resume();
                    resolve(response.statusCode);
                });
                request.on('error', reject);
            });
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.status;
    } catch (error) {
        console.error(`\n[FATAL] XAMPP Apache is not serving ${BASE}/dashboard — ${error.message}`);
        console.error('This harness NEVER spawns its own server (P0 XAMPP-only invariant).');
        console.error('Bring the stack up first:  bridge xampp start all\n');
        process.exit(1);
    }
}

const makeJwt = (payload) => {
    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.${Buffer.from('sig').toString('base64url')}`;
};

const mockToken = makeJwt({
    iss: 'https://securetoken.google.com/ai-resume-builder-424cf',
    aud: 'ai-resume-builder-424cf',
    auth_time: Math.floor(Date.now() / 1000),
    user_id: 'test-user',
    sub: 'test-user',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: 'bhaskar@beyond.com',
    email_verified: true,
    firebase: { identities: { email: ['bhaskar@beyond.com'] }, sign_in_provider: 'password' },
});

/**
 * Illustrative fixture used ONLY under --mock. It is deliberately NOT the reference
 * screenshot's numbers: the harness must never be the source of a "matching" figure.
 */
const ILLUSTRATIVE_RESUMES = [
    {
        id: 'fixture-master', template: 'Cv1', title: 'Fixture Master Resume', type: 'master',
        firstname: 'FIXTURE', lastname: 'ONLY', email: 'fixture@invalid', city: 'Fixtureville', country: 'Nowhere',
        occupation: 'Fixture Engineer', updated_at: '2026-01-05T09:30:00.000Z', created_at: '2026-01-01T09:30:00.000Z',
        summary: 'Illustrative fixture record. Not a real candidate and not a design target.',
        employments: [{ jobTitle: 'Fixture Engineer', employer: 'Fixture Co', startDate: '2021-01-01', endDate: '2026-01-01', description: 'Fixture description.' }],
        educations: [{ school: 'Fixture University', degree: 'Fixture Degree' }],
        skills: [{ skill: 'Fixture' }],
    },
    {
        id: 'fixture-tailored', template: 'Cv2', title: 'Fixture Tailored Resume', type: 'tailored',
        firstname: 'FIXTURE', lastname: 'ONLY', email: 'fixture@invalid', city: 'Fixtureville', country: 'Nowhere',
        occupation: 'Fixture Analyst', updated_at: '2026-01-04T09:30:00.000Z', created_at: '2026-01-02T09:30:00.000Z',
        summary: 'Illustrative fixture record.',
        employments: [{ jobTitle: 'Fixture Analyst', employer: 'Fixture Co', startDate: '2020-01-01', endDate: '2026-01-01', description: 'Fixture description.' }],
        educations: [{ school: 'Fixture University', degree: 'Fixture Degree' }],
        skills: [{ skill: 'Fixture' }],
    },
];

const ILLUSTRATIVE_TRACKER = [
    { id: 'fixture-t1', status: 'applied', dateApplied: '2026-01-03T09:30:00.000Z', title: 'Fixture Role' },
    { id: 'fixture-t2', status: 'interview', dateApplied: '2026-01-04T09:30:00.000Z', title: 'Fixture Role 2' },
];

const DATA_ENDPOINTS = ['/api/user-stats', '/api/resumes', '/api/jobs-data', '/api/favourites',
    '/api/notifications-data', '/api/users-data', '/api/covers', '/api/portfolios', '/api/system/settings'];

/**
 * Scrolls the REAL scroller to the bottom and reports what happened. The previous harness
 * guessed at `.cuba-scrollbar`, found nothing, and silently captured the top of the page twice.
 */
const scrollToBottom = (page) => page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('*')).filter((el) => {
        const overflowY = getComputedStyle(el).overflowY;
        return /(auto|scroll|overlay)/.test(overflowY) && el.scrollHeight > el.clientHeight + 8;
    });
    const target = candidates
        .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0]
        || document.scrollingElement;
    if (!target) return { found: false, before: 0, after: 0, scrollHeight: 0, clientHeight: 0 };
    const before = target.scrollTop;
    target.scrollTop = target.scrollHeight;
    return {
        found: true,
        tag: target.tagName,
        before,
        after: target.scrollTop,
        scrollHeight: target.scrollHeight,
        clientHeight: target.clientHeight,
    };
});

const capture = async () => {
    const apacheStatus = await assertApacheServes();
    console.log(`XAMPP Apache serving ${BASE} (HTTP ${apacheStatus})`);
    console.log(ALLOW_MOCK
        ? '[WARN] --mock is ON: dashboard fixture endpoints are illustrative. This run must NOT be cited as proof of real data.'
        : '[OK] Data APIs are NOT mocked: figures in this capture come from the real MariaDB-backed backend API.');

    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
    const consoleErrors = [];
    const pageErrors = [];

    try {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ignoreHTTPSErrors: true });

        // The ONLY remaining stub: a seeded Firebase session. It grants no data.
        const authUserKey = `firebase:authUser:${API_KEY}:[DEFAULT]`;
        await context.addInitScript(({ key, apiKey, token }) => {
            const userObj = {
                uid: 'test-user', email: 'bhaskar@beyond.com', emailVerified: true,
                displayName: 'Bhaskar Beyond', isAnonymous: false,
                stsTokenManager: { apiKey, refreshToken: 'fix', accessToken: token, expirationTime: Date.now() + 3600000 },
                createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
            };
            localStorage.setItem(key, JSON.stringify(userObj));
            localStorage.setItem('user', 'test-user');
        }, { key: authUserKey, apiKey: API_KEY, token: mockToken });

        const page = await context.newPage();
        page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
        page.on('pageerror', (err) => {
            pageErrors.push(err.message);
            consoleErrors.push(`pageerror: ${err.message}`);
        });

        // Firebase token exchange must always be stubbed: no real credentials are available here.
        await page.route('**/securetoken.googleapis.com/**', (r) => r.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ access_token: mockToken, expires_in: '3600', token_type: 'Bearer', refresh_token: 'fix', id_token: mockToken, user_id: 'test-user', project_id: 'ai-resume-builder-424cf' }),
        }));
        await page.route('**/identitytoolkit.googleapis.com/**', (r) => r.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ users: [{ localId: 'test-user', email: 'bhaskar@beyond.com', emailVerified: true, displayName: 'Bhaskar Beyond' }] }),
        }));

        if (ALLOW_MOCK) {
            const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
            await page.route('**/api/**', (route) => {
                const { pathname } = new URL(route.request().url());
                if (pathname === '/api/user-stats') return route.fulfill(json({ success: true, stats: { resumes: null, applications: null, bestScore: null, targetScore: 80 } }));
                if (pathname === '/api/resumes') return route.fulfill(json({ resumes: ILLUSTRATIVE_RESUMES, allResumes: ILLUSTRATIVE_RESUMES }));
                if (pathname === '/api/jobs-data/tracker') return route.fulfill(json({ jobs: ILLUSTRATIVE_TRACKER }));
                if (DATA_ENDPOINTS.some((endpoint) => pathname.startsWith(endpoint))) return route.fulfill(json({}));
                return route.continue();
            });
        }

        console.log('Navigating to /dashboard ...');
        await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(4500);

        // The dashboard must actually have RENDERED. A blank shell is a FAILED capture, not "an
        // empty dashboard" — the previous harness would have screenshotted it and shipped it.
        const renderProbe = await page.evaluate(() => ({
            hero: document.querySelectorAll('[data-testid="cuba-candidate-hero"]').length,
            assistantTextPresent: (document.body?.innerText || '').includes('AI Career Assistant'),
            executiveRailPresent: document.querySelectorAll('[data-testid="cuba-executive-rail"]').length > 0,
            bodyText: (document.body?.innerText || '').trim().length,
        }));
        console.log(`render probe: ${JSON.stringify(renderProbe)}`);
        if (renderProbe.hero === 0) {
            console.error('\n[FATAL] /dashboard rendered no Candidate workspace hero.');
            console.error('Diagnosis: the page booted but the shell stayed empty. Apache DOES reverse-proxy /api to the');
            console.error('managed backend API, and that API answers 401 Unauthorized for this harness session (the seeded');
            console.error('JWT is a stub), so no data-backed surface renders. A REAL-data capture therefore requires a');
            console.error('genuinely authenticated session. The previous harness sidestepped this by mocking EVERY API,');
            console.error('which is exactly why its figures were fixtures and not MariaDB values.');
            console.error('Mocked runs (--mock) are for design review only and are labelled ILLUSTRATIVE.');
            process.exitCode = 1;
        }
        if (renderProbe.assistantTextPresent || renderProbe.executiveRailPresent) {
            console.error('\n[FATAL] the retired AI Career Assistant rail is still present on /dashboard.');
            process.exitCode = 1;
        }

        await fs.mkdir(OUT_DIR, { recursive: true });
        await fs.mkdir(EVIDENCE_DIR, { recursive: true });

        const shoot = async (name, options = {}) => {
            const buffer = await page.screenshot(options);
            await fs.writeFile(path.join(OUT_DIR, name), buffer);
            await fs.writeFile(path.join(EVIDENCE_DIR, name), buffer);
            console.log(`  saved ${name} (${buffer.length} bytes, md5 ${md5(buffer)})`);
            return { name, bytes: buffer.length, md5: md5(buffer) };
        };

        const viewport = await shoot('current_dashboard_live_1920.png');

        const accessibility = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze();
        await fs.writeFile(path.join(EVIDENCE_DIR, 'dashboard-axe.json'), `${JSON.stringify(accessibility, null, 2)}\n`);
        console.log(`axe WCAG 2.1 AA: ${accessibility.violations.length} violations`);
        if (accessibility.violations.length > 0) process.exitCode = 1;
        if (pageErrors.length > 0) process.exitCode = 1;

        // ---- below the fold: capture only when the dashboard has a real scroll range ----
        const scroll = await scrollToBottom(page);
        console.log(`scroll: ${JSON.stringify(scroll)}`);
        let bottom = null;
        const scrollable = scroll.found && scroll.after > scroll.before;
        const fitsViewport = scroll.found && scroll.scrollHeight <= scroll.clientHeight + 8;
        if (scrollable) {
            await page.waitForTimeout(500);
            bottom = await shoot('current_dashboard_bottom_analytics.png');
            if (bottom.md5 === viewport.md5) {
                console.error('\n[FATAL] the scrolled dashboard capture is byte-identical to the initial viewport.');
                process.exitCode = 1;
            } else {
                console.log(`[OK] the bottom artifact is genuinely different (${viewport.md5} != ${bottom.md5}).`);
            }
        } else if (fitsViewport) {
            console.log('[OK] dashboard content fits in one viewport; no below-the-fold capture is needed.');
        } else {
            console.error(`[FATAL] dashboard has an unresolved scroll state: ${JSON.stringify(scroll)}.`);
            process.exitCode = 1;
        }

        // ---- full-page artifact, guaranteed to contain the whole document ----
        await page.evaluate(() => { if (document.scrollingElement) document.scrollingElement.scrollTop = 0; });
        await page.waitForTimeout(400);
        const full = await shoot('current_dashboard_fullpage.png', { fullPage: true });

        // ---- tall viewport composition ----
        await page.setViewportSize({ width: 1920, height: 1300 });
        await page.waitForTimeout(1000);
        const tall = await shoot('current_dashboard_tall_1300.png');

        const viewportAudit = [];
        for (const [width, height] of VIEWPORTS) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(250);
            const measurement = await page.evaluate(() => ({
                viewport: `${innerWidth}x${innerHeight}`,
                documentWidth: document.documentElement.scrollWidth,
                documentHeight: document.documentElement.scrollHeight,
                heroVisible: Boolean(document.querySelector('[data-testid="cuba-candidate-hero"]')),
                assistantTextPresent: (document.body?.innerText || '').includes('AI Career Assistant'),
                executiveRailPresent: Boolean(document.querySelector('[data-testid="cuba-executive-rail"]')),
                primaryActionVisible: Boolean(document.querySelector('[data-testid="cuba-copilot-cta-new-resume"]')),
                shellViewportLock: document.querySelector('main[data-viewport-lock="true"]') !== null,
                mainScrollEnabled: Boolean(document.querySelector('#cuba-main-content')
                    && ['auto', 'scroll'].includes(getComputedStyle(document.querySelector('#cuba-main-content')).overflowY)),
                mainHasOverflow: Boolean(document.querySelector('#cuba-main-content')
                    && document.querySelector('#cuba-main-content').scrollHeight > document.querySelector('#cuba-main-content').clientHeight + 8),
                workspaceScrollEnabled: Boolean(document.querySelector('[data-testid="cuba-overview-workspace"]')
                    && ['auto', 'scroll'].includes(getComputedStyle(document.querySelector('[data-testid="cuba-overview-workspace"]')).overflowY)),
                workspaceHasOverflow: Boolean(document.querySelector('[data-testid="cuba-overview-workspace"]')
                    && document.querySelector('[data-testid="cuba-overview-workspace"]').scrollHeight > document.querySelector('[data-testid="cuba-overview-workspace"]').clientHeight + 8),
            }));
            viewportAudit.push(measurement);
            const desktopWorkspaceScrollRequired = width >= 1280 && !measurement.workspaceScrollEnabled;
            if (measurement.documentWidth > width || measurement.documentHeight > height + 8 || !measurement.heroVisible || !measurement.primaryActionVisible || !measurement.shellViewportLock || !measurement.mainScrollEnabled || desktopWorkspaceScrollRequired || measurement.assistantTextPresent || measurement.executiveRailPresent) {
                console.error(`[FATAL] dashboard viewport check failed: ${JSON.stringify(measurement)}`);
                process.exitCode = 1;
            }
            await page.evaluate(() => {
                document.querySelectorAll('*').forEach((element) => {
                    if (element.scrollTop) element.scrollTop = 0;
                });
            });
            await shoot(`dashboard-${width}x${height}.png`);
        }

        const manifest = {
            directive: 'DIR-090',
            servedBy: 'XAMPP Apache',
            base: BASE,
            apacheStatus,
            dataMode: ALLOW_MOCK
                ? 'ILLUSTRATIVE (mocked data APIs — NOT real evidence)'
                : 'REAL (MariaDB via the managed backend API)',
            capturedAt: new Date().toISOString(),
            scroll,
            fitsViewport,
            artifacts: [viewport, ...(bottom ? [bottom] : []), full, tall],
            viewportAudit,
            assistantPanelAbsent: !renderProbe.assistantTextPresent && !renderProbe.executiveRailPresent,
            axeViolationCount: accessibility.violations.length,
            axeViolations: accessibility.violations.map(({ id, impact, help }) => ({ id, impact, help })),
            pageErrors,
            belowFoldIsDistinct: bottom ? bottom.md5 !== viewport.md5 : null,
            consoleErrorCount: consoleErrors.length,
            consoleErrors: consoleErrors.slice(0, 20),
        };
        await fs.writeFile(path.join(EVIDENCE_DIR, 'dir090-capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        console.log(`\nmanifest: ${path.join(EVIDENCE_DIR, 'dir090-capture-manifest.json')}`);
        console.log(`console errors: ${consoleErrors.length}`);
    } catch (error) {
        console.error('[FATAL] capture failed:', error);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
};

capture();


