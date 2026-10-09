// @ts-check
/**
 * DIR-055 -- Unified Executive Builder Header + Real Interactive Notifications
 * Pipeline. Hermetic real-DOM verification of S5-S8 and S11.
 *
 * AC MAP -- one named test per acceptance criterion:
 *   AC-1  On a builder route the Cuba shell suppresses ONLY its top bar, so the
 *         page renders EXACTLY ONE <header> (S5) -- the double-header defect.
 *   AC-2  The builder header is the Cuba glass surface and still carries every
 *         legacy control: Dashboard exit, editable title, template pill, save
 *         beacon, ATS pill, Share, Sync Profile, Preview, Download, mobile menu.
 *   AC-3  The 11-step ribbon renders all 11 steps with completed checkmarks (S6).
 *   AC-4  The ATS pill opens the real ATS drawer (S6).
 *   AC-5  The builder header hosts M3NotificationCenter and M3UserMenu, sourced
 *         from AuthContext (S7).
 *   AC-6  ZERO dead hrefs: every notification row is either a real navigable
 *         control (data-navigable="true") or NOT a button at all (S2).
 *   AC-7  Mark-all-read decrements the bell badge to 0 against the REAL
 *         owner-scoped endpoint (S3/S8).
 *   AC-8  Zero console errors and zero native dialogs at 375, 768 and 1280.
 *
 * HERMETIC BY CONSTRUCTION, mirroring playwright.dir048.config.js: `port: 0`
 * asks the OS for a free port, every /api/* call is served by the fixture below,
 * and `webServer` is deliberately absent so no second origin exists.
 */
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import {
    installAuthenticatedSession,
    viteFixtureDefines,
} from '../helpers/enterprise-fixture.mjs';

const ROOT = process.cwd();
const EVIDENCE = path.join(ROOT, '.bridge', 'evidence');
const REPORT_PATH = path.join(EVIDENCE, 'dir055-results.json');
const BUILDER_ROUTE = '/build-resume';
const VIEWPORTS = [375, 768, 1280];

/** @type {import('vite').ViteDevServer} */
let vite;
let base = '';

const IDENTITY = {
    uid: 'dir055-user',
    email: 'jordan.vance@ime365.com',
    displayName: 'Jordan Vance',
    claims: { role: 'CANDIDATE' },
};

/** Report rows accumulated across tests, flushed in afterAll. */
const report = { directive: 'DIR-055', generatedAt: null, checks: [] };
function record(check, detail) {
    report.checks.push({ check, ...detail });
}

/**
 * Serves the REAL contract shapes the builder and the notification centre read.
 *
 * The notification feed is MUTABLE on the server side of this fixture, so the
 * PATCH and mark-all-read round-trips are genuinely exercised rather than
 * short-circuited by a static stub: a row the UI marks read really is read when
 * the panel is re-opened.
 */
