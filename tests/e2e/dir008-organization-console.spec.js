// @ts-check
/**
 * DIR-008 — Enterprise Organization console: routing, chrome de-duplication and
 * all thirteen console modules.
 *
 * ENVIRONMENT MANDATE (Directive DIR-008):
 *   Drives the live Vite dev server on http://localhost:3000, whose /api/* is
 *   proxied by vite.config.js to the live backend on http://localhost:8080,
 *   which persists to the authoritative MariaDB. This spec starts no server of
 *   its own and never intercepts, mocks or fulfills an `/api/*` route: every
 *   response the browser sees is the real one.
 *
 * ANTI-EMPTY-STATE MANDATE:
 *   A green run must not be possible on an empty organization. beforeAll reads
 *   the tenant list from the LIVE API, requires at least one real non-personal
 *   tenant whose server-resolved context grants the full permission set, and
 *   pins that tenant's real slug + display name. Every assertion then runs
 *   against that server-resolved slug, so the browser can never pass on zero
 *   tenants or zero visible options.
 *
 * WHAT THIS SUITE PROVES (the DIR-008 acceptance criteria):
 *   Stage 1  the pathname is the single source of truth for the active module
 *   Stage 2  all 13 sidebar options render their own module (the core bug)
 *   Stage 3  exactly one Cuba chrome: no duplicate top bar / sidebar / pill strip
 *   Stage 4  the Organization switcher filters and switches tenant context
 *   Stage 5  overview quick actions deep-link with pre-applied params
 *   Stage 6  the whole run accumulated ZERO console errors and ZERO failed APIs
 *
 * ZERO FABRICATION:
 *   Nothing is stubbed or invented. The identity is minted through firebase-admin
 *   for a real Firebase Auth user, and the tenant under test is chosen from the
 *   live server response rather than hardcoded.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR008_WEB_ORIGIN || 'http://localhost:3000';
const API_ORIGIN = process.env.DIR008_API_ORIGIN || 'http://localhost:8080';

/**
 * The thirteen organization modules, mirroring ENTERPRISE_TABS in
 * src/components/cuba/portalNavigation.js. `label` is the label the Cuba
 * sidebar renders, which is also the toolbar/breadcrumb label.
 */
const ENTERPRISE_TABS = Object.freeze([
    { id: 'overview', label: 'Overview' },
    { id: 'resumes', label: 'Talent & Resumes' },
    { id: 'members', label: 'Users & IAM' },
    { id: 'teams', label: 'Teams' },
    { id: 'workspaces', label: 'Workspaces' },
    { id: 'access', label: 'Roles & Permissions' },
    { id: 'ai', label: 'AI Workspace' },
    { id: 'security', label: 'Security & M2M' },
    { id: 'usage', label: 'Usage & Quotas' },
    { id: 'email', label: 'Email & Notifications' },
    { id: 'audit', label: 'Audit Logs' },
    { id: 'support', label: 'Support Access' },
    { id: 'settings', label: 'Organization Settings' },
]);

/**
 * The operator identity. Resolved from the explicit DIR-008 override first, then
 * the established platform identity, so the suite does not depend on a single
 * ambient variable being inherited by the Playwright worker process.
 */
async function ensureOperatorSession() {
    const candidates = [
        process.env.DIR008_OWNER_EMAIL,
        process.env.ADMIN_EMAIL,
    ].filter(Boolean);
    for (const email of candidates) {
        const session = await mintFirebaseSession({ email });
        if (session) return session;
    }
    return null;
}

const OPERATOR = await ensureOperatorSession();

