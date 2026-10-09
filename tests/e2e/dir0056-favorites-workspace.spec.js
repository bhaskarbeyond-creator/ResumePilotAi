// @ts-check
/**
 * DIR-056 SUB-056-4 — Saved Favorites & Bookmarks (/dashboard/favorites)
 * Full-Page Cuba Workspace. Hermetic real-DOM verification.
 *
 * AC MAP — one named test per acceptance criterion:
 *   AC-1  The page is NOT blank: it renders a real workspace (the original
 *         defect was a completely blank white screen).
 *   AC-2  Rows come from the REAL API contract: documents from
 *         GET /api/favourites and jobs from GET /api/favourites?type=job, with
 *         the job title enriched from GET /api/jobs-data/:id (jobs are stored
 *         with an empty payload by the real backend).
 *   AC-3  The All / Documents / Jobs tabs actually filter the list.
 *   AC-4  Delete is optimistic AND persisted: the row leaves the DOM
 *         immediately and a DELETE /api/favourites/:id is issued; on a server
 *         failure the row is restored.
 *   AC-5  A zero-result read renders the real Cuba empty state (never a blank
 *         screen, never invented rows).
 *   AC-6  Zero console/page errors while rendering the workspace.
 *
 * HERMETIC BY CONSTRUCTION, mirroring playwright.dir048.config.js: `port: 0`
 * asks the OS for a free port, every /api/* call is served by the fixture
 * below, and `webServer` is deliberately absent so no second origin exists.
 */
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
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
const REPORT_PATH = path.join(EVIDENCE, 'dir056-favorites-results.json');

/** @type {import('vite').ViteDevServer} */
let vite;
let base = '';

const IDENTITY = {
    uid: 'dir056-user',
    email: 'jordan.vance@ime365.com',
    displayName: 'Jordan Vance',
    claims: { role: 'USER' },
};

const JOB = {
    id: 'job-101',
    title: 'Senior AI Engineer',
    company: 'Northwind AI Systems',
    location: 'Remote',
    salary: '$180,000',
};

/**
 * Favourites exactly as the REAL backend returns them. Jobs are stored with an
 * empty payload (`addToFavourites(uid, jobId, 'job', {})`), so their display
 * fields can only come from the enrichment call — which is what AC-2 proves.
 */
const DOCUMENT_ROWS = [
    { id: 'fav-r1', itemId: 'resume-1', itemType: 'resume', createdAt: '2026-10-05T09:00:00.000Z', firstName: 'Jordan', lastName: 'Vance', summary: 'Principal engineer leading applied AI delivery across platforms.' },
    { id: 'fav-c1', itemId: 'cover-1', itemType: 'cover', createdAt: '2026-10-04T09:00:00.000Z', title: 'Cover Letter — Northwind', summary: 'Tailored application for the platform engineering role.' },
];
const JOB_ROW = { id: 'fav-j1', itemId: JOB.id, itemType: 'job', createdAt: '2026-10-06T09:00:00.000Z' };

/** Report rows accumulated across tests, flushed in afterAll. */
const report = { directive: 'DIR-056', generatedAt: null, checks: [] };
function record(check, detail) {
    report.checks.push({ check, ...detail });
}

/**
 * Serves the real favourites contract. `favourites` is injectable so a test can
 * drive the zero-result state, and `failDelete` forces the rollback path.
 */
