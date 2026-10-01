// @ts-check
/**
 * IME365 four-portal architecture — real-browser E2E verification.
 *
 * Boots the actual Vite app with an authenticated session and a stateful API
 * fixture that mirrors the authoritative response shapes of the employer,
 * enterprise, and identity endpoints.
 *
 * Verifies, in a real browser:
 *   - every canonical portal mounts
 *   - every legacy URL performs its one-way redirect, with query preserved and
 *     no loop across a reload
 *   - deep links and refresh
 *   - candidate navigation carries no recruiter capability
 *   - the first-time recruiter onboarding experience
 *   - the context switcher only offers server-authorized portals
 *   - no unexpected console errors
 *
 * Run: npx playwright test tests/four-portal-e2e.spec.js
 */
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import {
    installAuthenticatedSession,
    seedEnterpriseState,
    viteFixtureDefines,
} from './helpers/enterprise-fixture.mjs';
import { installApiFixture, watchForDefects, isUnexpectedJsError } from './four-portal-fixture.mjs';

test.describe.configure({ mode: 'serial' });

/** @type {import('vite').ViteDevServer} */
let vite;
let base = '';

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

/** An approved recruiter with one company, one role, and two applicants. */
function recruiterState() {
    const state = seedEnterpriseState();
    state.jobs = [{
        id: 'job-alpha',
        title: 'Senior Platform Engineer',
        company: 'Northwind Systems',
        companyName: 'Northwind Systems',
        location: 'Remote',
        status: 'active',
        jobType: 'Full-time',
        workMode: 'Remote',
        description: 'Own the platform roadmap.',
        createdAt: '2026-01-15T09:00:00.000Z',
        applicationCount: 2,
    }];
    state.companies = [{
        id: 'company-alpha',
        name: 'Northwind Systems',
        industry: 'Technology',
        location: 'Remote',
        website: 'https://example.com',
        description: 'Platform tooling for modern teams.',
        verificationStatus: 'verified',
        revision: 1,
    }];
    state.applications = {
        'job-alpha': [
            { id: 'app-1', applicantName: 'Dana Fields', applicantEmail: 'dana@example.com', status: 'shortlisted', appliedAt: '2026-01-20T10:00:00.000Z' },
            { id: 'app-2', applicantName: 'Sam Ortiz', applicantEmail: 'sam@example.com', status: 'pending', appliedAt: '2026-01-21T10:00:00.000Z' },
        ],
    };
    return state;
}

/** A brand-new recruiter: no jobs and no company profile. */
function emptyRecruiterState() {
    const state = seedEnterpriseState();
    state.jobs = [];
    state.companies = [];
    state.applications = {};
    return state;
}

/** A platform-operator session: the admin console must become reachable. */
function adminState() {
    const state = recruiterState();
    state.isAdmin = true;
    return state;
}

/**
 * Mints an ID token whose role claim matches the fixture state, because
 * checkIfAdmin and the admin shell both authorize from token claims.
 */
async function bootPage(page, state) {
    const defects = watchForDefects(page);
    await installAuthenticatedSession(page, {
        claims: state.isAdmin ? { role: 'SUPER_ADMIN', superAdmin: true } : { role: 'USER' },
    });
    await installApiFixture(page, state);
    return defects;
}


