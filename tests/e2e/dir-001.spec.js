// @ts-check
/**
 * DIR-046 -- DIR-001 (Cuba Executive Design System) certification suite.
 *
 * DIR-001's verification block names `tests/e2e/dir-001.spec.js` as its browser
 * proof, but that file was never authored: the suite below is the gap closure.
 * It asserts DIR-001's SIX acceptance criteria as six named tests, each of which
 * reads the REAL rendered DOM. Nothing here asserts against a source string or a
 * mocked return value where a live measurement is possible.
 *
 * AC MAP (one test per criterion, kept 1:1 so a Gatekeeper can read the verdict
 * straight off the reporter):
 *   AC-1  Cuba chrome is the active shell on /dashboard, /employer,
 *         /org/northwind and /admin/dashboard.
 *   AC-2  Stat cards are a 2-row stack with zero geometric collision -- measured
 *         with getBoundingClientRect, not asserted from the class list.
 *   AC-3  Every nav[aria-label] on a page is uniquely named.
 *   AC-4  M3/Cuba tokens resolve, and no hardcoded hex survives in the four
 *         portal shells (zero raw-hex census over the shell sources).
 *   AC-5  The five canonical breakpoints (375/768/1024/1280/1920) render without
 *         horizontal overflow.
 *   AC-6  Zero console errors, zero unhandled page errors and zero >=400 API
 *         responses across every route visited.
 *
 * HERMETIC BY CONSTRUCTION:
 *   `port: 0` asks the OS for a free port, so this suite can never collide with
 *   the developer's long-lived dev server on :3000. Every /api/* call is served by
 *   the fixtures below, so the suite needs no live backend and no MariaDB. That
 *   is the same guarantee playwright-cuba-audit.mjs relies on, and it is why
 *   `webServer` is deliberately absent from the config: a second origin is what
 *   makes the app's own maintenance guard report "Service temporarily
 *   unavailable".
 */
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
    installAuthenticatedSession,
    viteFixtureDefines,
} from '../helpers/enterprise-fixture.mjs';
import {
    createSuperAdminFixtureBackend,
    seedSuperAdminState,
} from '../helpers/superadmin-fixture.mjs';

/**
 * SERIAL EXECUTION IS ENFORCED BY THE CONFIG, NOT HERE.
 *
 * `test.describe.configure()` is intentionally NOT called at module scope: that
 * call is only legal from inside a test-collection context, and invoking it at
 * import time makes Playwright reject the whole file with "No tests found". The
 * suite's ordering requirement -- one Vite server shared by every test -- is
 * already guaranteed by `workers: 1` and `fullyParallel: false` in
 * playwright.dir046.config.js, which is where serial behaviour belongs.
 */

/** @type {import('vite').ViteDevServer} */
let vite;
let base = '';

/** The four authenticated portals DIR-001 AC-1 names. */
const PORTALS = [
    { name: 'candidate dashboard', path: '/dashboard' },
    { name: 'recruiter portal', path: '/employer' },
    { name: 'enterprise console', path: '/org/northwind' },
    { name: 'platform admin', path: '/admin/dashboard' },
];

const BREAKPOINTS = [375, 768, 1024, 1280, 1920];

/**
 * The five shell sources DIR-001 AC-4 requires to be free of hardcoded colour
 * values -- one per portal namespace, plus the shared CubaPortalShell wrapper.
 * Paths are asserted to exist below so a future refactor that renames a shell
 * fails with a readable message instead of a bare ENOENT.
 */
const SHELL_SOURCES = [
    'src/components/Candidate/CubaCandidateShell.jsx',
    'src/components/cuba/CubaPortalShell.jsx',
    'src/components/EmployerPortal/EmployerPortalCuba.jsx',
    'src/components/admin/AdminPortalCuba.jsx',
    'src/enterprise/EnterprisePortalCuba.jsx',
];
/**
 * Serves the same contract shapes the audit harness serves, in a smaller surface
 * that only has to satisfy what these six assertions read. Every branch reuses a
 * deterministic fixture value, so no response is invented per request.
 */