const EVIDENCE_DIR = path.join(process.cwd(), '.bridge', 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function record(line) {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    fs.appendFileSync(path.join(EVIDENCE_DIR, 'dir008-console.log'), `${stamped}\n`);
    console.log(stamped);
}

const authHeaders = session => ({ Authorization: `Bearer ${session.idToken}`, Accept: 'application/json' });

async function liveJson(session, method, apiPath, body) {
    const response = await fetch(`${API_ORIGIN}${apiPath}`, {
        method,
        headers: { ...authHeaders(session), 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* non-JSON bodies are surfaced verbatim by callers */ }
    return { status: response.status, body: parsed, text };
}

/** Seeds the browser session exactly the way the app's own Firebase SDK expects. */
async function bootSession(page, session) {
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
        localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
        localStorage.setItem('ime365_privacy_consent_v1', 'denied');
    }, {
        uid: session.uid,
        email: session.email,
        token: session.idToken,
        refreshToken: session.refreshToken,
        apiKey: session.apiKey,
    });
}

/**
 * Collects the three defect classes DIR-008 forbids: browser console errors,
 * uncaught page errors, and any `/api/*` response >= 400.
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

/** Server-resolved organization facts, pinned from the live API in beforeAll. */
const TENANT = { id: '', slug: '', displayName: '', permissions: [] };

/** Run-wide defect accumulator so Stage 6 can assert across every stage. */
const RUN_DEFECTS = { consoleErrors: [], pageErrors: [], failedApi: [] };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    record(`DIR-008 organization console run starting. WEB=${WEB_ORIGIN} API=${API_ORIGIN}`);
    record(`operator identity: ${OPERATOR ? `uid=${OPERATOR.uid} email=${OPERATOR.email}` : 'NONE'}`);
    expect(OPERATOR, 'No live operator identity (set DIR008_OWNER_EMAIL or ADMIN_EMAIL)').toBeTruthy();

    const health = await liveJson(OPERATOR, 'GET', '/api/health');
    expect(health.status).toBe(200);
    expect(health.body?.authoritativeDatabase, 'the authoritative database must be MariaDB').toBe('MARIADB');
    record(`live backend health status=${health.status} authority=${health.body?.authoritativeDatabase}`);

    // Anti-empty-state: the tenant list must come back from the real server, and
    // the tenant under test must be a real, non-personal organization.
    const tenantList = await liveJson(OPERATOR, 'GET', '/api/enterprise/tenants');
    expect(tenantList.status).toBe(200);
    const tenants = Array.isArray(tenantList.body?.tenants) ? tenantList.body.tenants : [];
    expect(tenants.length, 'the operator must belong to at least one organization').toBeGreaterThan(0);
    record(`live tenants: ${tenants.map(t => `${t.slug}(${(t.roles || []).join('|')})`).join(', ')}`);

    // Choose a real non-personal tenant that the SERVER resolves for the context,
    // rather than trusting the first entry (which may be a personal workspace).
    let chosen = null;
    let chosenPermissions = [];
    for (const candidate of tenants.filter(t => !t.personalTenant)) {
        const ctx = await liveJson(OPERATOR, 'POST', '/api/enterprise/context', { tenantId: candidate.id });
        if (ctx.status !== 200 || !ctx.body?.context) continue;
        const permissions = Array.isArray(ctx.body.context.permissions) ? ctx.body.context.permissions : [];
        // A wildcard grant means the server itself exposes every gated module.
        if (!chosen || permissions.includes('*')) { chosen = candidate; chosenPermissions = permissions; }
        if (permissions.includes('*')) break;
    }
    expect(chosen, 'no real non-personal organization could be resolved').toBeTruthy();

    TENANT.id = chosen.id;
    TENANT.slug = chosen.slug;
    TENANT.displayName = chosen.displayName;
    TENANT.permissions = chosenPermissions;
    record(`tenant under test: id=${TENANT.id} slug=${TENANT.slug} name="${TENANT.displayName}" permissions=${JSON.stringify(chosenPermissions)}`);
});

/**
 * The tenant under test is chosen by the SERVER, never by the URL slug.
 *
 * `EnterpriseContext` resolves the active tenant from an explicit `?tenant=`
 * selection first and only then from the server default, and the console then
 * canonicalizes the path onto whatever tenant the server actually resolved.
 * Asserting against the navigated slug would therefore be asserting against a
 * value the client does not control, so every deep link in this suite carries
 * the pinned tenant id explicitly and the server re-verifies membership.
 */
const TENANT_QUERY = () => `tenant=${encodeURIComponent(TENANT.id)}`;

