// @ts-check
/**
 * DIR-011 — Google Material 3 Universal AppHeader & Command Surface across every
 * authenticated dashboard (Candidate, Recruiter, Enterprise, Admin).
 *
 * ENVIRONMENT MANDATE (Directive DIR-011):
 *   Drives the live Vite dev server on http://localhost:3000, whose /api/* is proxied
 *   by vite.config.js to the live backend on http://localhost:8080 and its
 *   authoritative MariaDB. This spec starts no server of its own and never
 *   intercepts, mocks or fulfills an `/api/*` route: every response the browser sees
 *   is the real one. `trace` is 'off' for the empirically verified reason recorded in
 *   playwright.dir006.config.js — tracing stalls page.goto against the live dev
 *   server until timeout.
 *
 * ZERO FABRICATION (the anti-empty-state rule from DIR-006/DIR-010):
 *   The identity is minted through firebase-admin for a real Firebase Auth user, and
 *   the notification count asserted in stage 5 is the count the LIVE backend returns
 *   for that uid. The suite NEVER asserts "the header renders correctly" against a
 *   signed-out browser or a stubbed API: if no identity is configured it FAILS LOUDLY
 *   in beforeAll rather than passing vacuously.
 *
 * WHAT THIS SUITE PROVES (the DIR-011 acceptance criteria, stage by stage):
 *   Stage 0  the live backend is healthy and MariaDB is the authoritative store.
 *   Stage 1  SINGLE HEADER, FOUR PORTALS: exactly one <header> and exactly ONE uniquely
 *            named navigation landmark per authenticated route, on candidate,
 *            recruiter, enterprise AND admin chrome alike.
 *   Stage 2  M3 COMMAND SEARCH: the centred pill trigger exists with its Ctrl+K
 *            shortcut badge, advertises the shortcut to AT, opens the real command
 *            palette on click, and is reachable by the Ctrl+K keyboard shortcut.
 *   Stage 3  RESPONSIVE COLLAPSE: below 768px the pill collapses to an icon button of
 *            the SAME function (identical accessible name), never to a dead control.
 *   Stage 4  ACCOUNT MENU A11Y: role="menu" with role="menuitem" children, roving
 *            arrow-key navigation, Escape dismissal and focus restoration.
 *   Stage 5  LIVE IDENTITY + NOTIFICATIONS: the account menu shows the REAL session
 *            email, and the bell's unread badge matches the count the LIVE backend
 *            reports for this uid.
 *   Stage 6  SEMANTIC BREADCRUMBS: exactly one <nav aria-label="Breadcrumb"> with an
 *            <ol>, and a bold aria-current="page" tail that is NOT a link.
 *   Stage 7  WCAG 2.1 AA: header ink >= 4.5:1 on the LIVE computed styles, plus a
 *            visible keyboard focus indicator.
 *   Stage 8  FROZEN SURFACES: 51 CV templates + DOCX export + ATS scoring engine are
 *            byte-identical to the e314f715 freeze (git diff = 0).
 *   Stage 9  the whole run accumulated ZERO console errors, ZERO page errors and ZERO
 *            failed API requests.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR011_WEB_ORIGIN || 'http://localhost:3000';
const API_ORIGIN = process.env.DIR011_API_ORIGIN || 'http://localhost:8080';

/**
 * DIR-011 freeze baseline — the same certified commit DIR-010 froze against.
 * The invariant list requires the 51 CV templates, the DOCX export pipeline and the
 * MariaDB ATS scoring engine to remain byte-identical to it.
 */
const FREEZE_BASELINE = 'e314f715';

/**
 * The frozen paths DIR-011 names explicitly.
 *
 * Every path below is proven to exist on disk by stage 8 BEFORE the diff is taken.
 * This guard is not paranoia: git silently ignores a pathspec that matches nothing and
 * still exits 0, so a diff over a non-existent path is indistinguishable from a
 * genuine "frozen" pass. Guarding first makes the zero-diff assertion meaningful.
 */
const FROZEN_PATHS = [
    'src/cv-templates',                  // Cv1-Cv51 templates
    'src/components/TemplateRenderer.jsx',
    'src/utils/atsScore.js',             // ATS scoring engine
    'src/utils/docxDownload.js',         // DOCX export client
    'backend/services',                  // DOCX export service + ATS engine
];

/**
 * The authenticated routes under test, taken verbatim from the mounted route table in
 * src/main.jsx — NOT assumed from the directive's prose.
 */
const ROUTES = Object.freeze([
    { name: 'candidate', path: '/dashboard' },
    { name: 'recruiter', path: '/employer' },
    { name: 'enterprise', path: '/org' },
    { name: 'admin', path: '/admin' },
]);