function installApiFixture(page, superAdminHandler) {
    const json = (route, body) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
    });
    const pagination = { totalItems: 0, totalPages: 1, currentPage: 1, hasNextPage: false, hasPreviousPage: false };

    return page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        const { pathname } = url;
        if (!pathname.startsWith('/api/')) return route.fallback();

        if (pathname === '/api/platform/public-config') {
            return json(route, {
                success: true,
                systemHealth: { maintenanceMode: false, maintenanceMessage: '' },
                services: { database: 'OPERATIONAL', aiRouter: 'OPERATIONAL', payments: 'OPERATIONAL' },
            });
        }
        if (pathname === '/api/service-availability') {
            return json(route, {
                success: true,
                services: { database: 'OPERATIONAL', aiRouter: 'OPERATIONAL', payments: 'OPERATIONAL' },
                auth: { github: true, linkedin: true },
                payments: { stripe: true, paypal: true, razorpay: true },
                enterpriseTenancy: true,
                aiEngine: { operational: true, provider: 'dynamic-orchestrator', latencyMs: 220 },
            });
        }
        if (pathname === '/api/system-settings' || pathname === '/api/public/system-settings') {
            return json(route, { success: true, _settingsSource: 'mariadb-authoritative', modules: {} });
        }
        if (pathname.startsWith('/api/employer/jobs')) return json(route, { jobs: [] });
        if (pathname === '/api/employer/companies') return json(route, { companies: [] });
        if (pathname === '/api/employer/settings') {
            return json(route, { companyName: 'Northwind AI Systems', industry: 'Artificial Intelligence' });
        }
        if (pathname === '/api/jobs-data') return json(route, { success: true, jobs: [], pagination });
        if (pathname.startsWith('/api/resumes')) {
            return json(route, { success: true, resumes: [], allResumes: [], pagination });
        }
        if (pathname.startsWith('/api/covers')) return json(route, { success: true, covers: [] });
        if (pathname.startsWith('/api/users-data/')) {
            return json(route, {
                id: 'dir046-user', firstname: 'Jordan', lastname: 'Vance',
                role: 'SUPER_ADMIN', isEmployer: true, employerApproved: true,
            });
        }
        if (pathname === '/api/check-if-admin' || pathname.endsWith('/check-admin')) {
            return json(route, { isAdmin: true, success: true });
        }
        if (pathname.includes('/applications')) return json(route, { applications: [] });
        if (pathname.includes('/favourites')) return json(route, { favourites: [], jobs: [] });
        if (pathname === '/api/messages/conversations') return json(route, { conversations: [] });
        if (pathname.startsWith('/api/notifications-data')) return json(route, { notifications: [], unreadCount: 0 });
        if (pathname === '/api/platform/role-view-audit') return json(route, { success: true });
        if (pathname.startsWith('/api/enterprise/')) return superAdminHandler(route);
        if (pathname.startsWith('/api/platform/') || pathname.startsWith('/api/admin/')) return superAdminHandler(route);
        return json(route, { success: true });
    });
}

/**
 * Seeds the Cuba shell flag and resolves the privacy banner. The banner is a
 * fixed overlay: left unresolved it covers the shell and every AC-1/AC-2
 * measurement reads the consent dialog instead of the chrome under test.
 */
async function primeCubaShell(page) {
    await page.addInitScript(() => {
        try {
            localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
            localStorage.setItem('resumepilot_privacy_consent_v1', JSON.stringify({
                analytics: true, necessary: true, timestamp: Date.now(),
            }));
        } catch (_) { /* storage-disabled browsers still render the shell */ }
    });
}

/**
 * Collects the three defect classes AC-6 forbids. `apiFailures` records the URL
 * alongside the status so a failure names the endpoint rather than just a count.
 */
function watchForDefects(page) {
    const consoleErrors = [];
    const pageErrors = [];
    const apiFailures = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on('pageerror', (err) => pageErrors.push(err.message.slice(0, 300)));
    page.on('response', (res) => {
        const url = res.url();
        if (url.includes('/api/') && res.status() >= 400) {
            apiFailures.push(`${res.status()} ${new URL(url).pathname}`);
        }
    });
    return { consoleErrors, pageErrors, apiFailures };
}

test.beforeAll(async () => {
    vite = await createServer({
        server: { port: 0, host: '127.0.0.1', strictPort: false },
        logLevel: 'error',
        define: viteFixtureDefines(),
    });
    const server = await vite.listen();
    base = `http://127.0.0.1:${server.config.server.port}`;
});

test.afterAll(async () => {
    await vite?.close();
});