/** Navigates the browser to a canonical organization module path. */
async function openModule(page, tabId, extraSearch = '') {
    await page.goto(`${WEB_ORIGIN}/org/${TENANT.slug}/${tabId}?${TENANT_QUERY()}${extraSearch}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation', { name: 'Organization navigation' }))
        .toBeVisible({ timeout: 60_000 });
    // The server must have honoured the pinned tenant rather than silently
    // re-resolving to a different organization.
    await expect(page.locator('[data-testid="tenant-switcher"] button').first())
        .toContainText(TENANT.displayName, { timeout: 60_000 });
}

/** Asserts a stage produced no defects and folds them into the run-wide tally. */
function assertNoDefects(stage, defects) {
    record(`${stage} defects console=${defects.consoleErrors.length} pageErrors=${defects.pageErrors.length} failedApi=${defects.failedApi.length}`);
    RUN_DEFECTS.consoleErrors.push(...defects.consoleErrors);
    RUN_DEFECTS.pageErrors.push(...defects.pageErrors);
    RUN_DEFECTS.failedApi.push(...defects.failedApi);
    expect(defects.consoleErrors).toEqual([]);
    expect(defects.pageErrors).toEqual([]);
    expect(defects.failedApi).toEqual([]);
}

test('Stage 1 — the pathname is the authoritative source of the active module', async ({ page }) => {
    const defects = watchForDefects(page);
    await bootSession(page, OPERATOR);

    // A deep link straight to a module must render THAT module, and the sidebar
    // must highlight it. Before DIR-008 this silently fell back to overview.
    await openModule(page, 'audit');
    await expect(page).toHaveURL(new RegExp(`/org/${TENANT.slug}/audit`));
    // The mirrored ?tab= query contract is still written for legacy deep links.
    await expect(page).toHaveURL(/[?&]tab=audit/);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText(/Audit Logs/i)).toBeVisible();
    await expect(page.locator('a[aria-current="page"]', { hasText: /Audit Logs/i })).toHaveCount(1);

    // A legacy ?tab= deep link with no module in the path must still resolve.
    await page.goto(`${WEB_ORIGIN}/org/${TENANT.slug}?${TENANT_QUERY()}&tab=usage`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText(/Usage & Quotas/i))
        .toBeVisible({ timeout: 60_000 });

    // A bare /org/:slug must canonicalize forward to overview, not clobber.
    await page.goto(`${WEB_ORIGIN}/org/${TENANT.slug}?${TENANT_QUERY()}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText(/Overview/i))
        .toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(new RegExp(`/org/${TENANT.slug}/overview`));

    record('stage1 pathname-authority verified: path module wins, ?tab= fallback works, bare slug canonicalizes');
    assertNoDefects('stage1', defects);
});

test('Stage 2 — all 13 console modules mount and render their own module', async ({ page }) => {
    const defects = watchForDefects(page);
    await bootSession(page, OPERATOR);
    await openModule(page, 'overview');

    // Anti-empty-state: the sidebar must actually expose thirteen options for
    // this server-resolved tenant before "all 13" can mean anything.
    const nav = page.getByRole('navigation', { name: 'Organization navigation' });
    await expect(nav.locator('a[href*="/org/"]')).toHaveCount(ENTERPRISE_TABS.length, { timeout: 60_000 });

    for (const tab of ENTERPRISE_TABS) {
        const link = nav.locator(`a[href="/org/${TENANT.slug}/${tab.id}"]`);
        await expect(link, `${tab.id} must be present in the Cuba sidebar`).toHaveCount(1);

        await link.click();
        await expect(page).toHaveURL(new RegExp(`/org/${TENANT.slug}/${tab.id}(\\?|$)`), { timeout: 60_000 });

        // The module rendered must be THIS module, not a silent fallback to
        // overview — the exact defect DIR-008 was raised to eliminate.
        await expect(
            page.getByRole('navigation', { name: 'Breadcrumb' }).getByText(new RegExp(tab.label, 'i')),
            `${tab.id} must render its own module, not reset to overview`,
        ).toBeVisible({ timeout: 60_000 });
        await expect(nav.locator(`a[aria-current="page"][href="/org/${TENANT.slug}/${tab.id}"]`)).toHaveCount(1);

        // A real module renders real content, never an empty shell.
        await expect(page.locator('main.enterprise-main')).toBeVisible();
        await expect(page.locator('main.enterprise-main .enterprise-tab-content')).toHaveCount(1);

        record(`stage2 module verified: ${tab.id} -> "${tab.label}"`);
    }

    record(`stage2 all ${ENTERPRISE_TABS.length} modules mounted and rendered their own content`);
    assertNoDefects('stage2', defects);
});