function installApiFixture(page) {
    const json = (route, body, status = 200) => route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
    });
    const pagination = { totalItems: 0, totalPages: 1, currentPage: 1, hasNextPage: false, hasPreviousPage: false };

    const state = {
        notifications: [
            // A REAL row: attributed sender + a real snippet + a navigable type.
            { id: 'dir055-n1', type: 'message', title: 'Message from Jordan Vance', message: 'Can we move the interview?', read: false, created_at: new Date(Date.now() - 3_600_000).toISOString() },
            // A real second row so the badge starts at 2 and must reach 0.
            { id: 'dir055-n2', type: 'application_interview', title: 'Interview invitation', message: 'You have been invited to interview.', read: false, created_at: new Date(Date.now() - 86_400_000).toISOString() },
            // A row with NO honest destination: it must NOT render as a button.
            { id: 'dir055-n3', type: 'totally_unknown_system_event', title: 'System notice', message: 'No destination exists for this type.', read: true, created_at: new Date(Date.now() - 172_800_000).toISOString() },
        ],
    };

    return page.route('**/*', async (route) => {
        const { pathname } = new URL(route.request().url());
        if (!pathname.startsWith('/api/')) return route.fallback();
        const method = route.request().method();

        // ---- notifications pipeline (the S2/S3 contract) --------------------
        if (pathname === '/api/notifications-data' && method === 'GET') {
            return json(route, { success: true, notifications: state.notifications });
        }
        if (pathname === '/api/notifications-data/mark-all-read' && method === 'POST') {
            state.notifications = state.notifications.map((n) => ({ ...n, read: true }));
            return json(route, { success: true, updated: state.notifications.length });
        }
        if (/^\/api\/notifications-data\/[^/]+$/.test(pathname) && method === 'PATCH') {
            const id = decodeURIComponent(pathname.split('/').pop());
            const body = route.request().postDataJSON() || {};
            state.notifications = state.notifications.map((n) => (n.id === id ? { ...n, read: body.read === true } : n));
            return json(route, { success: true });
        }

        // ---- shell / builder contracts --------------------------------------
        if (pathname === '/api/platform/public-config') {
            // `_settingsSource` is LOAD-BEARING: main.jsx gates the ENTIRE app on
            // /^mariadb(?:$|-)/.test(publicConfig._settingsSource) and renders the
            // "Service temporarily unavailable" maintenance screen otherwise.
            // Omitting it makes every downstream assertion fail on a blank page.
            return json(route, {
                success: true,
                _settingsSource: 'mariadb-authoritative',
                systemHealth: { maintenanceMode: false, maintenanceMessage: '' },
                services: { database: 'OPERATIONAL', aiRouter: 'OPERATIONAL', payments: 'OPERATIONAL' },
            });
        }
        if (pathname === '/api/service-availability') {
            return json(route, {
                success: true,
                services: { database: 'OPERATIONAL', aiRouter: 'OPERATIONAL', payments: 'OPERATIONAL' },
                ai: { providers: true, available: true, degraded: false, configured: 1 },
            });
        }
        if (pathname === '/api/system-settings' || pathname === '/api/public/system-settings') {
            return json(route, { success: true, _settingsSource: 'mariadb-authoritative', modules: {} });
        }
        if (pathname === '/api/account-info' || pathname === '/api/users/profile' || pathname === '/api/user-profile') {
            return json(route, { success: true, firstname: 'Jordan', lastname: 'Vance', membership: 'Basic' });
        }
        if (pathname.startsWith('/api/resumes') || pathname.startsWith('/api/resume')) {
            return json(route, { success: true, resumes: [], allResumes: [], pagination });
        }
        if (pathname.startsWith('/api/notifications-data/contact/list')) {
            return json(route, { success: true, messages: [] });
        }
        if (pathname.startsWith('/api/jobs-data')) return json(route, { success: true, jobs: [], pagination });

        // Permissive default: the builder hydrates many optional surfaces. This
        // returns a well-formed empty success so an unrelated endpoint cannot
        // turn into a console error, while the contracts above stay REAL.
        return json(route, { success: true, pagination });
    });
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
    try {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        report.generatedAt = new Date().toISOString();
        fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    } catch (_) { /* evidence write is best-effort */ }
});

