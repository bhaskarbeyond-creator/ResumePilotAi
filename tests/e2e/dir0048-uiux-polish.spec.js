// @ts-check
/**
 * DIR-048 -- Universal Platform UI/UX Polish, Google M3 Layouts & Native
 * Mobile/Tablet App UX. Hermetic real-DOM verification of S4-S10.
 *
 * AC MAP -- one named test per acceptance criterion:
 *   AC-1  Zero native browser dialogs across the four portals (S6) with a live
 *         dialog trap armed for every navigation.
 *   AC-2  No "Invalid Date", "NaN" or "undefined" string reaches the rendered
 *         DOM of any portal (S7).
 *   AC-3  The AI Engine beacon resolves to "AI Engine Ready" against the REAL
 *         availability contract carrying `ai.providers` (S4).
 *   AC-4  axe-core WCAG 2.1 AA on the candidate shell in light AND dark.
 *   AC-5  Uniform responsive gutters at five breakpoints, with zero horizontal
 *         overflow (S9).
 *   AC-10 The 375px mobile shell is a native app: bottom tab bar from the real
 *         navigation model, >=44px targets, More opens the drawer, bar absent
 *         at desktop (S10).
 *   AC-11 The 768-1024px tablet shell renders the compact icon rail; the lg+
 *         sidebar returns at 1280 (S10).
 *   AC-4b The notification popover renders on the executive glass surface with
 *         a real activity row (Cluster 1).
 *
 * HERMETIC BY CONSTRUCTION, mirroring playwright.dir047.config.js: `port: 0`
 * asks the OS for a free port, every /api/* call is served by the fixture
 * below, and `webServer` is deliberately absent so no second origin exists.
 */
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import {
    installAuthenticatedSession,
    viteFixtureDefines,
} from '../helpers/enterprise-fixture.mjs';
import {
    createSuperAdminFixtureBackend,
    seedSuperAdminState,
} from '../helpers/superadmin-fixture.mjs';

const ROOT = process.cwd();
const EVIDENCE = path.join(ROOT, '.bridge', 'evidence');
const REPORT_PATH = path.join(EVIDENCE, 'dir048-uiux-results.json');
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BREAKPOINTS = [375, 768, 1024, 1280, 1920];

/** @type {import('vite').ViteDevServer} */
let vite;
let base = '';

const PORTALS = [
    { name: 'candidate dashboard', path: '/dashboard' },
    { name: 'recruiter portal', path: '/employer' },
    { name: 'enterprise console', path: '/org/northwind' },
    { name: 'platform admin', path: '/admin/dashboard' },
];

const IDENTITY = {
    uid: 'dir048-user',
    email: 'jordan.vance@ime365.com',
    displayName: 'Jordan Vance',
    claims: { role: 'SUPER_ADMIN', superAdmin: true, admin: true, permissions: ['*'] },
};

/** Report rows accumulated across tests, flushed in afterAll. */
const report = { directive: 'DIR-048', generatedAt: null, checks: [] };
function record(check, detail) {
    report.checks.push({ check, ...detail });
}

/**
 * Serves the same contract shapes the dir047 suite serves, extended with the
 * DIR-048 contract: the availability payload now carries the boolean-only `ai`
 * block, and the notification feed carries a realistic row (sender + preview)
 * rather than a generic literal.
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
                // DIR-048 S4 contract: booleans + one integer count, nothing else.
                ai: { providers: true, available: true, degraded: false, configured: 1 },
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
                id: IDENTITY.uid, firstname: 'Jordan', lastname: 'Vance',
                role: 'SUPER_ADMIN', isEmployer: true, employerApproved: true,
            });
        }
        if (pathname === '/api/check-if-admin' || pathname.endsWith('/check-admin')) {
            return json(route, { isAdmin: true, success: true });
        }
        if (pathname.includes('/applications')) return json(route, { applications: [] });
        if (pathname.includes('/favourites')) return json(route, { favourites: [], jobs: [] });
        if (pathname === '/api/messages/conversations') return json(route, { conversations: [] });
        if (pathname.startsWith('/api/notifications-data')) {
            return json(route, {
                notifications: [{
                    id: 'dir048-notif-1',
                    type: 'message',
                    title: 'New message from Ava Chen',
                    message: 'Thanks for the update — can we review the offer on Thursday?',
                    read: false,
                    createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
                }],
                unreadCount: 1,
            });
        }
        if (pathname === '/api/platform/role-view-audit') return json(route, { success: true });
        if (pathname.startsWith('/api/enterprise/')) return superAdminHandler(route);
        return json(route, { success: true });
    });
}

async function primeShell(page, theme = 'light') {
    await page.addInitScript((mode) => {
        try {
            localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
            localStorage.setItem('resumepilot_privacy_consent_v1', JSON.stringify({
                analytics: true, necessary: true, timestamp: Date.now(),
            }));
            localStorage.setItem('theme', mode);
        } catch (_) { /* storage-disabled browsers still render the shell */ }
    }, theme);
}