test.describe('canonical portals', () => {
    test('candidate dashboard mounts at /dashboard', async ({ page }) => {
        const { pageErrors } = await bootPage(page, recruiterState());
        await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(/\/dashboard$/);
        // Assert on real navigation copy, not internal wrapper classes.
        await expect(page.getByText('Main Workspace')).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('Career Suite')).toBeVisible();
        expect(isUnexpectedJsError(pageErrors)).toEqual([]);
    });

    test('employer portal mounts with the recruiter taxonomy', async ({ page }) => {
        const { pageErrors } = await bootPage(page, recruiterState());
        await page.goto(`${base}/employer`, { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(/\/employer$/);
        await expect(page.getByTestId('employer-portal-shell')).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('heading', { name: 'Recruiter Overview' }).first()).toBeVisible({ timeout: 30_000 });

        const nav = page.getByRole('navigation', { name: /employer navigation/i });
        for (const label of ['Recruiter Overview', 'Job Postings', 'Applicant ATS Pipeline', 'Candidate Messages', 'Company Profile', 'Hiring Preferences']) {
            await expect(nav.getByText(label)).toBeVisible();
        }
        // Recruiter portal must not carry candidate-only or admin capability.
        await expect(nav.getByText('Cover Letters')).toHaveCount(0);
        await expect(nav.getByText('My Posted Jobs')).toHaveCount(0);
        await expect(nav.getByText('My Companies')).toHaveCount(0);
        expect(isUnexpectedJsError(pageErrors)).toEqual([]);
    });

    test('employer overview reports real metrics from the employer records', async ({ page }) => {
        await bootPage(page, recruiterState());
        await page.goto(`${base}/employer`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: 'Recruiter Overview' }).first()).toBeVisible({ timeout: 30_000 });
        await expect(page.getByLabel('Hiring metrics')).toBeVisible();
        // The seeded requisition must appear, proving the screen reads the API.
        await expect(page.getByText('Senior Platform Engineer').first()).toBeVisible({ timeout: 15_000 });
    });

    test('every employer sub-route deep-links and renders', async ({ page }) => {
        for (const [path, heading] of [
            ['/employer/jobs', 'Job Postings'],
            ['/employer/applicants', 'Applicant ATS Pipeline'],
            ['/employer/company', 'Company Profile'],
            ['/employer/messages', 'Candidate Messages'],
            ['/employer/settings', 'Hiring Preferences'],
        ]) {
            await bootPage(page, recruiterState());
            await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
            await expect(page).toHaveURL(new RegExp(`${path}$`));
            await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 30_000 });
        }
    });

    test('applicant pipeline lists real applicants from the per-job endpoint', async ({ page }) => {
        await bootPage(page, recruiterState());
        await page.goto(`${base}/employer/applicants`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: 'Applicant ATS Pipeline' }).first()).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('Dana Fields')).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText('Sam Ortiz')).toBeVisible();
    });
});


test.describe('first-time recruiter onboarding', () => {
    test('a recruiter with no jobs and no company sees onboarding, not a 404', async ({ page }) => {
        const { pageErrors } = await bootPage(page, emptyRecruiterState());
        await page.goto(`${base}/employer`, { waitUntil: 'domcontentloaded' });

        await expect(page.getByRole('heading', { name: 'Welcome to IME365 Hiring' }))
            .toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('Page not found')).toHaveCount(0);
        expect(isUnexpectedJsError(pageErrors)).toEqual([]);
    });

    test('the onboarding CTA opens the existing company registration modal', async ({ page }) => {
        await bootPage(page, emptyRecruiterState());
        await page.goto(`${base}/employer`, { waitUntil: 'domcontentloaded' });

        const cta = page.getByRole('button', { name: /Register Company Profile/i });
        await expect(cta).toBeVisible({ timeout: 30_000 });
        await cta.click();

        // The modal must open inside the viewport and be dismissible.
        const dialog = page.getByRole('dialog').first();
        await expect(dialog).toBeVisible({ timeout: 10_000 });
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);

        // The page must remain usable after closing.
        await expect(page.getByRole('heading', { name: 'Welcome to IME365 Hiring' })).toBeVisible();
    });

    test('job postings renders an intentional empty state for a new recruiter', async ({ page }) => {
        await bootPage(page, emptyRecruiterState());
        await page.goto(`${base}/employer/jobs`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: 'Job Postings' }).first()).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('Page not found')).toHaveCount(0);
    });
});

