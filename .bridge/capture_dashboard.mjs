import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

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
 *     run FAILS loudly rather than shipping a duplicate image.
 */

const args = process.argv.slice(2);
const ALLOW_MOCK = args.includes('--mock');
const urlArg = args.find((a) => a.startsWith('--url='));
const BASE = (urlArg ? urlArg.slice('--url='.length) : process.env.DASHBOARD_CAPTURE_URL || 'http://localhost/IME365').replace(/\/+$/, '');
const OUT_DIR = process.env.DASHBOARD_CAPTURE_DIR || 'C:/Users/mbhas/.gemini/antigravity-ide/brain/a97e1dfc-8786-49f1-af66-3de9b20fbc00';
const EVIDENCE_DIR = '.bridge/evidence';
const API_KEY = 'AIzaSyDigXT7n4Pyf-8WHQtvjHa0wGvJ86nmrwc';

const md5 = (buffer) => createHash('md5').update(buffer).digest('hex').toUpperCase();

/** Fails loudly rather than capturing nothing. Never starts a server (P0 invariant). */
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
        ? '[WARN] --mock is ON: every data API is intercepted. This run is ILLUSTRATIVE and must NOT be cited as proof of real data.'
        : '[OK] Data APIs are NOT mocked: figures in this capture come from the real MariaDB-backed backend API.');

    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
    const consoleErrors = [];

    try {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

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
            localStorage.setItem('cuba_workspace_rail', 'docked');
        }, { key: authUserKey, apiKey: API_KEY, token: mockToken });

        const page = await context.newPage();
        page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
        page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

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
            rails: document.querySelectorAll('[data-testid="cuba-executive-rail"]').length,
            hud: document.querySelectorAll('[data-testid="cuba-copilot-hud"]').length,
            bodyText: (document.body?.innerText || '').trim().length,
        }));
        console.log(`render probe: ${JSON.stringify(renderProbe)}`);
        if (renderProbe.rails === 0 && renderProbe.hud === 0) {
            console.error('\n[FATAL] /dashboard rendered no Candidate workspace (no cuba-executive-rail, no cuba-copilot-hud).');
            console.error('Diagnosis: the page booted but the shell stayed empty. Apache DOES reverse-proxy /api to the');
            console.error('managed backend API, and that API answers 401 Unauthorized for this harness session (the seeded');
            console.error('JWT is a stub), so no data-backed surface renders. A REAL-data capture therefore requires a');
            console.error('genuinely authenticated session. The previous harness sidestepped this by mocking EVERY API,');
            console.error('which is exactly why its figures were fixtures and not MariaDB values.');
            console.error('Mocked runs (--mock) are for design review only and are labelled ILLUSTRATIVE.');
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

        // ---- below the fold: scrolled for real, and PROVEN different ----
        const scroll = await scrollToBottom(page);
        console.log(`scroll: ${JSON.stringify(scroll)}`);
        await page.waitForTimeout(1200);
        const bottom = await shoot('current_dashboard_bottom_analytics.png');

        if (!scroll.found || scroll.after <= scroll.before) {
            console.error(`\n[FATAL] the dashboard did not scroll (${JSON.stringify(scroll)}).`);
            console.error('A capture taken from an unscrolled page is not below-the-fold evidence.');
            process.exitCode = 1;
        }
        if (bottom.md5 === viewport.md5) {
            console.error('\n[FATAL] current_dashboard_bottom_analytics.png is BYTE-IDENTICAL to the viewport shot');
            console.error(`(both md5 ${bottom.md5}). That artifact proves nothing and must not be cited.`);
            process.exitCode = 1;
        } else {
            console.log(`[OK] the bottom artifact is genuinely different (${viewport.md5} != ${bottom.md5}).`);
        }

        // ---- full-page artifact, guaranteed to contain the whole document ----
        await page.evaluate(() => { if (document.scrollingElement) document.scrollingElement.scrollTop = 0; });
        await page.waitForTimeout(400);
        const full = await shoot('current_dashboard_fullpage.png', { fullPage: true });

        // ---- tall viewport composition ----
        await page.setViewportSize({ width: 1920, height: 1300 });
        await page.waitForTimeout(1000);
        const tall = await shoot('current_dashboard_tall_1300.png');

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
            artifacts: [viewport, bottom, full, tall],
            belowFoldIsDistinct: bottom.md5 !== viewport.md5,
            consoleErrorCount: consoleErrors.length,
            consoleErrors: consoleErrors.slice(0, 20),
        };
        await fs.writeFile(path.join(EVIDENCE_DIR, 'dir090-capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        console.log('\nmanifest: .bridge/evidence/dir090-capture-manifest.json');
        console.log(`console errors: ${consoleErrors.length}`);
    } catch (error) {
        console.error('[FATAL] capture failed:', error);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
};

capture();


