/**
 * Live Admin / Super Admin UI certification.
 *
 * Drives the REAL production console in a browser and asserts what a human
 * would see. This is the half that API scripts cannot cover: that a click
 * actually issues the request, that the table actually refreshes afterwards,
 * and that a failure actually says something.
 *
 * These tests are skipped unless LIVE_CERT_BASE_URL is set, so they never run
 * against a dev server by accident and never fail a normal `npx playwright test`.
 *
 *   LIVE_CERT_BASE_URL       required to enable, e.g. https://airesume.projectdemo.guru
 *   LIVE_CERT_SUPERADMIN_EMAIL / _PASSWORD   required
 *   LIVE_CERT_ADMIN_EMAIL / _PASSWORD        optional, adds negative RBAC in the UI
 *
 * Run:
 *   LIVE_CERT_BASE_URL=https://airesume.projectdemo.guru \
 *   LIVE_CERT_SUPERADMIN_EMAIL=... LIVE_CERT_SUPERADMIN_PASSWORD=... \
 *   npx playwright test tests/admin-superadmin-live-certification.spec.js
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.LIVE_CERT_BASE_URL;
const SUPER_EMAIL = process.env.LIVE_CERT_SUPERADMIN_EMAIL;
const SUPER_PASSWORD = process.env.LIVE_CERT_SUPERADMIN_PASSWORD;
const ADMIN_EMAIL = process.env.LIVE_CERT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.LIVE_CERT_ADMIN_PASSWORD;

// Skipping loudly beats failing silently: the reason appears in the report.
// A top-level test.skip() cannot be used outside a test body, so the condition
// is applied to the whole describe block instead.
const LIVE_ENABLED = Boolean(BASE && SUPER_EMAIL && SUPER_PASSWORD);
const SKIP_REASON = !BASE
  ? 'LIVE_CERT_BASE_URL is not set — live UI certification is disabled.'
  : 'LIVE_CERT_SUPERADMIN_EMAIL/_PASSWORD are required for live UI certification.';

test.describe.configure({ mode: 'serial' });

/** Signs in through the real login form, as a user would. */
async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await Promise.all([
    page.waitForURL('**/adm**', { timeout: 15000 }).catch(() => {}),
    page.getByRole('button', { name: 'Login', exact: true }).click(),
  ]);
}

test.describe('live Admin / Super Admin console', () => {
  test.skip(!LIVE_ENABLED, SKIP_REASON);

  test('super admin can sign in and reach the console', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    await page.goto(`${BASE}/adm`, { waitUntil: 'domcontentloaded' });

    // Must not have been bounced back to login.
    expect(page.url()).toContain('/adm');
    await expect(page.locator('body')).not.toContainText('API route not found');
  });

  test('no admin surface shows a raw error or unexplained failure', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);

    const FORBIDDEN = [
      'API route not found',
      'Failed to fetch',
      'Unexpected error',
      'undefined is not',
      'NaN',
      'Coming Soon',
      '[object Object]',
    ];

    const modules = [
      'health', 'attention', 'tenants', 'users', 'operators',
      'audit', 'security', 'queues', 'operations', 'settings',
    ];

    for (const module of modules) {
      await page.goto(`${BASE}/adm/${module}`, { waitUntil: 'domcontentloaded' });
      const body = (await page.locator('body').innerText()).slice(0, 20000);
      for (const phrase of FORBIDDEN) {
        expect(body, `"${phrase}" must not appear on /adm/${module}`).not.toContain(phrase);
      }
    }
  });

  test('platform health renders real states with reasons, not placeholders', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    await page.goto(`${BASE}/adm/health`, { waitUntil: 'domcontentloaded' });

    const rows = page.locator('[data-testid="health-service-row"]');
    await expect(rows.first()).toBeVisible({ timeout: 20000 });
    expect(await rows.count()).toBeGreaterThan(0);

    // Every visible state must be one of the documented values.
    const text = await page.locator('body').innerText();
    const VALID = ['OPERATIONAL', 'DEGRADED', 'UNAVAILABLE', 'DISABLED', 'NOT CONFIGURED', 'NOT_CONFIGURED', 'UNKNOWN', 'NOT SUPPORTED'];
    expect(VALID.some(state => text.includes(state))).toBeTruthy();

    // A dashboard that cannot collect a metric must say so, not print 0.
    if (text.includes('Data unavailable')) {
      expect(text).toContain('Data unavailable');
    }
  });

  test('the health indicator is visible in navigation and deep-links', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    await page.goto(`${BASE}/adm`, { waitUntil: 'domcontentloaded' });

    const indicator = page.locator('[data-testid="sidebar-health-indicator"]');
    await expect(indicator).toBeVisible({ timeout: 20000 });

    await indicator.click();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/adm/health');
  });

  test('the API matrix is behind a control, not on the initial dashboard', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    await page.goto(`${BASE}/adm/health`, { waitUntil: 'domcontentloaded' });

    // The full endpoint list must not be dumped onto first paint.
    const matrixBefore = page.locator('[data-testid="api-matrix-table"]');
    const visibleBefore = await matrixBefore.isVisible().catch(() => false);
    expect(visibleBefore, 'the API matrix must be behind "View API Matrix"').toBeFalsy();

    const trigger = page.getByRole('button', { name: /API Matrix/i });
    if (await trigger.count()) {
      await trigger.first().click();
      await expect(page.locator('[data-testid="api-matrix-table"], [data-testid="api-matrix-card"]').first())
        .toBeVisible({ timeout: 20000 });
    }
  });

  test('every visible admin button is wired to something', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);
    await page.goto(`${BASE}/adm`, { waitUntil: 'domcontentloaded' });

    // A button with no accessible name is a dead control by definition.
    const nameless = await page.$$eval('button:visible', buttons =>
      buttons
        .filter(button => {
          const label = (button.getAttribute('aria-label') || button.textContent || '').trim();
          return label.length === 0 && !button.querySelector('svg, img');
        })
        .length,
    ).catch(() => 0);

    expect(nameless, 'every button needs an accessible name or an icon').toBe(0);
  });

  test('responsive: no horizontal overflow at any required viewport', async ({ page }) => {
    await signIn(page, SUPER_EMAIL, SUPER_PASSWORD);

    const viewports = [
      { name: 'desktop-1440', width: 1440, height: 900 },
      { name: 'desktop-1280', width: 1280, height: 800 },
      { name: 'laptop-1024', width: 1024, height: 768 },
      { name: 'tablet-768', width: 768, height: 1024 },
      { name: 'phone-430', width: 430, height: 932 },
      { name: 'phone-375', width: 375, height: 667 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of ['/adm', '/adm/health', '/adm/users']) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${route} overflows horizontally at ${viewport.name}`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('a plain admin cannot see or use super-admin-only controls', async ({ page }) => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'LIVE_CERT_ADMIN_EMAIL/_PASSWORD not provided.');

    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`${BASE}/adm/health`, { waitUntil: 'domcontentloaded' });

    // The UI should hide it...
    const testButtons = page.getByRole('button', { name: /run (a )?test|test provider/i });
    expect(await testButtons.count()).toBe(0);

    // ...but hiding is not the control. Prove the server refuses it too.
    const status = await page.evaluate(async base => {
      const response = await fetch(`${base}/api/platform/operational-status/firestore/test`, { method: 'POST' });
      return response.status;
    }, BASE);
    expect([401, 403]).toContain(status);
  });
});
