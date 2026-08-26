// @ts-check
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import { createSuperAdminFixtureBackend, installAuthenticatedSession, installSuperAdminSession, seedSuperAdminState, viteFixtureDefines } from './helpers/superadmin-fixture.mjs';

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

/**
 * Boots /adm against the deterministic fixture backend. Every assertion in this
 * file drives the real UI — clicking rows, typing into filters, pressing keys —
 * rather than asserting that a component exists.
 */
async function bootHealth(page, { path = '/adm/health', session = installSuperAdminSession, state } = {}) {
  const seeded = state || seedSuperAdminState();
  const backend = createSuperAdminFixtureBackend(seeded);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await session(page);
  await page.route('**/api/**', backend);
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
  return { state: seeded, pageErrors };
}

test('nav exposes Platform Health as a visible item and navigates to the console', async ({ page }) => {
  const { pageErrors } = await bootHealth(page, { path: '/adm/dashboard' });
  await page.waitForSelector('text=Super Admin', { timeout: 30_000 });

  const navItem = page.getByRole('link', { name: /Platform Health/ }).first();
  await expect(navItem).toBeVisible();

  await navItem.click();
  await expect(page).toHaveURL(/\/adm\/health/);
  await expect(page.getByRole('heading', { name: 'Platform Health', level: 1 })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('nav health indicator reflects the backend indicator, not a local assumption', async ({ page }) => {
  await bootHealth(page, { path: '/adm/dashboard' });
  await page.waitForSelector('text=Super Admin', { timeout: 30_000 });

  const dot = page.getByTestId('sidebar-health-indicator');
  await expect(dot).toBeVisible();
  // The fixture reports a red indicator; the dot must not claim green.
  await expect(dot).toHaveAttribute('data-indicator', 'red');
  await expect(dot).toHaveAttribute('aria-label', /critical|attention/i);
});

test('dashboard renders every backend state and never invents a healthy one', async ({ page }) => {
  const { pageErrors } = await bootHealth(page);
  await expect(page.getByRole('heading', { name: 'Platform Health', level: 1 })).toBeVisible();

  // Overall verdict comes from the snapshot summary.
  await expect(page.getByText('A critical platform service is unavailable').first()).toBeVisible();

  const rows = page.getByTestId('health-service-row');
  await expect(rows).toHaveCount(8);

  const expectations = [
    ['backend-api', 'OPERATIONAL'],
    ['email-smtp', 'DEGRADED'],
    ['enterprise-tenancy', 'UNAVAILABLE'],
    ['payments-paypal', 'DISABLED'],
    ['github-oauth', 'NOT_CONFIGURED'],
    ['twilio-sms', 'NOT_SUPPORTED'],
    ['dlq', 'UNKNOWN'],
  ];
  for (const [id, state] of expectations) {
    const row = page.locator(`[data-service-id="${id}"]`);
    await expect(row).toHaveAttribute('data-service-state', state);
  }

  // A disabled provider must never be presented as healthy.
  const paypalRow = page.locator('[data-service-id="payments-paypal"]');
  await expect(paypalRow).not.toContainText(/Operational/i);
  expect(pageErrors).toEqual([]);
});

test('summary tiles filter the service list by real state', async ({ page }) => {
  await bootHealth(page);
  await expect(page.getByTestId('health-service-row')).toHaveCount(8);

  await page.locator('[data-testid="health-summary-tile"][data-state="UNAVAILABLE"]').click();
  await expect(page.getByTestId('health-service-row')).toHaveCount(1);
  await expect(page.locator('[data-service-id="enterprise-tenancy"]')).toBeVisible();

  // Clicking the active tile clears the filter.
  await page.locator('[data-testid="health-summary-tile"][data-state="UNAVAILABLE"]').click();
  await expect(page.getByTestId('health-service-row')).toHaveCount(8);
});

test('search and the needs-attention filter narrow the inventory', async ({ page }) => {
  await bootHealth(page);
  await page.getByRole('button', { name: 'Needs attention' }).click();
  // DEGRADED + UNAVAILABLE + UNKNOWN
  await expect(page.getByTestId('health-service-row')).toHaveCount(3);

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByPlaceholder('Search services…').fill('paypal');
  await expect(page.getByTestId('health-service-row')).toHaveCount(1);
  await expect(page.locator('[data-service-id="payments-paypal"]')).toBeVisible();

  await page.getByPlaceholder('Search services…').fill('nothing-matches-this');
  await expect(page.getByText('No services match this filter')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByTestId('health-service-row')).toHaveCount(8);
});

test('clicking a degraded service opens a detail panel with reason, impact and remediation', async ({ page }) => {
  await bootHealth(page);
  await page.locator('[data-service-id="email-smtp"]').click();

  const panel = page.getByTestId('health-detail-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Email (SMTP)' })).toBeVisible();
  await expect(panel).toContainText('Why this state');
  await expect(panel).toContainText('fallback transport is carrying delivery');
  await expect(panel).toContainText('Transactional email');
  await expect(panel).toContainText('POST /api/email/send');
  await expect(panel).toContainText('Verify the primary SMTP credentials');
  await expect(panel).toContainText('PROVIDER_ERROR');

  // Deep link is reflected in the URL so the panel is shareable.
  await expect(page).toHaveURL(/service=email-smtp/);
});

test('detail panel closes with Escape and with the close button', async ({ page }) => {
  await bootHealth(page);
  await page.locator('[data-service-id="email-smtp"]').click();
  await expect(page.getByTestId('health-detail-panel')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('health-detail-panel')).toHaveCount(0);

  await page.locator('[data-service-id="firestore"]').click();
  await expect(page.getByTestId('health-detail-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Close service detail' }).click();
  await expect(page.getByTestId('health-detail-panel')).toHaveCount(0);
});

test('deep link ?service= opens the matching panel directly', async ({ page }) => {
  await bootHealth(page, { path: '/adm/health?service=enterprise-tenancy' });
  const panel = page.getByTestId('health-detail-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Enterprise Tenancy' })).toBeVisible();
  await expect(panel).toContainText('did not answer its readiness probe');

  // Affected admin modules are real deep links.
  await expect(panel.getByRole('link', { name: /\/adm\/tenants/ })).toBeVisible();
});