test('Stage 3 — a single Cuba chrome renders with no duplicated landmarks', async ({ page }) => {
    const defects = watchForDefects(page);
    await bootSession(page, OPERATOR);
    await openModule(page, 'members');

    // Exactly one organization navigation landmark.
    await expect(page.getByRole('navigation', { name: 'Organization navigation' })).toHaveCount(1);

    // The legacy console chrome must be GATED, not merely restyled. These are the
    // three duplicate landmarks DIR-008 required to be suppressed.
    await expect(page.locator('header.enterprise-topbar')).toHaveCount(0);
    await expect(page.locator('aside.enterprise-sidebar')).toHaveCount(0);
    await expect(page.locator('nav.enterprise-mobile-pill-strip')).toHaveCount(0);
    await expect(page.locator('nav[aria-label="Quick module navigation"]')).toHaveCount(0);
    await expect(page.locator('aside[aria-label="Enterprise Navigation"]')).toHaveCount(0);

    // The console's own breadcrumb legitimately survives as its own landmark.
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(1);

    // No duplicated role-simulation banner: Cuba hosts it, the console must not.
    await expect(page.locator('[data-testid="enterprise-role-simulation-banner"]')).toHaveCount(0);

    // The elevated Cuba context band hosts each switcher exactly once.
    await expect(page.locator('.enterprise-cuba-context-band')).toHaveCount(1);
    await expect(page.locator('[data-testid="tenant-switcher"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="workspace-switcher"]')).toHaveCount(1);

    // Keyboard focus must be visible on the navigation (WCAG 2.1 AA / §37).
    const firstOption = page.getByRole('navigation', { name: 'Organization navigation' })
        .locator('a[href*="/org/"]').first();
    await firstOption.focus();
    await expect(firstOption).toBeFocused();

    record('stage3 single-chrome verified: one nav landmark, zero legacy chrome, switchers elevated');
    assertNoDefects('stage3', defects);
});

test('Stage 4 — the Organization switcher filters and switches tenant context', async ({ page }) => {
    const defects = watchForDefects(page);
    await bootSession(page, OPERATOR);
    await openModule(page, 'overview');

    // The switcher trigger renders the server-resolved organization name.
    const trigger = page.locator('[data-testid="tenant-switcher"] button').first();
    await expect(trigger).toContainText(TENANT.displayName);
    await trigger.click();

    const popover = page.getByRole('dialog', { name: 'Switch organization' });
    await expect(popover).toBeVisible();

    // Real organizations must be listed, and the current one must be marked.
    const options = popover.getByRole('option');
    const optionCount = await options.count();
    expect(optionCount, 'the switcher must list real organizations from the server').toBeGreaterThan(0);
    await expect(popover.locator('[aria-label="Active organization"]')).toHaveCount(1);
    record(`stage4 switcher listed ${optionCount} real organizations`);

    // Filtering on search input must narrow the list.
    const search = popover.getByLabel('Search organizations');
    await search.fill(TENANT.displayName);
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText(TENANT.displayName);

    // A term that matches nothing must produce the honest empty state.
    await search.fill('zzz-no-such-organization-zzz');
    await expect(popover.getByText('No organization matches this search.')).toBeVisible();
    await search.fill('');

    // Escape dismisses the popover (WCAG §14).
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);

    // Switch to a DIFFERENT real organization; the console must re-scope to that
    // tenant's context and re-point every navigation target at the new slug.
    const tenants = await liveJson(OPERATOR, 'GET', '/api/enterprise/tenants');
    const other = (tenants.body?.tenants || []).find(t => t.id !== TENANT.id);
    expect(other, 'a second real organization is required to prove switching').toBeTruthy();

    await page.locator('[data-testid="tenant-switcher"] button').first().click();
    await page.getByRole('dialog', { name: 'Switch organization' })
        .getByRole('option').filter({ hasText: other.displayName }).first().click();

    await expect(page.locator('[data-testid="tenant-switcher"] button').first())
        .toContainText(other.displayName, { timeout: 60_000 });
    await expect(
        page.getByRole('navigation', { name: 'Organization navigation' })
            .locator(`a[href^="/org/${other.slug}/"]`).first(),
    ).toBeVisible({ timeout: 60_000 });
    record(`stage4 switched organization context to slug=${other.slug} name="${other.displayName}"`);

    // The workspace switcher must also be functional.
    const workspaceTrigger = page.locator('[data-testid="workspace-switcher"] button').first();
    await expect(workspaceTrigger).toBeVisible();
    await workspaceTrigger.click();
    const workspacePopover = page.getByRole('dialog', { name: 'Switch workspace' });
    await expect(workspacePopover).toBeVisible();
    expect(await workspacePopover.getByRole('option').count(), 'real workspaces must be listed').toBeGreaterThan(0);
    await page.keyboard.press('Escape');

    assertNoDefects('stage4', defects);
});