/** Boots an authenticated fixture session and lands on `routePath`. */
async function openPortal(page, routePath, { theme = 'light' } = {}) {
    const adminState = seedSuperAdminState();
    adminState.status = 'HEALTHY';
    adminState.healthScore = 98;
    const superAdminHandler = createSuperAdminFixtureBackend(adminState);

    await installAuthenticatedSession(page, IDENTITY);
    await installApiFixture(page, superAdminHandler);
    await primeShell(page, theme);
    await page.goto(`${base}${routePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#cuba-main-content', { timeout: 30_000 });
    return superAdminHandler;
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


test('AC-1: the four portals render inside the Cuba shell with ZERO native dialogs', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', async (dialog) => { dialogs.push(`${dialog.type()}: ${dialog.message()}`); await dialog.dismiss(); });
    const consoleErrors = [];
    page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

    const visited = [];
    for (const portal of PORTALS) {
        await openPortal(page, portal.path);
        await expect(page.locator('#cuba-main-content')).toBeVisible();
        visited.push(portal.path);
    }
    record('AC-1', { visited, dialogs, consoleErrors: consoleErrors.slice(0, 8) });
    expect(dialogs, 'native browser dialogs must never fire').toEqual([]);
    expect(consoleErrors.slice(0, 8), 'portals must render without console/page errors').toEqual([]);
});

test('AC-3: the AI beacon resolves Ready from the live availability contract', async ({ page }) => {
    await openPortal(page, '/dashboard');
    const beacon = page.locator('[data-testid="ai-engine-status"]');
    await expect(beacon).toHaveAttribute('data-ai-status', 'ready');
    await expect(beacon).toContainText('AI Engine Ready');
    await expect(beacon).not.toContainText('Status Unknown');
    record('AC-3', { label: (await beacon.innerText()).trim() });
});

test('AC-2: no Invalid Date / NaN / undefined string reaches any portal DOM', async ({ page }) => {
    const leaks = [];
    for (const portal of PORTALS) {
        await openPortal(page, portal.path);
        const text = await page.evaluate(() => document.body.innerText);
        for (const pattern of [/Invalid Date/i, /\bNaN\b/, /\bundefined\b/]) {
            const match = text.match(pattern);
            if (match) leaks.push(`${portal.path} -> "${match[0]}"`);
        }
    }
    record('AC-2', { leaks });
    expect(leaks, 'the negative-string census must stay empty').toEqual([]);
});

test('AC-5: uniform gutters and zero horizontal overflow at five breakpoints', async ({ page }) => {
    const measurements = [];
    for (const width of BREAKPOINTS) {
        await page.setViewportSize({ width, height: 900 });
        await openPortal(page, '/employer');
        const metrics = await page.evaluate(() => {
            // Symmetry is measured against the MAIN COLUMN, not the viewport:
            // at md+ the navigation rail legitimately offsets the column, and a
            // viewport-relative check would misread a correct layout as skew.
            const main = document.querySelector('#cuba-main-content');
            const container = main.querySelector(':scope > div');
            const mainRect = main.getBoundingClientRect();
            const rect = container.getBoundingClientRect();
            return {
                left: Math.round(rect.left - mainRect.left),
                right: Math.round(mainRect.right - rect.right),
                width: Math.round(rect.width),
                mainWidth: Math.round(mainRect.width),
                scrollWidth: document.documentElement.scrollWidth,
                innerWidth: window.innerWidth,
            };
        });
        measurements.push({ width, ...metrics });
        expect(Math.abs(metrics.left - metrics.right), `gutter symmetry at ${width}px`).toBeLessThanOrEqual(1);
        expect(metrics.width, `content cap at ${width}px`).toBeLessThanOrEqual(1280);
        expect(metrics.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(metrics.innerWidth + 1);
    }
    record('AC-5', { measurements });
});


test('AC-10: the 375px mobile shell is a native app with a real bottom tab bar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openPortal(page, '/dashboard');
    const bar = page.locator('[data-testid="cuba-bottom-nav"]');
    await expect(bar).toBeVisible();
    const links = bar.locator('a[href^="/"]');
    const count = await links.count();
    expect(count, 'the tab bar must carry real navigation destinations').toBeGreaterThanOrEqual(2);
    const heights = [];
    for (let index = 0; index < count; index += 1) {
        const box = await links.nth(index).boundingBox();
        heights.push(Math.round(box?.height || 0));
    }
    expect(Math.min(...heights), 'every tab target must clear 44px').toBeGreaterThanOrEqual(44);

    const more = bar.locator('button[aria-label="More navigation options"]');
    await expect(more).toBeVisible();
    await more.click();
    await expect(page.locator('[data-testid="cuba-mobile-drawer"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="cuba-mobile-drawer"]')).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(bar).toBeHidden();
    record('AC-10', { tabs: count, tabHeights: heights });
});

test('AC-11: the tablet band renders the compact rail; the full sidebar returns at 1280', async ({ page }) => {
    const aside = page.locator('aside[data-testid="cuba-sidebar"]');
    const hamburger = page.locator('button[aria-label="Open navigation"]');
    const samples = [];
    for (const width of [768, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        await openPortal(page, '/dashboard');
        await expect(aside).toBeVisible();
        const box = await aside.boundingBox();
        samples.push({ width, asideWidth: Math.round(box?.width || 0) });
        expect(box?.width || 0, `compact rail at ${width}px`).toBeLessThanOrEqual(96);
        await expect(hamburger).toBeHidden();
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPortal(page, '/dashboard');
    const wide = await aside.boundingBox();
    expect(wide?.width || 0, 'desktop sidebar width').toBeGreaterThanOrEqual(240);
    record('AC-11', { samples, desktopAsideWidth: Math.round(wide?.width || 0) });
});

test('AC-4b: the notification popover is an executive glass surface with a real activity row', async ({ page }) => {
    await openPortal(page, '/dashboard');
    await page.locator('[data-testid="cuba-notification-trigger"]').click();
    const panel = page.locator('[data-testid="cuba-notification-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('New message from Ava Chen');
    const glass = await panel.evaluate((node) => {
        const styles = getComputedStyle(node);
        return {
            backdrop: styles.backdropFilter || styles.webkitBackdropFilter || '',
            shadow: styles.boxShadow,
            radius: styles.borderRadius,
        };
    });
    expect(glass.backdrop, 'executive glass blur must be applied').toMatch(/blur/);
    expect(glass.shadow, 'an elevated Cuba shadow must be present').not.toBe('none');
    record('AC-4b', glass);
});

test('AC-4: axe-core WCAG 2.1 AA on the candidate shell in light AND dark', async ({ page }) => {
    const results = [];
    for (const theme of ['light', 'dark']) {
        await openPortal(page, '/dashboard', { theme });
        await page.waitForTimeout(250);
        const analysis = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        const blocking = analysis.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious');
        results.push({
            theme,
            violations: analysis.violations.length,
            blocking: blocking.map((item) => ({
                id: item.id,
                impact: item.impact,
                nodes: item.nodes.length,
                sample: item.nodes.slice(0, 2).map((node) => node.target.join(' ')),
            })),
        });
    }
    record('AC-4', { results });
    expect(results.filter((row) => row.blocking.length), 'no critical/serious WCAG violations in either theme').toEqual([]);
});