test('super admin can run a safe provider test and see the real result', async ({ page }) => {
  await bootHealth(page, { path: '/adm/health?service=firestore' });
  const panel = page.getByTestId('health-detail-panel');
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: /Run safe provider test/ }).click();
  await expect(panel.getByText('Test passed')).toBeVisible();
  await expect(panel.getByText('Fixture probe succeeded in 31ms.')).toBeVisible();
});

test('a service without a safe test says so instead of offering a dead button', async ({ page }) => {
  await bootHealth(page, { path: '/adm/health?service=payments-paypal' });
  const panel = page.getByTestId('health-detail-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('No safe automated test exists for this service');
  await expect(panel.getByRole('button', { name: /Run safe provider test/ })).toHaveCount(0);
});

test('an unreadable audit trail is reported, never inferred as empty-but-fine', async ({ page }) => {
  await bootHealth(page, { path: '/adm/health?service=dlq' });
  const panel = page.getByTestId('health-detail-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Audit trail unavailable — no events are inferred');
});

test('View API Matrix loads the endpoint table and filters interactively', async ({ page }) => {
  await bootHealth(page);
  await page.getByRole('button', { name: 'View API Matrix' }).click();

  await expect(page.getByRole('heading', { name: 'API Health Matrix' })).toBeVisible();
  await expect(page.getByTestId('api-matrix-row')).toHaveCount(6);

  // Search by path.
  await page.getByPlaceholder('Search endpoint path or dependency…').fill('paypal');
  await expect(page.getByTestId('api-matrix-row')).toHaveCount(1);
  await page.getByPlaceholder('Search endpoint path or dependency…').fill('');

  // Filter by operational state.
  await page.getByLabel('Filter by operational state').selectOption('DEGRADED');
  await expect(page.getByTestId('api-matrix-row')).toHaveCount(1);
  await expect(page.getByTestId('api-matrix-row')).toContainText('/api/email/send');
  await page.getByLabel('Filter by operational state').selectOption('all');

  // Filter by module.
  await page.getByLabel('Filter by module').selectOption('auth');
  await expect(page.getByTestId('api-matrix-row')).toHaveCount(1);
  await page.getByLabel('Filter by module').selectOption('all');

  // Filter by auth requirement.
  await page.getByLabel('Filter by authentication').selectOption('ADMIN');
  await expect(page.getByTestId('api-matrix-row')).toHaveCount(2);
  await page.getByLabel('Filter by authentication').selectOption('all');

  // External-dependency-only.
  await page.getByLabel('Only endpoints with an external dependency').check();
  await expect(page.getByTestId('api-matrix-row')).toHaveCount(3);
  await page.getByLabel('Only endpoints with an external dependency').uncheck();

  // No filter combination may produce a fabricated row.
  await page.getByPlaceholder('Search endpoint path or dependency…').fill('zzz-no-such-route');
  await expect(page.getByText('No endpoints match these filters')).toBeVisible();
});

test('matrix dependency cell opens the owning service detail panel', async ({ page }) => {
  await bootHealth(page);
  await page.getByRole('button', { name: 'View API Matrix' }).click();
  await page.getByRole('button', { name: 'SMTP relay' }).first().click();

  const panel = page.getByTestId('health-detail-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Email (SMTP)' })).toBeVisible();
});