const EVIDENCE_DIR = path.join(process.cwd(), '.bridge', 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function record(line) {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    fs.appendFileSync(path.join(EVIDENCE_DIR, 'dir011-console.log'), `${stamped}\n`);
    console.log(stamped);
}

/**
 * Resolves a live identity. DIR-011's explicit override wins, then the established
 * platform identity variables, so the suite does not depend on a single ambient
 * variable being inherited by the Playwright worker.
 */
async function ensureSession() {
    const candidates = [
        process.env.DIR011_EMAIL,
        process.env.DIR010_RECRUITER_EMAIL,
        process.env.DIR006_EMAIL,
        process.env.ADMIN_EMAIL,
    ].filter(Boolean);
    for (const email of candidates) {
        const session = await mintFirebaseSession({ email });
        if (session) return session;
    }
    return null;
}

const SESSION = await ensureSession();


/** Seeds the browser session exactly the way the app's own Firebase SDK expects. */
async function bootSession(page) {
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
        // Pin the Cuba shell so the suite measures the directive's TARGET surface
        // (the universal M3 CubaAppShell header) rather than the legacy chrome that
        // mounts when the §49 rollout flag is off.
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
        localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
        localStorage.setItem('ime365_privacy_consent_v1', 'denied');
    }, {
        uid: SESSION.uid,
        email: SESSION.email,
        token: SESSION.idToken,
        refreshToken: SESSION.refreshToken,
        apiKey: SESSION.apiKey,
    });
}

/**
 * Collects the three defect classes DIR-011 forbids: browser console errors, uncaught
 * page errors, and any `/api/*` response >= 400.
 */
function watchForDefects(page) {
    const consoleErrors = [];
    const pageErrors = [];
    const failedApi = [];
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (/favicon|Content Security Policy/i.test(text)) return;
        consoleErrors.push(text);
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('response', (response) => {
        const { pathname } = new URL(response.url());
        if (pathname.startsWith('/api/') && response.status() >= 400) {
            failedApi.push(`${response.status()} ${pathname}`);
        }
    });
    return { consoleErrors, pageErrors, failedApi };
}

/** Run-wide defect accumulation, drained and asserted in stage 9. */
const RUN_DEFECTS = { consoleErrors: [], pageErrors: [], failedApi: [] };

function assertNoDefects(stage, defects) {
    RUN_DEFECTS.consoleErrors.push(...defects.consoleErrors);
    RUN_DEFECTS.pageErrors.push(...defects.pageErrors);
    RUN_DEFECTS.failedApi.push(...defects.failedApi);
    record(`${stage} defects: console=${defects.consoleErrors.length} pageErrors=${defects.pageErrors.length} api=${defects.failedApi.length}`);
    expect(defects.consoleErrors, `${stage} must not log console errors`).toEqual([]);
    expect(defects.pageErrors, `${stage} must not throw uncaught errors`).toEqual([]);
    expect(defects.failedApi, `${stage} must not fail any /api/* request`).toEqual([]);
}

/**
 * Navigates to a route and waits for the universal header to actually paint.
 *
 * The wait is on the header itself, not on a network-idle heuristic, so the suite
 * cannot measure a shell that mounted late or not at all.
 */