function installApiFixture(page, superAdminHandler, { favourites = [...DOCUMENT_ROWS, JOB_ROW], failDelete = false } = {}) {
    const json = (route, body, status = 200) => route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
    });
    const pagination = { totalItems: 0, totalPages: 1, currentPage: 1, hasNextPage: false, hasPreviousPage: false };

    return page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        const { pathname } = url;
        if (!pathname.startsWith('/api/')) return route.fallback();

        // DELETE /api/favourites/:itemId — owner-scoped removal.
        if (pathname.startsWith('/api/favourites/') && route.request().method() === 'DELETE') {
            if (failDelete) return json(route, { success: false, error: 'forced failure' }, 500);
            return json(route, { success: true, isFavourite: false });
        }
        // GET /api/favourites[?type=job]
        if (pathname === '/api/favourites') {
            const type = url.searchParams.get('type');
            const rows = type ? favourites.filter((row) => row.itemType === type) : favourites;
            return json(route, { success: true, favourites: rows });
        }
        if (pathname === `/api/jobs-data/${JOB.id}`) return json(route, { success: true, job: JOB });
        if (pathname === '/api/platform/public-config') {
            return json(route, {
                success: true,
                // main.jsx fails CLOSED unless the config is authoritative
                // (its source must match /^mariadb(?:$|-)/), so the fixture
                // must declare the real MariaDB authority or the app renders
                // the "Service temporarily unavailable" screen instead.
                _settingsSource: 'mariadb-authoritative',
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
                ai: { providers: true, available: true, degraded: false, configured: 1 },
            });
        }
        if (pathname === '/api/system-settings' || pathname === '/api/public/system-settings') {
            return json(route, { success: true, _settingsSource: 'mariadb-authoritative', modules: {} });
        }
        if (pathname.startsWith('/api/resumes')) return json(route, { success: true, resumes: [], allResumes: [], pagination });
        if (pathname.startsWith('/api/covers')) return json(route, { success: true, covers: [] });
        if (pathname.startsWith('/api/jobs-data')) return json(route, { success: true, jobs: [], pagination });
        if (pathname.startsWith('/api/users-data/')) {
            return json(route, { id: IDENTITY.uid, firstname: 'Jordan', lastname: 'Vance', role: 'USER' });
        }
        if (pathname === '/api/messages/conversations') return json(route, { conversations: [] });
        if (pathname.startsWith('/api/notifications-data')) return json(route, { success: true, notifications: [] });
        if (pathname.startsWith('/api/enterprise/')) return superAdminHandler(route);
        return json(route, { success: true });
    });
}

/** Boots an authenticated fixture session and lands on /dashboard/favorites. */
async function openFavourites(page, options = {}) {
    const adminState = seedSuperAdminState();
    const superAdminHandler = createSuperAdminFixtureBackend(adminState);

    await installAuthenticatedSession(page, IDENTITY);
    await installApiFixture(page, superAdminHandler, options);
    await page.addInitScript(() => {
        try {
            localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
            localStorage.setItem('resumepilot_privacy_consent_v1', JSON.stringify({ analytics: true, necessary: true, timestamp: Date.now() }));
            localStorage.setItem('theme', 'light');
        } catch (_) { /* storage-disabled browsers still render the shell */ }
    });
    await page.goto(`${base}/dashboard/favorites`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="dashboard-favourites"]', { timeout: 30_000 });
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


test('AC-1: /dashboard/favorites renders a real workspace, not a blank screen', async ({ page }) => {
    const consoleErrors = [];
    page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));

    await openFavourites(page);

    const workspace = page.locator('[data-testid="dashboard-favourites"]');
    await expect(workspace).toBeVisible();
    // A blank screen has no measurable content height; the workspace must have real content.
    const box = await workspace.boundingBox();
    expect(box?.height ?? 0, 'the workspace must occupy real vertical space').toBeGreaterThan(120);
    await expect(workspace.getByRole('heading', { level: 1 })).toContainText(/avourit/i);

    record('AC-1', { height: box?.height ?? 0, consoleErrors: consoleErrors.slice(0, 5) });
    expect(consoleErrors.slice(0, 5), 'the workspace must render without page errors').toEqual([]);
});