test('matrix counts reconcile with the endpoint rows and never claim 100% operational', async ({ page }) => {
  const { state } = await bootHealth(page);
  await page.getByRole('button', { name: 'View API Matrix' }).click();

  const matrix = state.operational.apiMatrix;
  await expect(page.getByText('Endpoints checked')).toBeVisible();
  const checked = page.locator('dt', { hasText: 'Endpoints checked' }).locator('xpath=following-sibling::dd[1]');
  await expect(checked).toHaveText(String(matrix.total));

  const degraded = page.locator('dt', { hasText: 'Degraded' }).locator('xpath=following-sibling::dd[1]');
  await expect(degraded).toHaveText(String(matrix.degraded));
  expect(matrix.degraded).toBeGreaterThan(0);

  const unavailable = page.locator('dt', { hasText: 'Unavailable' }).first().locator('xpath=following-sibling::dd[1]');
  await expect(unavailable).toHaveText(String(matrix.unavailable));
});

test('manual refresh re-collects from the backend and advances Last checked', async ({ page }) => {
  const { state } = await bootHealth(page);
  await expect(page.getByRole('heading', { name: 'Platform Health', level: 1 })).toBeVisible();
  const before = state.healthRefreshCount || 0;

  await page.getByRole('button', { name: 'Refresh' }).first().click();
  await expect.poll(() => state.healthRefreshCount || 0).toBeGreaterThan(before);
});

test('auto-refresh is opt-in and off by default so production is not hammered', async ({ page }) => {
  await bootHealth(page);
  const toggle = page.getByRole('checkbox', { name: /Auto-refresh/ });
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
});

test('a failing collector surfaces an explicit error instead of a green dashboard', async ({ page }) => {
  const state = seedSuperAdminState();
  const backend = createSuperAdminFixtureBackend(state);
  await installSuperAdminSession(page);
  await page.route('**/api/**', async route => {
    if (new URL(route.request().url()).pathname === '/api/platform/operational-status') {
      return route.fulfill({ status: 503, json: { error: { code: 'HEALTH_SNAPSHOT_UNAVAILABLE', message: 'Operational status could not be collected' } } });
    }
    return backend(route);
  });
  await page.goto(`${base}/adm/health`, { waitUntil: 'domcontentloaded' });

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Operational status could not be collected');
  await expect(alert).toContainText('No status is inferred while the collector is unreachable');
  // Critically: nothing claims the platform is healthy.
  await expect(page.getByText('All critical services operational')).toHaveCount(0);
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('a non-super-admin operator sees status but cannot run provider tests', async ({ page }) => {
  await bootHealth(page, {
    path: '/adm/health?service=firestore',
    session: p => installAuthenticatedSession(p, {
      uid: 'ops-admin',
      email: 'admin@example.com',
      displayName: 'Ops Admin',
      claims: { role: 'ADMIN' },
    }),
  });

  const panel = page.getByTestId('health-detail-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Firestore' })).toBeVisible();
  await expect(panel).toContainText('requires the SUPER_ADMIN role');
  await expect(panel.getByRole('button', { name: /Run safe provider test/ })).toHaveCount(0);
});