test.describe('legacy URL redirects', () => {
    /**
     * Redirects that must resolve for any authenticated session.
     * [legacy path, expected canonical path]
     */
    const SESSION_AGNOSTIC = [
        ['/dashboard2', '/dashboard'],
        ['/dashboard2/settings', '/dashboard/settings'],
        ['/enterprise', '/org'],
        ['/dashboard/my-employments', '/employer/jobs'],
        ['/dashboard/my-companies', '/employer/company'],
    ];

    for (const [legacy, canonical] of SESSION_AGNOSTIC) {
        test(`${legacy} redirects to ${canonical} without a loop`, async ({ page }) => {
            await bootPage(page, recruiterState());
            await page.goto(`${base}${legacy}`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1500);

            const landed = new URL(page.url()).pathname;
            expect(landed, `${legacy} must land on ${canonical}, landed on ${landed}`).toBe(canonical);

            // No redirect loop: the canonical URL is stable across a reload.
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1200);
            expect(new URL(page.url()).pathname).toBe(canonical);
        });
    }

    test('an admin session is redirected from /adm and /platform to /admin', async ({ page }) => {
        for (const [legacy, canonical] of [
            ['/adm', '/admin/dashboard'],
            ['/adm/users', '/admin/users'],
            ['/platform/users', '/admin/users'],
            ['/platform/queues', '/admin/queues'],
        ]) {
            await bootPage(page, adminState());
            await page.goto(`${base}${legacy}`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);

            const landed = new URL(page.url()).pathname;
            expect(landed, `${legacy} must land on ${canonical}, landed on ${landed}`).toBe(canonical);

            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1500);
            expect(new URL(page.url()).pathname).toBe(canonical);
        }
    });

    test('a non-admin session cannot reach the console through a legacy alias', async ({ page }) => {
        // The alias redirect is not an authorization bypass: RBAC still applies
        // after the redirect lands on the canonical console route.
        for (const legacy of ['/adm', '/adm/users', '/platform/users']) {
            await bootPage(page, recruiterState());
            await page.goto(`${base}${legacy}`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);

            const landed = new URL(page.url()).pathname;
            expect(landed, `${legacy} must not expose the admin console`).not.toMatch(/^\/admin(\/|$)/);
            expect(landed).toBe('/dashboard');
        }
    });

    test('legacy redirects preserve the query string', async ({ page }) => {
        await bootPage(page, adminState());
        await page.goto(`${base}/adm/users?tab=roles&q=audit`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        const url = new URL(page.url());
        expect(url.pathname).toBe('/admin/users');
        expect(url.searchParams.get('tab')).toBe('roles');
        expect(url.searchParams.get('q')).toBe('audit');
    });
});


test.describe('candidate navigation integrity', () => {
    test('candidate sidebar exposes no recruiter capability', async ({ page }) => {
        const { pageErrors } = await bootPage(page, recruiterState());
        await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByText('Main Workspace')).toBeVisible({ timeout: 30_000 });

        await expect(page.getByText('My Posted Jobs')).toHaveCount(0);
        await expect(page.getByText('My Companies')).toHaveCount(0);

        // The resume entry must reach the builder, not a duplicate Overview.
        await expect(page.locator('a[href="/build-resume"]').first()).toBeVisible({ timeout: 15_000 });
        expect(isUnexpectedJsError(pageErrors)).toEqual([]);
    });
});

test.describe('context switcher', () => {
    test('offers only server-authorized portals and switches between them', async ({ page }) => {
        const { pageErrors } = await bootPage(page, recruiterState());
        await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByText('Main Workspace')).toBeVisible({ timeout: 30_000 });

        const trigger = page.getByTestId('context-switcher-trigger').first();
        await expect(trigger).toBeVisible({ timeout: 20_000 });
        await trigger.click();

        const menu = page.getByTestId('context-switcher-menu').first();
        await expect(menu).toBeVisible();
        await expect(menu.getByText('Candidate Dashboard')).toBeVisible();
        await expect(menu.getByText('Recruiter & Hiring Portal')).toBeVisible();

        // This session is not a platform administrator, so /admin must not be
        // offered: stored or token-derived state never overrides the server.
        await expect(menu.getByText('Platform Admin Console')).toHaveCount(0);

        await menu.getByText('Recruiter & Hiring Portal').click();
        await expect(page).toHaveURL(/\/employer/, { timeout: 20_000 });
        expect(isUnexpectedJsError(pageErrors)).toEqual([]);
    });

    test('Escape closes the menu without navigating', async ({ page }) => {
        await bootPage(page, recruiterState());
        await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByText('Main Workspace')).toBeVisible({ timeout: 30_000 });

        const before = page.url();
        const trigger = page.getByTestId('context-switcher-trigger').first();
        await expect(trigger).toBeVisible({ timeout: 20_000 });
        await trigger.click();
        await expect(page.getByTestId('context-switcher-menu').first()).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('context-switcher-menu')).toHaveCount(0);
        expect(page.url()).toBe(before);
    });

    test('a stale stored portal never overrides server authorization', async ({ page }) => {
        await bootPage(page, recruiterState());
        await page.addInitScript(() => {
            // Simulate a leftover value from a previously privileged session.
            localStorage.setItem('ime365_active_portal', 'admin');
        });
        await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByText('Main Workspace')).toBeVisible({ timeout: 30_000 });

        const trigger = page.getByTestId('context-switcher-trigger').first();
        await expect(trigger).toBeVisible({ timeout: 20_000 });
        await trigger.click();
        await expect(
            page.getByTestId('context-switcher-menu').first().getByText('Platform Admin Console'),
        ).toHaveCount(0);
    });
});