test('AC-2: rows come from the REAL API, with the job title enriched from jobs-data', async ({ page }) => {
    await openFavourites(page);

    const list = page.locator('[data-testid="favourites-list"]');
    await expect(list.locator('[data-testid="favourite-row"]')).toHaveCount(3);
    // Documents (real payload fields).
    await expect(list).toContainText('Jordan Vance');
    await expect(list).toContainText('Cover Letter — Northwind');
    // The job was stored with an EMPTY payload, so its title can only come from
    // the GET /api/jobs-data/:id enrichment — this proves that path is live.
    await expect(list).toContainText('Senior AI Engineer');
    await expect(list).toContainText('Northwind AI Systems');

    record('AC-2', { rows: 3, enrichedJob: 'Senior AI Engineer' });
});

test('AC-3: the All / Documents / Jobs tabs actually filter the list', async ({ page }) => {
    await openFavourites(page);
    const rows = page.locator('[data-testid="favourite-row"]');

    await expect(rows).toHaveCount(3);
    await page.getByRole('tab', { name: /^Jobs/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(page.locator('[data-testid="favourites-list"]')).toContainText('Senior AI Engineer');

    await page.getByRole('tab', { name: /^Documents/ }).click();
    await expect(rows).toHaveCount(2);
    await expect(page.locator('[data-testid="favourites-list"]')).not.toContainText('Senior AI Engineer');

    await page.getByRole('tab', { name: /^All/ }).click();
    await expect(rows).toHaveCount(3);

    record('AC-3', { all: 3, jobs: 1, documents: 2 });
});

test('AC-4a: delete is optimistic AND persisted (a real DELETE is issued)', async ({ page }) => {
    const deletes = [];
    page.on('request', (request) => {
        if (request.method() === 'DELETE' && request.url().includes('/api/favourites/')) deletes.push(request.url());
    });
    await openFavourites(page);
    await expect(page.locator('[data-testid="favourite-row"]')).toHaveCount(3);

    await page.getByRole('button', { name: /^Remove Senior AI Engineer/ }).click();

    // The row leaves the DOM without waiting for the network...
    await expect(page.locator('[data-testid="favourite-row"]')).toHaveCount(2);
    // ...and the removal is really persisted to the owner-scoped endpoint.
    expect(deletes.length).toBe(1);
    expect(deletes[0]).toContain(`/api/favourites/${JOB.id}`);

    record('AC-4a', { deletes });
});

test('AC-4b: a rejected removal restores the row (no silent data loss)', async ({ page }) => {
    await openFavourites(page, { failDelete: true });
    await expect(page.locator('[data-testid="favourite-row"]')).toHaveCount(3);

    await page.getByRole('button', { name: /^Remove Senior AI Engineer/ }).click();

    // Optimistic drop first, then rollback once the server refuses.
    await expect(page.locator('[data-testid="favourite-row"]')).toHaveCount(2, { timeout: 5_000 });
    await expect(page.locator('[data-testid="favourite-row"]')).toHaveCount(3, { timeout: 15_000 });

    record('AC-4b', { rolledBack: true });
});

test('AC-5: a zero-result read renders the real empty state (never a blank screen)', async ({ page }) => {
    await openFavourites(page, { favourites: [] });

    const workspace = page.locator('[data-testid="dashboard-favourites"]');
    await expect(workspace).toBeVisible();
    await expect(workspace).toContainText('Nothing saved yet');
    await expect(page.locator('[data-testid="favourite-row"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Browse jobs' })).toBeVisible();

    record('AC-5', { emptyState: 'Nothing saved yet' });
});

test('AC-6: zero console errors and no placeholder text in the DOM', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error?.message || error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

    await openFavourites(page);
    await expect(page.locator('[data-testid="favourite-row"]')).toHaveCount(3);

    const text = await page.locator('[data-testid="dashboard-favourites"]').innerText();
    for (const leak of ['Invalid Date', 'NaN', 'undefined']) {
        expect(text, `the workspace DOM must not leak "${leak}"`).not.toContain(leak);
    }

    record('AC-6', { consoleErrors: errors.slice(0, 8) });
    expect(errors.slice(0, 8), 'the workspace must render without console/page errors').toEqual([]);
});