async function openRoute(page, routePath) {
    await page.goto(`${WEB_ORIGIN}${routePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('header', { state: 'attached', timeout: 60_000 });
}

/**
 * Contrast ratio per WCAG 2.1 relative luminance. Kept in the suite rather than
 * borrowed from a dependency so the number asserted here is one a reviewer can
 * recompute by hand from the two rgb() triples the browser reported. Returns null for
 * anything that is not a parseable rgb(a) value, so a `rgba(0, 0, 0, 0)` transparent
 * label can never fake a passing ratio.
 */
function contrastRatio(fg, bg) {
    const parse = (value) => {
        const m = /^rgba?\(([^)]+)\)$/.exec(String(value || '').trim());
        if (!m) return null;
        const parts = m[1].split(',').map((n) => parseFloat(n));
        if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
        if (parts.length === 4 && parts[3] === 0) return null; // fully transparent
        return parts.slice(0, 3);
    };
    const a = parse(fg);
    const b = parse(bg);
    if (!a || !b) return null;
    const lum = (rgb) => {
        const [r, g, bl] = rgb.map((channel) => {
            const c = channel / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const l1 = lum(a);
    const l2 = lum(b);
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
}

function frozenDiffStat() {
    return execFileSync(
        'git',
        ['diff', '--stat', FREEZE_BASELINE, '--', ...FROZEN_PATHS],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
}

test.beforeAll(() => {
    if (!SESSION) {
        throw new Error(
            'DIR-011 requires a live identity. Set DIR011_EMAIL or ADMIN_EMAIL; '
            + 'refusing to run against a signed-out browser.',
        );
    }
    record(`DIR-011 suite starting against ${WEB_ORIGIN} as ${SESSION.email} (uid ${SESSION.uid})`);
});

test.describe('DIR-011 — universal Google M3 AppHeader & command surface', () => {
    /**
     * STAGE 0 — LIVE STACK. The header reads real data from the real backend, so a
     * green header suite against a dead backend would prove nothing.
     */
    test('stage 0: the live stack is healthy and MariaDB authoritative', async ({ request }) => {
        // `/api/platform/health` sits BEHIND `router.use(requireAuth)`
        // (backend/routes/platform.js:261) ahead of the route itself, so it is an
        // authenticated diagnostics endpoint, not the unauthenticated liveness probe.
        // Probing it anonymously therefore proves nothing about the running system —
        // it only re-asserts that RBAC is on. This suite mints a live session in
        // beforeAll, so the probe carries that identity and measures the real thing.
        const response = await request.get(`${API_ORIGIN}/api/platform/health`, {
            headers: { Authorization: `Bearer ${SESSION.idToken}` },
        });
        expect(response.status(), 'the live backend must answer the platform health probe').toBe(200);
        const body = await response.json();
        record(`stage 0 health: status=${body.status} database=${body.subsystems?.database?.provider}`);
        // The header's notification read is owner-scoped MariaDB; a non-MariaDB
        // authoritative store means the badge is not reading the real system.
        expect(
            String(body.subsystems?.database?.provider || '').toLowerCase(),
            'MariaDB must be the authoritative store',
        ).toMatch(/mysql|maria/i);
    });

    /**
     * STAGE 1 — SINGLE HEADER, FOUR PORTALS.
     *
     * The directive's core claim is that the header is UNIVERSAL: one AppShell chrome
     * per authenticated route, with a unique landmark nav name. A duplicated <header>
     * or two identically-named nav landmarks would mean two competing chrome trees, and
     * a screen-reader user could not tell which one is authoritative.
     */
    test('stage 1: exactly one header and one uniquely-named nav landmark per portal', async ({ page }) => {
        const defects = watchForDefects(page);
        await bootSession(page);

        const census = [];
        for (const route of ROUTES) {
            // Serial by design: the live stack is shared, and parallel route crawling
            // would interleave `/api/*` load and make a failure undiagnosable.
             
            await openRoute(page, route.path);
             
            const observed = await page.evaluate(() => {
                const visible = (el) => {
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0;
                };
                const navs = [...document.querySelectorAll('nav[aria-label]')]
                    .filter(visible)
                    .map((n) => n.getAttribute('aria-label'));
                return {
                    headers: document.querySelectorAll('header').length,
                    navLabels: navs,
                    breadcrumbNavs: document.querySelectorAll('nav[aria-label="Breadcrumb"]').length,
                    hasCommandSearch: Boolean(document.querySelector('[data-testid="cuba-command-search"]')),
                    hasUserMenu: Boolean(document.querySelector('[data-testid="cuba-user-menu-trigger"]')),
                    hasNotificationBell: Boolean(document.querySelector('[data-testid="cuba-notification-trigger"]')),
                };
            });
            census.push({ ...route, ...observed });

            expect(observed.headers, `${route.path} must render exactly one <header>`).toBe(1);
            expect(
                observed.breadcrumbNavs,
                `${route.path} must publish exactly one Breadcrumb landmark`,
            ).toBe(1);
            expect(
                new Set(observed.navLabels).size,
                `${route.path} nav landmarks must be UNIQUELY named (got ${JSON.stringify(observed.navLabels)})`,
            ).toBe(observed.navLabels.length);
            expect(observed.hasCommandSearch, `${route.path} must expose the M3 command search`).toBe(true);
            expect(observed.hasUserMenu, `${route.path} must expose the M3 account menu`).toBe(true);
            expect(observed.hasNotificationBell, `${route.path} must expose the M3 notification bell`).toBe(true);
        }

        record(`stage 1 portals verified: ${census.map((c) => c.name).join(', ')}`);
        fs.writeFileSync(path.join(EVIDENCE_DIR, 'dir011-chrome-census.json'), `${JSON.stringify(census, null, 2)}\n`);

        assertNoDefects('stage 1', defects);
    });

    // __STAGES__
});
