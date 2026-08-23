/**
 * Production Admin/Super Admin browser certification.
 *
 * This suite is opt-in and never runs against a local server accidentally.
 * It tests the same origin a human uses, checks real authenticated requests,
 * covers /adm plus the /admin and /platform aliases, and keeps destructive CRUD behind LIVE_CERT_ALLOW_DESTRUCTIVE=1. The API
 * scripts own disposable create/delete lifecycles; this file focuses on UI
 * navigation, state refresh, authorization visibility, errors, and responsive
 * behavior.
 *
 * Run:
 *   LIVE_CERT_BASE_URL=https://your-host \
 *   LIVE_CERT_SUPERADMIN_EMAIL=... LIVE_CERT_SUPERADMIN_PASSWORD=... \
 *   LIVE_CERT_ADMIN_EMAIL=... LIVE_CERT_ADMIN_PASSWORD=... \
 *   npx playwright test --config=playwright.live-admin.config.js
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.LIVE_CERT_BASE_URL;
const SUPER_EMAIL = process.env.LIVE_CERT_SUPERADMIN_EMAIL;
const SUPER_PASSWORD = process.env.LIVE_CERT_SUPERADMIN_PASSWORD;
const ADMIN_EMAIL = process.env.LIVE_CERT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.LIVE_CERT_ADMIN_PASSWORD;
const LIVE_ENABLED = Boolean(BASE && SUPER_EMAIL && SUPER_PASSWORD);
const DESTRUCTIVE = process.env.LIVE_CERT_ALLOW_DESTRUCTIVE === '1';
const RAW_SECRET = /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|(?:sk|nvapi|rzp)_(?:live|test)_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{30,}/i;

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="Email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"], input[name="Password"], input[name="password"]').first().fill(password);
  const submit = page.locator('input[type="submit"], button[type="submit"]').first();
  await submit.click();
  try {
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10_000 });
  } catch (_) {
    await page.waitForTimeout(2000);
  }
  if (page.url().includes('/login')) {
    const error = await page.locator('[role="alert"]').allTextContents().catch(() => []);
    throw new Error(`Login did not leave /login${error.length ? `: ${error.join(' ')}` : ''}`);
  }
}

async function openAdmin(page, route = '/adm') {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });
}

async function api(page, path, options = {}) {
  return page.evaluate(async ({ path: target, options: init }) => {
    const response = await fetch(target, { ...init, headers: { Accept: 'application/json', ...(init.headers || {}) } });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch (_) {}
    return { status: response.status, body, text };
  }, { path, options });
}

const forbiddenUiText = [
  'API route not found',
  'Failed to fetch',
  'Unexpected error',
  'undefined is not',
  '[object Object]',
  'NaN',
];

test.describe.configure({ mode: 'serial' });
test.describe('live Admin and Super Admin certification', () => {
  test.skip(!LIVE_ENABLED, !BASE ? 'Set LIVE_CERT_BASE_URL to enable live certification.' : 'Set LIVE_CERT_SUPERADMIN_EMAIL and LIVE_CERT_SUPERADMIN_PASSWORD.');

  test('authenticates and supports both /adm and /admin compatibility routes', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    await openAdmin(page, '/adm');
    expect(page.url()).toContain('/adm');
    for (const alias of ['/admin', '/platform']) {
      await page.goto(`${BASE}${alias}`, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/adm/);
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('all first-class navigation modules render without unexplained UI failures', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    const routes = ['dashboard', 'tenants', 'audit-logs', 'security', 'queues', 'operations', 'attention', 'health', 'operators', 'users', 'employer-applications', 'jobs-manager', 'company-management', 'blog-management', 'landing-pages', 'reviews', 'trustedby', 'messages', 'phrases'];
    for (const route of routes) {
      await openAdmin(page, `/adm/${route}`);
      const text = await page.locator('body').innerText();
      for (const forbidden of forbiddenUiText) expect(text, `${forbidden} on ${route}`).not.toContain(forbidden);
    }
  });

  test('Super Admin settings expose flags, configuration census, and secret-free status', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    await openAdmin(page, '/adm/settings?tab=featureFlagsSettings');
    await expect(page.getByText('Feature Flags', { exact: true }).first()).toBeVisible();
    await openAdmin(page, '/adm/settings?tab=platformConfigSettings');
    await expect(page.getByTestId('platform-configuration')).toBeVisible();
    const text = await page.locator('body').innerText();
    expect(text).toContain('ENTERPRISE_TENANCY_ENABLED');
    expect(text).toContain('Restart');
    expect(RAW_SECRET.test(text)).toBeFalsy();
    const configuration = await api(page, '/api/platform/configuration');
    expect(configuration.status).toBe(200);
    expect(RAW_SECRET.test(configuration.text)).toBeFalsy();
    expect(configuration.body?.policy?.secretsNeverReturned).toBe(true);
  });

  test('platform health and API matrix expose evidence-backed states and actionable errors', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    await openAdmin(page, '/adm/health');
    await expect(page.locator('[data-testid="health-service-row"]').first()).toBeVisible({ timeout: 20_000 });
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/OPERATIONAL|DEGRADED|UNAVAILABLE|DISABLED|NOT_CONFIGURED|UNKNOWN/);
    await page.getByRole('button', { name: /View API Matrix/i }).click();
    await expect(page.locator('[data-testid="api-matrix-table"], [data-testid="api-matrix-card"]').first()).toBeVisible({ timeout: 20_000 });
    expect(RAW_SECRET.test(await page.locator('body').innerText())).toBeFalsy();
  });

  test('Super Admin API permissions are enforced independently of button visibility', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    const own = await api(page, '/api/platform/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
    expect([200, 400, 409, 503]).toContain(own.status);

    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Set LIVE_CERT_ADMIN_EMAIL and LIVE_CERT_ADMIN_PASSWORD for ADMIN negative checks.');
    await page.evaluate(async () => { await window.fire?.auth?.().signOut?.(); });
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await openAdmin(page, '/adm/operations');
    const maintenance = await api(page, '/api/platform/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
    expect(maintenance.status).toBe(403);
    const flags = await api(page, '/api/platform/feature-flags');
    expect(flags.status).toBe(403);
  });

  test('user directory, audit trail, and tenant detail return explicit data-plane states', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    const users = await api(page, '/api/admin/users?limit=5');
    expect([200, 503]).toContain(users.status);
    if (users.status === 200) {
      expect(Array.isArray(users.body?.users)).toBeTruthy();
      expect(RAW_SECRET.test(users.text)).toBeFalsy();
    }
    const audit = await api(page, '/api/admin/audit-logs?limit=5');
    expect([200, 503]).toContain(audit.status);
    if (audit.status === 200) expect(Array.isArray(audit.body?.logs)).toBeTruthy();
    const tenants = await api(page, '/api/enterprise/platform/tenants');
    expect([200, 403, 404, 503]).toContain(tenants.status);
    if (tenants.status === 200 && tenants.body?.tenants?.[0]?.id) {
      const detail = await api(page, `/api/platform/tenants/${encodeURIComponent(tenants.body.tenants[0].id)}`);
      expect(detail.status).toBe(200);
      for (const section of ['overview', 'users', 'memberships', 'usage', 'security', 'm2m', 'audit', 'activity', 'configuration']) expect(section in detail.body).toBeTruthy();
    }
  });

  test('validation and not-found responses are machine-readable rather than false success', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    const invalidRename = await api(page, '/api/platform/tenants/not-a-tenant', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'Nope' }) });
    expect(invalidRename.status).toBe(400);
    expect(invalidRename.body?.error?.code).toBeTruthy();
    const invalidDelete = await api(page, '/api/admin/delete-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 'not-a-real-user' }) });
    expect([400, 404, 503]).toContain(invalidDelete.status);
    expect(invalidDelete.body?.success).not.toBe(true);
  });

  test('responsive layout has no horizontal overflow at all required viewports', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    const viewports = [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [430, 932], [375, 667]];
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      for (const route of ['/adm', '/adm/health', '/adm/users', '/adm/settings?tab=platformConfigSettings']) {
        await openAdmin(page, route);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${route} overflows at ${width}x${height}`).toBeLessThanOrEqual(1);
        const dialogs = page.locator('[role="dialog"]:visible');
        if (await dialogs.count()) expect(await dialogs.first().boundingBox()).not.toBeNull();
      }
    }
  });

  test('destructive browser CRUD is opt-in and delegates to the API certification script', async () => {
    test.skip(!DESTRUCTIVE, 'Set LIVE_CERT_ALLOW_DESTRUCTIVE=1 only in an isolated certification window; verify-crud-live.mjs owns disposable mutations.');
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    // The browser suite deliberately does not invent/decommission resources.
    // Invoke the API CRUD runner separately so cleanup remains centralized.
    await expect(page.getByText(/Command|Admin/i).first()).toBeVisible();
  });
});