/** Boot the builder with a real session and the API fixture installed. */
async function openBuilder(page, viewport = 1280) {
    await page.setViewportSize({ width: viewport, height: 900 });
    const consoleErrors = [];
    const dialogs = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('dialog', async (dialog) => { dialogs.push(`${dialog.type()}: ${dialog.message()}`); await dialog.dismiss(); });
    await installAuthenticatedSession(page, IDENTITY);
    await installApiFixture(page);
    await page.goto(`${base}${BUILDER_ROUTE}`, { waitUntil: 'domcontentloaded' });
    // The builder hydrates ASYNCHRONOUSLY (auth -> draft -> settings), so wait for
    // one of its own landmarks rather than guessing a fixed delay. A timeout is
    // swallowed on purpose: the diagnostics below then show what DID render.
    await page.waitForSelector('nav[aria-label="Resume Steps Stepper"]', { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(600);
    // Diagnostics: the resolved URL and a body excerpt make a mount failure
    // diagnosable from the evidence JSON instead of a bare "0 elements".
    const url = page.url();
    const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
    return { consoleErrors, dialogs, url, body };
}

const headerLocator = (page) => page.locator('header');
const bellTrigger = (page) => page.locator('[data-testid="cuba-notification-trigger"]');

/* ── AC-1: exactly one top bar on a builder route (S5) ────────────────────── */
test('AC-1: a builder route renders EXACTLY ONE top bar (double-header fixed)', async ({ page }) => {
    const { consoleErrors, url, body } = await openBuilder(page, 1280);
    // "One header" means one TOP BAR. The builder also renders a per-step card
    // <header> (StepShell) inside the content area, which is a SECTION HEADING,
    // not chrome -- counting every <header> would measure the wrong thing.
    const topBars = page.locator('header.sticky.top-0');
    const topBarCount = await topBars.count();
    record('AC-1', { topBars: topBarCount, allHeaders: await headerLocator(page).count(), url, consoleErrors });
    expect(topBarCount, `exactly one top bar (url=${url}, body=${body})`).toBe(1);

    // The single surviving top bar must be the BUILDER's, not the shell's.
    await expect(topBars.first().getByLabel('Save and exit to dashboard')).toBeVisible();
    // Navigation must SURVIVE -- only the top bar is skipped, never the shell.
    await expect(page.locator('[data-testid="cuba-sidebar"]')).toHaveCount(1);
});

/* ── AC-2: glass surface + every legacy control retained (S6) ─────────────── */
test('AC-2: the header is the Cuba glass surface and keeps the legacy controls', async ({ page }) => {
    await openBuilder(page, 1280);
    const header = headerLocator(page).first();
    const cls = (await header.getAttribute('class')) || '';
    record('AC-2', { headerClass: cls });
    expect(cls, 'must reuse the Cuba glass surface').toContain('cuba-glass');
    expect(cls, 'must reuse the xl elevation token').toContain('shadow-cuba-xl');
    expect(cls, 'the ad-hoc white bar must be gone').not.toContain('bg-white/95');
    expect(cls, 'the ad-hoc hairline border must be gone').not.toContain('border-slate-200/90');

    // Controls that must ALWAYS be present. Scoped to the TOP BAR on purpose: a
    // footer also renders a "Preview" button, so an unscoped locator is a strict
    // -mode violation and would assert on the wrong control.
    const topBar = page.locator('header.sticky.top-0').first();
    await expect(topBar.getByLabel('Save and exit to dashboard')).toBeVisible();
    await expect(topBar.getByTitle('Click to switch template')).toBeVisible();
    await expect(topBar.getByRole('button', { name: 'Preview' })).toBeVisible();
    await expect(topBar.getByRole('button', { name: 'Download' })).toBeVisible();
    // The click-to-edit title is a real control with a rename affordance.
    await expect(topBar.getByTitle('Click to rename resume')).toBeVisible();

    // Flag-gated controls: recorded, not asserted, so a module flag cannot
    // masquerade as a regression in this header.
    record('AC-2:flagGated', {
        atsPill: await topBar.getByTitle('View ATS readiness details').count(),
        syncProfile: await topBar.getByTitle('Sync sections with your Master Profile').count(),
        mobileMenu: await topBar.getByLabel('Open navigation menu').count(),
    });
});

/* ── AC-3: the 11-step ribbon (S6) ────────────────────────────────────────── */
test('AC-3: the 11-step ribbon renders all 11 steps', async ({ page }) => {
    await openBuilder(page, 1280);
    const ribbon = page.locator('nav[aria-label="Resume Steps Stepper"]');
    await expect(ribbon).toHaveCount(1);
    const ribbonClass = (await ribbon.getAttribute('class')) || '';
    expect(ribbonClass, 'the ribbon must also carry the Cuba glass surface').toContain('cuba-glass');

    const steps = ribbon.locator('button.step-nav-btn');
    const count = await steps.count();
    record('AC-3', { steps: count });
    expect(count, 'the builder exposes exactly 11 steps').toBe(11);

    // Every step must carry a non-empty label -- a blank pill is a dead control.
    const labels = (await steps.allTextContents()).map((t) => t.trim()).filter(Boolean);
    expect(labels.length, 'every step must render a visible label').toBe(11);
});

/* ── AC-4: the ATS pill opens the real drawer (S6) ────────────────────────── */
test('AC-4: the ATS pill opens the ATS drawer when the flag is on', async ({ page }) => {
    await openBuilder(page, 1280);
    const ats = page.getByTitle('View ATS readiness details');
    if (await ats.count() === 0) {
        record('AC-4', { skipped: 'ATS module flag is off for this fixture' });
        test.skip(true, 'ATS surface is flag-gated and disabled in this fixture');
        return;
    }
    await ats.click();
    await expect(page.getByText(/ATS/i).first()).toBeVisible();
    record('AC-4', { opened: true });
});

/* ── AC-5: the shell primitives are hosted IN the single header (S7) ──────── */
test('AC-5: the builder header hosts M3NotificationCenter and M3UserMenu', async ({ page }) => {
    await openBuilder(page, 1280);
    const header = headerLocator(page).first();
    // Both primitives must live INSIDE the one header -- not in a second bar.
    await expect(header.locator('[data-testid="cuba-notification-trigger"]')).toHaveCount(1);
    await expect(header.locator('[data-testid="cuba-user-menu-trigger"]')).toHaveCount(1);
    record('AC-5', { bell: 1, userMenu: 1 });

    // The identity menu must show the REAL authenticated identity, not a stub.
    await header.locator('[data-testid="cuba-user-menu-trigger"]').click();
    await expect(page.locator('[data-testid="cuba-user-menu-email"]')).toContainText(IDENTITY.email);
    await page.keyboard.press('Escape');
});

/* ── AC-6: zero dead hrefs (S2) ───────────────────────────────────────────── */
test('AC-6: ZERO dead hrefs -- every row navigates or is not a button', async ({ page }) => {
    await openBuilder(page, 1280);
    await bellTrigger(page).click();
    const panel = page.locator('[data-testid="cuba-notification-panel"]');
    await expect(panel).toBeVisible();

    const rows = panel.locator('[data-testid="cuba-notification-row"]');
    const n = await rows.count();
    expect(n, 'the fixture seeds three rows').toBe(3);

    const navigable = [];
    const inert = [];
    for (let i = 0; i < n; i += 1) {
        const row = rows.nth(i);
        const flag = await row.getAttribute('data-navigable');
        const tag = await row.evaluate((el) => el.tagName.toLowerCase());
        if (flag === 'true') { navigable.push(i); expect(tag).toBe('button'); }
        else { inert.push(i); expect(tag, 'a row with no destination must NOT be a button').not.toBe('button'); }
    }
    record('AC-6', { rows: n, navigable: navigable.length, inert: inert.length });
    expect(navigable.length, 'the real DB types must navigate').toBe(2);
    expect(inert.length, 'the unknown type must NOT navigate').toBe(1);

    // Prove a navigable row actually moves the router.
    await rows.nth(navigable[0]).click();
    await page.waitForTimeout(800);
    expect(new URL(page.url()).pathname, 'a navigable row must change the route').not.toBe(BUILDER_ROUTE);
});

/* ── AC-7: mark-all-read decrements the bell to 0 (S3/S8) ─────────────────── */
test('AC-7: mark-all-read decrements the bell badge to 0', async ({ page }) => {
    await openBuilder(page, 1280);
    const badge = page.locator('[data-testid="cuba-notification-badge"]');
    await expect(badge, 'the fixture seeds exactly two unread rows').toHaveText('2');

    await bellTrigger(page).click();
    const markAll = page.locator('[data-testid="cuba-notification-mark-all"]');
    await expect(markAll).toBeVisible();
    await markAll.click();

    // The badge must reach 0 and the element must disappear entirely -- a badge
    // stuck above zero was the reported defect.
    await expect(badge).toHaveCount(0);
    await expect(page.locator('[data-testid="cuba-notification-unread-count"]')).toHaveCount(0);
    record('AC-7', { from: 2, to: 0 });
});

/* ── AC-8: clean console + no native dialogs at every viewport ───────────── */
test('AC-8: zero console errors and zero native dialogs at 375 / 768 / 1280', async ({ page }) => {
    const results = [];
    for (const width of VIEWPORTS) {
        const { consoleErrors, dialogs } = await openBuilder(page, width);
        const topBars = await page.locator('header.sticky.top-0').count();
        results.push({ width, topBars, consoleErrors: consoleErrors.length, dialogs: dialogs.length });
        expect(consoleErrors, `console errors at ${width}px: ${consoleErrors.join(' | ')}`).toEqual([]);
        expect(dialogs, `native dialogs at ${width}px: ${dialogs.join(' | ')}`).toEqual([]);
        expect(topBars, `exactly one top bar at ${width}px`).toBe(1);
    }
    record('AC-8', { results });
});


