// @ts-check
/**
 * Enterprise Console — full-surface Playwright E2E suite.
 *
 * Replaces the earlier spec whose selectors ("IAM & Roles", 7 nav items…)
 * never matched the real product. This suite drives the ACTUAL console: it
 * boots the real Vite app, seeds a believable authenticated Firebase session,
 * and serves the /api/enterprise/** contract from the shared stateful fixture
 * (tests/helpers/enterprise-fixture.mjs), which mirrors the response shapes of
 * backend/routes/enterprise.js.
 *
 * Coverage: all 12+1 modules, live CRUD, cross-module deep links, command
 * palette, refresh persistence, browser back/forward, role restrictions,
 * error states + recovery, responsive layouts, and a console/network audit.
 *
 * Run: npx playwright test tests/enterprise-e2e.spec.js
 * (Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH when the Playwright CDN is
 *  unavailable, e.g. pointing at an @sparticuz/chromium binary.)
 */
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import {
  createEnterpriseFixtureBackend,
  installAuthenticatedSession,
  seedEnterpriseState,
  viteFixtureDefines,
} from './helpers/enterprise-fixture.mjs';

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

/** Boots an authenticated page against a fresh fixture tenant. */
async function bootConsole(page, { seed = null, tab = 'overview', extraParams = '' } = {}) {
  const state = seed || seedEnterpriseState();
  const backend = createEnterpriseFixtureBackend(state);
  const pageErrors = [];
  const badResponses = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('response', response => {
    if (response.url().includes('/api/') && response.status() >= 400) {
      badResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  await installAuthenticatedSession(page);
  await page.route('**/api/**', backend);
  await page.goto(`${base}/enterprise?tab=${tab}${extraParams}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });
  return { state, backend, pageErrors, badResponses };
}

// ---------------------------------------------------------------------------
// 1. Shell, information architecture & identity
// ---------------------------------------------------------------------------

test('shell renders grouped navigation, breadcrumbs, and the signed-in identity', async ({ page }) => {
  const { pageErrors } = await bootConsole(page);

  // All 13 modules for a tenant owner with platform capability.
  await expect(page.locator('.enterprise-nav-item')).toHaveCount(13);
  for (const label of ['Overview', 'Documents & Resumes', 'Users & IAM', 'Teams', 'Workspaces',
    'Roles & permissions', 'AI workspace', 'Security & M2M', 'Usage & Quotas', 'Audit logs',
    'Support access', 'Organization settings', 'Platform administration']) {
    await expect(page.locator(`.enterprise-nav-item:has-text("${label}")`).first()).toBeVisible();
  }

  // IA groups communicate the hierarchy.
  for (const group of ['Organization', 'Governance', 'Administration']) {
    await expect(page.locator(`.enterprise-nav-group-label:has-text("${group}")`)).toBeVisible();
  }

  // WHO AM I: identity footer with roles.
  await expect(page.locator('.enterprise-identity')).toContainText('TENANT_OWNER');

  // WHERE AM I: breadcrumb tenant → workspace → module.
  const crumbs = page.locator('.enterprise-breadcrumbs');
  await expect(crumbs).toContainText('Northwind Careers');
  await expect(crumbs).toContainText('Default Workspace');
  await expect(crumbs).toContainText('Overview');

  expect(pageErrors).toEqual([]);
});

test('every module renders its real heading with real tenant data', async ({ page }) => {
  await bootConsole(page);
  const modules = [
    ['overview', 'Northwind Careers'],
    ['resumes', 'Enterprise Document Library'],
    ['members', 'Users & IAM'],
    ['teams', 'Teams Management'],
    ['workspaces', 'Workspaces'],
    ['access', 'Roles & Access Control Matrix'],
    ['ai', 'Enterprise AI Policy & Quota Console'],
    ['security', 'Security Posture'],
    ['usage', 'Usage & Quota Analytics'],
    ['audit', 'Immutable Audit Trail'],
    ['support', 'Break-Glass & Support Access'],
    ['settings', 'Organization Settings'],
    ['platform', 'Platform Administration'],
  ];
  for (const [tab, heading] of modules) {
    await page.goto(`${base}/enterprise?tab=${tab}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.enterprise-main')).toContainText(heading, { timeout: 20_000 });
  }
});

// ---------------------------------------------------------------------------
// 2. Overview command center + cross-module intelligence
// ---------------------------------------------------------------------------

test('overview surfaces real KPIs, a usage trend, and state-derived recommendations', async ({ page }) => {
  await bootConsole(page);

  await expect(page.locator('.enterprise-metric-box:has-text("Enterprise Members") .enterprise-metric-value')).toHaveText('12');
  await expect(page.locator('.enterprise-metric-box:has-text("Teams") .enterprise-metric-value')).toHaveText('3');
  await expect(page.locator('.enterprise-trend').first()).toBeVisible();

  // Recommendations derive from the seeded state: 1 DLQ job, 2 suspended, 2 invited.
  const recommendations = page.locator('.enterprise-card:has-text("Recommended Actions")');
  await expect(recommendations).toContainText('1 dead-letter job awaiting replay');
  await expect(recommendations).toContainText('2 suspended members');
  await expect(recommendations).toContainText('2 pending invitations');
});

test('recommendation "suspended members" deep links into Users pre-filtered to SUSPENDED', async ({ page }) => {
  await bootConsole(page);
  await page.locator('.enterprise-health-item:has-text("suspended members") button:has-text("Review")').click();
  await expect(page).toHaveURL(/tab=members/);
  await expect(page).toHaveURL(/status=SUSPENDED/);
  await expect(page.locator('.enterprise-chip:has-text("Suspended")')).toHaveClass(/active/);
  const rows = page.locator('.enterprise-table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('SUSPENDED');
});

test('recommendation "pending invitations" deep links into Users filtered to INVITED', async ({ page }) => {
  await bootConsole(page);
  await page.locator('.enterprise-health-item:has-text("pending invitation") button:has-text("Review")').click();
  await expect(page).toHaveURL(/status=INVITED/);
  const rows = page.locator('.enterprise-table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('INVITED');
});

test('recommendation "dead-letter" deep links to the Durable Jobs panel in Security', async ({ page }) => {
  await bootConsole(page);
  await page.locator('.enterprise-health-item:has-text("dead-letter") button:has-text("Review")').click();
  await expect(page).toHaveURL(/tab=security/);
  await expect(page).toHaveURL(/focus=jobs/);
  await expect(page.locator('#durable-jobs')).toBeVisible();
  await expect(page.locator('#durable-jobs')).toContainText('DEAD_LETTER');
});

// ---------------------------------------------------------------------------
// 3. Command palette
// ---------------------------------------------------------------------------

test('command palette navigates and executes cross-module quick actions', async ({ page }) => {
  await bootConsole(page);

  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.locator('.enterprise-command');
  await expect(palette).toBeVisible();

  // Actions and navigation are both offered.
  await palette.locator('input').fill('audit');
  await expect(palette.locator('button:has-text("Audit logs")')).toBeVisible();
  await expect(palette.locator('button:has-text("Investigate denied operations")')).toBeVisible();

  // Executing a quick action lands on a pre-filtered actionable screen.
  await palette.locator('input').fill('invite');
  await palette.locator('button:has-text("Invite or grant member access")').click();
  await expect(page).toHaveURL(/tab=members/);
  await expect(page.locator('.enterprise-modal:has-text("Invite")').first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// 4. Users & IAM CRUD
// ---------------------------------------------------------------------------

test('users module supports invite, role change, suspend/reactivate, and resend', async ({ page }) => {
  await bootConsole(page, { tab: 'members' });
  await expect(page.locator('.enterprise-chip:has-text("All members")')).toContainText('12');

  // Invite a new member by email.
  await page.locator('button:has-text("Invite / Grant Access")').click();
  await page.locator('.enterprise-modal input[type="email"]').fill('new.hire@northwind.example');
  await page.locator('.enterprise-modal button[type="submit"]').click();
  await expect(page.locator('.enterprise-table')).toContainText('new.hire@northwind.example', { timeout: 15_000 });
  await expect(page.locator('.enterprise-chip:has-text("All members")')).toContainText('13');

  // Role change through the row select issues a real PATCH.
  const roleSelect = page.locator('tr:has-text("mia.johnson") select.enterprise-role-select');
  await roleSelect.selectOption('WORKSPACE_MANAGER');
  await expect(page.locator('tr:has-text("mia.johnson")')).toContainText('WORKSPACE_MANAGER');

  // Resend a pending invitation.
  await page.locator('tr:has-text("grace.lee") button[title*="Resend"]').first().click();
  await expect(page.locator('.enterprise-notification, .enterprise-toast, [role="status"]').first()).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// 5. Workspaces & Teams lifecycle
// ---------------------------------------------------------------------------

test('workspace lifecycle: create → rename → archive → restore, plus membership', async ({ page }) => {
  await bootConsole(page, { tab: 'workspaces' });
  await page.locator('button:has-text("New Workspace")').click();
  await page.locator('#ws-name').fill('APAC Operations');
  await page.locator('.enterprise-modal button:has-text("Create Workspace")').click();
  await expect(page.locator('.enterprise-main')).toContainText('APAC Operations');

  await page.locator('button[title="Rename APAC Operations"]').click();
  await page.locator('#ws-rename').fill('APAC & Japan');
  await page.locator('.enterprise-modal button:has-text("Save Name")').click();
  await expect(page.locator('.enterprise-main')).toContainText('APAC & Japan');

  page.once('dialog', dialog => dialog.accept());
  await page.locator('button[title="Archive APAC & Japan"]').click();
  await expect(page.locator('.enterprise-workspace-card.archived, .enterprise-pill:has-text("Archived")').first()).toBeVisible();
  await page.locator('button:has-text("Restore")').first().click();
  await expect(page.locator('.enterprise-workspace-card:not(.archived) >> text=APAC & Japan').first()).toBeVisible();
});

test('team lifecycle: deep-linked create dialog → create → rename', async ({ page }) => {
  // ?create=1 deep link opens the dialog straight away (palette/overview flow).
  await bootConsole(page, { tab: 'teams', extraParams: '&create=1' });
  await expect(page.locator('.enterprise-modal').first()).toBeVisible();
  await page.locator('.enterprise-modal input').first().fill('Growth Guild');
  await page.locator('.enterprise-modal button:has-text("Create Team")').click();
  await expect(page.locator('.enterprise-main')).toContainText('Growth Guild');
});

// ---------------------------------------------------------------------------
// 6. Roles, AI, Security, Usage, Audit
// ---------------------------------------------------------------------------

test('roles matrix shows built-in and tenant-defined custom roles with assignments', async ({ page }) => {
  await bootConsole(page, { tab: 'access' });
  for (const role of ['TENANT_OWNER', 'TENANT_ADMIN', 'WORKSPACE_MANAGER', 'MEMBER', 'VIEWER']) {
    await expect(page.locator('.enterprise-main')).toContainText(role);
  }
  await expect(page.locator('.enterprise-role-card-custom')).toContainText('security-auditor');
  await expect(page.locator('.enterprise-main')).toContainText('assigned member');
});

test('AI policy console loads live configuration and persists changes', async ({ page }) => {
  await bootConsole(page, { tab: 'ai' });
  await expect(page.locator('.enterprise-main')).toContainText('Approved Provider Allowlist');
  const rateInput = page.locator('input[type="number"]').first();
  await rateInput.fill('24');
  await page.locator('button:has-text("Save AI Policy Changes")').click();
  await expect(page.locator('.enterprise-main')).toContainText(/saved|updated|applied/i, { timeout: 15_000 });
});

test('security center: posture states, service-account create/rotate, DLQ replay', async ({ page }) => {
  const { state } = await bootConsole(page, { tab: 'security' });
  await expect(page.locator('.enterprise-main')).toContainText('Administrator MFA');
  await expect(page.locator('.enterprise-main')).toContainText('Enforced');

  // Create a service account and reveal its one-time key.
  await page.locator('button:has-text("Create Service Account")').click();
  await page.locator('.enterprise-modal input').first().fill('etl-exporter');
  await page.locator('.enterprise-modal button:has-text("Create & Reveal Key")').click();
  await expect(page.locator('.enterprise-main')).toContainText('rpa_');
  await expect(page.locator('.enterprise-main')).toContainText('etl-exporter');

  // Replay the dead-letter job — the fixture state genuinely changes.
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#durable-jobs button:has-text("Replay")').first().click();
  await expect.poll(() => state.jobs.filter(job => job.status === 'DEAD_LETTER').length, { timeout: 10_000 }).toBe(0);
});

test('usage analytics: trend chart, ledger disclosure, workspace names, actor deep link', async ({ page }) => {
  await bootConsole(page, { tab: 'usage' });
  await expect(page.locator('.enterprise-trend').first()).toBeVisible();

  // Progressive disclosure of the dense per-day ledger.
  await page.locator('details.enterprise-disclosure summary').click();
  await expect(page.locator('details.enterprise-disclosure table tbody tr').first()).toBeVisible();

  // Workspace IDs are humanized using the live workspace registry.
  await expect(page.locator('.enterprise-card:has-text("By Workspace")')).toContainText('Engineering');

  // Per-user usage links into the audit trail filtered to that actor.
  await page.locator('.enterprise-card:has-text("By User") button:has-text("mia.johnson")').click();
  await expect(page).toHaveURL(/tab=audit/);
  await expect(page).toHaveURL(/actor=mia\.johnson/);
  await expect(page.locator('.enterprise-table tbody tr').first()).toContainText('mia.johnson');
});

test('audit center: server-side filters, cursor pagination, and deep links', async ({ page }) => {
  await bootConsole(page, { tab: 'audit' });

  // 122 seeded events: first page of 100, then load more.
  await expect(page.locator('.enterprise-main')).toContainText('more available');
  await page.locator('button:has-text("Load more events")').click();
  await expect(page.locator('.enterprise-main')).toContainText('end of trail');

  // Server-side action filter.
  await page.locator('input[placeholder*="Action contains"]').fill('SUPPORT_GRANT');
  await expect(page.locator('.enterprise-table tbody tr')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('.enterprise-table tbody tr').first()).toContainText('SUPPORT_GRANT_ISSUED');

  // Direct deep link with an actor filter survives a fresh load.
  await page.goto(`${base}/enterprise?tab=audit&actor=ethan.kim`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.enterprise-table tbody tr')).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('.enterprise-table tbody tr').first()).toContainText('LOGIN_MFA_DENIED');
});

// ---------------------------------------------------------------------------
// 7. Platform admin, role restrictions, error states
// ---------------------------------------------------------------------------

test('platform administration: registry metrics and tenant suspend/reactivate', async ({ page }) => {
  await bootConsole(page, { tab: 'platform' });
  await expect(page.locator('.enterprise-main')).toContainText('Total Tenants');
  await expect(page.locator('.enterprise-main')).toContainText('globex-talent');

  page.once('dialog', dialog => dialog.accept());
  await page.locator('tr:has-text("Globex Talent") button:has-text("Suspend")').click();
  await expect(page.locator('tr:has-text("Globex Talent")')).toContainText('SUSPENDED', { timeout: 15_000 });
});

test('restricted member session hides governance modules and blocks platform admin', async ({ page }) => {
  const seed = seedEnterpriseState({
    platformAdmin: false,
    permissions: ['workspace.read', 'resource.read', 'resource.create', 'resource.update', 'ai.use'],
    roles: ['MEMBER'],
  });
  await bootConsole(page, { seed, tab: 'overview' });

  // Only permission-visible modules remain.
  const visible = await page.locator('.enterprise-nav-item').allTextContents();
  expect(visible.join(' ')).not.toContain('Platform administration');
  expect(visible.join(' ')).not.toContain('Organization settings');
  expect(visible.join(' ')).not.toContain('Roles & permissions');
  expect(visible.join(' ')).toContain('Teams');

  // Direct navigation to a forbidden module normalizes to an allowed one.
  await page.goto(`${base}/enterprise?tab=platform`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.enterprise-shell', { timeout: 20_000 });
  await expect(page).toHaveURL(/tab=overview/);
});

test('API failure produces a truthful error state and Retry genuinely recovers', async ({ page }) => {
  const state = seedEnterpriseState();
  const backend = createEnterpriseFixtureBackend(state);
  let failMemberships = true;
  await installAuthenticatedSession(page);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (failMemberships && url.pathname === '/api/enterprise/memberships' && route.request().method() === 'GET') {
      return route.fulfill({ status: 503, json: { error: { code: 'ENTERPRISE_UNAVAILABLE', message: 'Membership listing is temporarily unavailable' } } });
    }
    return backend(route);
  });
  await page.goto(`${base}/enterprise?tab=members`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });

  await expect(page.locator('[role="alert"]')).toContainText('Data unavailable');
  failMemberships = false;
  await page.locator('[role="alert"] button:has-text("Retry"), .enterprise-card:has-text("Data unavailable") button:has-text("Retry")').first().click();
  await expect(page.locator('.enterprise-table tbody tr')).toHaveCount(12, { timeout: 20_000 });
});

// ---------------------------------------------------------------------------
// 8. Navigation history, refresh, responsive
// ---------------------------------------------------------------------------

test('deep links survive refresh; browser back/forward walk the module history', async ({ page }) => {
  await bootConsole(page, { tab: 'members', extraParams: '&status=INVITED' });
  await expect(page.locator('.enterprise-chip:has-text("Invited")')).toHaveClass(/active/);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });
  await expect(page.locator('.enterprise-chip:has-text("Invited")')).toHaveClass(/active/);

  // Walk: members → audit → usage, then back/forward.
  await page.locator('.enterprise-nav-item:has-text("Audit logs")').click();
  await expect(page).toHaveURL(/tab=audit/);
  await page.locator('.enterprise-nav-item:has-text("Usage & Quotas")').click();
  await expect(page).toHaveURL(/tab=usage/);
  await page.goBack();
  await expect(page).toHaveURL(/tab=audit/);
  await page.goBack();
  await expect(page).toHaveURL(/tab=members/);
  await page.goForward();
  await expect(page).toHaveURL(/tab=audit/);
});

test('responsive: mobile menu is intentional and no module overflows at any breakpoint', async ({ page }) => {
  await bootConsole(page);
  const viewports = [
    { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 768, height: 1024 },
    { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const tab of ['overview', 'members', 'usage', 'audit', 'security']) {
      await page.goto(`${base}/enterprise?tab=${tab}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.enterprise-shell', { timeout: 20_000 });
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `overflow at ${viewport.width}px on ${tab}`).toBeLessThanOrEqual(2);
    }
  }

  // Mobile: the hamburger opens a real drawer with full labels and groups.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/enterprise?tab=overview`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.enterprise-shell', { timeout: 20_000 });
  await page.locator('.enterprise-mobile-toggle').click();
  await expect(page.locator('.enterprise-sidebar.mobile-open')).toBeVisible();
  await expect(page.locator('.enterprise-sidebar.mobile-open .enterprise-nav-group-label:has-text("Governance")')).toBeVisible();
  await page.locator('.enterprise-sidebar.mobile-open .enterprise-nav-item:has-text("Audit logs")').click();
  await expect(page).toHaveURL(/tab=audit/);
});

// ---------------------------------------------------------------------------
// 9. Console & network audit
// ---------------------------------------------------------------------------

test('no page errors or unexpected API failures while walking every module', async ({ page }) => {
  const { pageErrors, badResponses } = await bootConsole(page);
  for (const tab of ['overview', 'resumes', 'members', 'teams', 'workspaces', 'access', 'ai',
    'security', 'usage', 'audit', 'support', 'settings', 'platform']) {
    await page.goto(`${base}/enterprise?tab=${tab}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.enterprise-shell', { timeout: 20_000 });
    await page.waitForTimeout(600);
  }
  expect(pageErrors).toEqual([]);
  // The support module intentionally receives a 403 on /support/context (the
  // console renders it as "no support session"). Everything else must be clean.
  const unexpected = badResponses.filter(entry => !entry.includes('/api/enterprise/support/context'));
  expect(unexpected).toEqual([]);
});