test('no secret-shaped value is ever rendered on the health console', async ({ page }) => {
  await bootHealth(page);
  await page.getByRole('button', { name: 'View API Matrix' }).click();
  const body = (await page.locator('body').innerText()).toLowerCase();
  for (const forbidden of ['secret', 'api key', 'apikey', 'private key', 'password', 'client_secret', 'bearer ', 'sk_live', 'sk_test']) {
    expect(body).not.toContain(forbidden);
  }
});

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'phone-430', width: 430, height: 932 },
  { name: 'phone-375', width: 375, height: 667 },
];

for (const viewport of VIEWPORTS) {
  test(`no horizontal overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await bootHealth(page);
    await expect(page.getByRole('heading', { name: 'Platform Health', level: 1 })).toBeVisible();

    const overflowServices = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowServices).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'View API Matrix' }).click();
    await expect(page.getByRole('heading', { name: 'API Health Matrix' })).toBeVisible();
    const overflowMatrix = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowMatrix).toBeLessThanOrEqual(1);

    // Dense tables must become cards on small screens.
    if (viewport.width < 768) {
      await expect(page.getByTestId('api-matrix-card').first()).toBeVisible();
      await expect(page.getByTestId('api-matrix-table')).toBeHidden();
    } else {
      await expect(page.getByTestId('api-matrix-table')).toBeVisible();
    }

    // The detail drawer must fit and stay scrollable, not overflow the modal.
    await page.getByRole('button', { name: 'Services' }).click();
    await page.locator('[data-service-id="email-smtp"]').click();
    const panel = page.getByTestId('health-detail-panel');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
    const overflowPanel = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowPanel).toBeLessThanOrEqual(1);
  });
}

test('the console is keyboard reachable and exposes accessible names', async ({ page }) => {
  await bootHealth(page);
  await expect(page.getByRole('heading', { name: 'Platform Health', level: 1 })).toBeVisible();

  // Service rows carry a descriptive accessible name including their state.
  const row = page.locator('[data-service-id="email-smtp"]');
  await expect(row).toHaveAttribute('aria-label', /Email \(SMTP\): Degraded\. Open details/);

  // Opening via keyboard works and the dialog is announced as modal.
  await row.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByTestId('health-detail-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('aria-modal', 'true');
  await expect(panel).toHaveAttribute('aria-label', /Email \(SMTP\) operational detail/);

  // Focus lands inside the dialog rather than being left behind it.
  const focusedInDialog = await page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="health-detail-panel"]');
    return Boolean(dialog && document.activeElement && dialog.contains(document.activeElement));
  });
  expect(focusedInDialog).toBe(true);
});

test('command center and attention deep-link into Platform Health per item', async ({ page }) => {
  await bootHealth(page, { path: '/adm/dashboard' });
  await page.waitForSelector('text=Super Admin', { timeout: 30_000 });

  await expect(page.getByRole('heading', { name: 'Operational status' })).toBeVisible();
  await page.getByRole('link', { name: /Enterprise Tenancy/ }).first().click();
  await expect(page).toHaveURL(/\/adm\/health\?service=enterprise-tenancy/);
  await expect(page.getByTestId('health-detail-panel')).toBeVisible();
});

test('attention page shows the live operational verdict and links to the console', async ({ page }) => {
  await bootHealth(page, { path: '/adm/attention' });
  await expect(page.getByRole('heading', { name: 'Attention' })).toBeVisible();
  await expect(page.getByText('Open Platform Health')).toBeVisible();
  await page.getByRole('link', { name: /Open Platform Health/ }).click();
  await expect(page).toHaveURL(/\/adm\/health/);
});