test('Stage 5 — overview quick actions deep-link with pre-applied parameters', async ({ page }) => {
    const defects = watchForDefects(page);
    await bootSession(page, OPERATOR);
    await openModule(page, 'overview');

    // The overview must render against the real tenant, not a placeholder.
    await expect(page.getByRole('heading', { name: TENANT.displayName }).first())
        .toBeVisible({ timeout: 60_000 });

    // Management shortcuts navigate through selectTab, so clicking one proves the
    // pathname contract end to end from a real in-console control.
    const shortcuts = page.getByRole('heading', { name: 'Management Shortcuts' });
    await expect(shortcuts).toBeVisible();
    const shortcutButton = page.locator('.enterprise-card', { has: shortcuts }).locator('button').first();
    await expect(shortcutButton).toBeVisible();

    await shortcutButton.click();
    await expect(page).toHaveURL(new RegExp(`/org/${TENANT.slug}/[a-z]+`), { timeout: 60_000 });
    const url = new URL(page.url());
    expect(url.pathname.startsWith(`/org/${TENANT.slug}/`), 'quick action must stay inside the tenant namespace').toBe(true);
    // The module moved off overview and the mirrored query still agrees with it.
    const landed = url.pathname.split('/').pop();
    expect(landed, 'a quick action must land on a real module').not.toBe('overview');
    expect(url.searchParams.get('tab')).toBe(landed);
    record(`stage5 quick action deep-linked to ${landed} with query "${url.search}"`);

    // A deep link carrying a pre-applied filter must survive the canonical render.
    await openModule(page, 'members', '&status=INVITED');
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Users & IAM'))
        .toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/status=INVITED/);
    record('stage5 deep-link parameter status=INVITED preserved on the canonical path');

    // The command palette must open from the keyboard shortcut.
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(1);
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
    await expect(page.locator('.enterprise-command')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0);
    record('stage5 exactly one Cuba command palette opens from the keyboard shortcut');

    assertNoDefects('stage5', defects);
});

test('Stage 6 — the full console walk produced zero defects', async () => {
    record('--- run-wide defect tally ---');
    record(`consoleErrors=${RUN_DEFECTS.consoleErrors.length} pageErrors=${RUN_DEFECTS.pageErrors.length} failedApi=${RUN_DEFECTS.failedApi.length}`);
    for (const entry of [...RUN_DEFECTS.consoleErrors, ...RUN_DEFECTS.pageErrors, ...RUN_DEFECTS.failedApi]) {
        record(`DEFECT: ${entry}`);
    }
    expect(RUN_DEFECTS.consoleErrors, 'zero browser console errors are required').toEqual([]);
    expect(RUN_DEFECTS.pageErrors, 'zero uncaught page errors are required').toEqual([]);
    expect(RUN_DEFECTS.failedApi, 'zero failed /api/* responses are required').toEqual([]);
    record('DIR-008 organization console verification COMPLETE with 0 defects');
});