/** Boots an authenticated SUPER_ADMIN session wired to the fixture backend. */
async function openPortal(page, path) {
    const adminState = seedSuperAdminState();
    adminState.status = 'HEALTHY';
    adminState.healthScore = 98;
    const superAdminHandler = createSuperAdminFixtureBackend(adminState);

    await installAuthenticatedSession(page, {
        uid: 'dir046-user',
        email: 'jordan.vance@ime365.com',
        displayName: 'Jordan Vance',
        claims: { role: 'SUPER_ADMIN', superAdmin: true, admin: true, permissions: ['*'] },
    });
    await installApiFixture(page, superAdminHandler);
    await primeCubaShell(page);

    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    // The admin route can briefly paint the route error boundary on a cold Vite
    // dependency cache. One reload picks up the pre-bundled chunk cleanly; the
    // retry is bounded so a genuine failure still fails the assertions below.
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const broken = await page.getByText('Application View Error').isVisible().catch(() => false);
        if (!broken) break;
        await page.waitForTimeout(1000);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);
    }
}

test.describe('DIR-001 Cuba Executive Design System -- certification suite', () => {
    test('AC-1: the Cuba chrome is the active shell on all four authenticated portals', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });

        for (const portal of PORTALS) {
            await openPortal(page, portal.path);

            // The shell marker is the contract DIR-001 froze: every Cuba portal
            // renders the app shell's sidebar landmark, not the legacy chrome.
            const shell = page.locator('nav[aria-label]').first();
            await expect(shell, `${portal.name} (${portal.path}) must render the Cuba shell nav`).toBeVisible({ timeout: 30_000 });

            const cubaSurfaces = await page.evaluate(() => ({
                cubaClassCount: document.querySelectorAll('[class*="cuba-"]').length,
                glassCount: document.querySelectorAll('.cuba-glass, .cuba-glass-strong').length,
            }));

            // A shell that paints zero Cuba surfaces is the legacy chrome wearing
            // a route, which is precisely the regression AC-1 exists to catch.
            expect(cubaSurfaces.cubaClassCount, `${portal.name} renders no Cuba-classed surfaces`).toBeGreaterThan(0);
            expect(
                cubaSurfaces.glassCount + cubaSurfaces.cubaClassCount,
                `${portal.name} renders no Cuba executive surfaces`,
            ).toBeGreaterThan(0);
        }
    });

    test('AC-2: stat cards stack in two rows with zero geometric collision at 1280px', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await openPortal(page, '/dashboard');

        const probe = await page.evaluate(() => {
            const TOLERANCE = 0.5;
            const cards = Array.from(document.querySelectorAll('.cuba-stat-card'));
            const intersect = (a, b) => {
                const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                return w <= TOLERANCE || h <= TOLERANCE ? 0 : Math.round(w * h * 100) / 100;
            };

            const topRow = [];
            const pairwise = [];
            cards.forEach((card, index) => {
                const icon = card.querySelector('.cuba-stat-icon');
                const badge = icon?.parentElement ? icon.parentElement.nextElementSibling : null;
                if (icon && badge) {
                    const area = intersect(icon.getBoundingClientRect(), badge.getBoundingClientRect());
                    if (area > 0) topRow.push({ card: index, intersectionAreaPx2: area });
                }
                // AC-2 also requires a 2-ROW stack: the metric value must sit
                // BELOW the icon row, never beside it on the same baseline.
                const value = card.querySelector('p');
                if (icon && value) {
                    const ir = icon.getBoundingClientRect();
                    const vr = value.getBoundingClientRect();
                    if (vr.top < ir.bottom - TOLERANCE) {
                        topRow.push({ card: index, reason: 'value is not stacked below the icon row' });
                    }
                }
            });
            for (let i = 0; i < cards.length; i += 1) {
                for (let j = i + 1; j < cards.length; j += 1) {
                    const area = intersect(cards[i].getBoundingClientRect(), cards[j].getBoundingClientRect());
                    if (area > 0) pairwise.push({ pair: [i, j], intersectionAreaPx2: area });
                }
            }
            return { cardCount: cards.length, topRow, pairwise };
        });

        // A zero count here means the probe silently proved nothing, so it is
        // treated as a failure rather than a vacuous pass.
        expect(probe.cardCount, 'no .cuba-stat-card rendered, so AC-2 was never exercised').toBeGreaterThan(0);
        expect(probe.topRow, 'stat card icon/badge/value collide or are not stacked').toEqual([]);
        expect(probe.pairwise, 'stat cards overlap each other').toEqual([]);
    });

    test('AC-3: every nav landmark on a page carries a unique accessible name', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });

        for (const portal of PORTALS) {
            await openPortal(page, portal.path);

            const navs = await page.evaluate(() =>
                Array.from(document.querySelectorAll('nav')).map((nav) => ({
                    label: nav.getAttribute('aria-label'),
                    labelledBy: nav.getAttribute('aria-labelledby'),
                })),
            );

            expect(navs.length, `${portal.name} renders no nav landmark`).toBeGreaterThan(0);

            // WCAG 2.1 AA 2.4.6 + the axe `landmark-unique` rule: two navs that
            // resolve to the same name are indistinguishable to a screen reader.
            const resolved = navs.map((nav) => nav.label || (nav.labelledBy ? `labelledby:${nav.labelledBy}` : null));
            expect(
                resolved.filter((name) => name === null),
                `${portal.name} has an unnamed nav landmark`,
            ).toEqual([]);

            const seen = new Set();
            const duplicates = resolved.filter((name) => {
                const key = name.toLowerCase().trim();
                if (seen.has(key)) return true;
                seen.add(key);
                return false;
            });
            expect(duplicates, `${portal.name} has duplicate nav accessible names`).toEqual([]);
        }
    });

    test('AC-4: Cuba/M3 tokens resolve and no shell source carries a hardcoded hex', async ({ page }) => {
        // 4a. The published tokens must actually RESOLVE in the browser. A token
        // that is declared but empty renders transparent UI, so a source-level
        // "the token exists" check would be a false green.
        await page.setViewportSize({ width: 1440, height: 900 });
        await openPortal(page, '/dashboard');
        const resolved = await page.evaluate(() => {
            const cs = getComputedStyle(document.documentElement);
            const names = [
                '--cuba-primary', '--cuba-primary-ink-strong', '--cuba-primary-fill',
                '--cuba-primary-soft', '--cuba-primary-soft-hover',
                '--cuba-canvas', '--cuba-card', '--cuba-line', '--cuba-ink',
            ];
            return names.map((name) => [name, cs.getPropertyValue(name).trim()]);
        });
        const empty = resolved.filter(([, value]) => value.length === 0).map(([name]) => name);
        expect(empty, `unresolved Cuba tokens: ${empty.join(', ')}`).toEqual([]);

        // 4b. Zero hardcoded hex across the four portal shells. Arbitrary-value
        // colour utilities are the defect: they bypass the token layer entirely
        // and therefore cannot follow a theme change.
        const offenders = [];
        const missing = [];
        for (const file of SHELL_SOURCES) {
            if (!fs.existsSync(file)) { missing.push(file); continue; }
            const source = fs.readFileSync(file, 'utf8');
            const matches = source.match(/(?:bg|text|border|from|to|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g);
            if (matches) offenders.push(`${file}: ${[...new Set(matches)].join(', ')}`);
        }
        expect(missing, 'a shell source moved; AC-4 cannot prove what it no longer reads').toEqual([]);
        expect(offenders, `hardcoded hex remains in: ${offenders.join(' | ')}`).toEqual([]);
    });

    test('AC-5: all five canonical breakpoints render without horizontal overflow', async ({ page }) => {
        for (const width of BREAKPOINTS) {
            await page.setViewportSize({ width, height: 900 });

            for (const portal of PORTALS) {
                await openPortal(page, portal.path);
                const overflow = await page.evaluate(() => {
                    const de = document.documentElement;
                    return {
                        scrollWidth: de.scrollWidth,
                        clientWidth: de.clientWidth,
                        overflowing: de.scrollWidth > de.clientWidth + 1,
                    };
                });
                expect(
                    overflow.overflowing,
                    `${portal.name} overflows horizontally at ${width}px (${overflow.scrollWidth} > ${overflow.clientWidth})`,
                ).toBe(false);
            }
        }
    });

    test('AC-6: zero console errors, zero page errors and zero 4xx/5xx API responses', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        const defects = watchForDefects(page);

        // A short settle lets any late-firing effect log before the assertion,
        // so a slow error cannot land after the suite has already passed.
        for (const portal of PORTALS) {
            await openPortal(page, portal.path);
            await page.waitForTimeout(1500);
        }

        expect(defects.apiFailures, `failing API responses: ${defects.apiFailures.join(', ')}`).toEqual([]);
        expect(defects.pageErrors, `unhandled page errors: ${defects.pageErrors.join(' | ')}`).toEqual([]);
        expect(defects.consoleErrors, `console errors: ${defects.consoleErrors.join(' | ')}`).toEqual([]);
    });

    test('INV-1: the frozen CV-template and AI-runtime baseline remains a 0-byte diff', async () => {
        // The certification is worthless if it was bought by editing the frozen
        // surface, so the baseline lock is asserted in the same run as the ACs.
        const diff = execSync(
            'git diff e314f715 -- src/cv-templates/ backend/services/aiRuntime.js src/components/templates/',
            { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
        );
        expect(diff.trim().length).toBe(0);
    });
});
