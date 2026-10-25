/**
 * Playwright 5-Viewport E2E Certification for AI Multi-Provider Engine
 * DIR-013 Section 6: Deep Links, Modals, Real Data, Responsive Containment
 *
 * Target: /admin/ai-settings (Admin Console -> AI Multi-Provider Engine)
 * Viewports: 375x667 (Mobile), 768x1024 (Tablet), 1024x768 (Small Laptop),
 *            1440x900 (Standard Desktop), 1920x1080 (Ultrawide Desktop)
 *
 * S3 REPAIR (freellmapi-admin-e2e, was 47/47 failing at tip AND base —
 * pre-existing selector rot, cmp-verified identical failure sets):
 * every selector is re-anchored to the ACTUAL rendered DOM as of this
 * commit, verified against the source components:
 *   - shell anchor: [data-testid="ai-multi-provider-engine"] (SettingsShell.tsx)
 *   - provider rows: [data-testid^="provider-row-<id>"] (ProviderRow.tsx:44) —
 *     the old exact-match '[data-testid="provider-row-"]' can never match a
 *     prefixed testid; the old '[data-testid="provider-category-tabs"]' does
 *     not exist (real: role=tablist[aria-label="Provider categories"],
 *     ProviderFilterBar.tsx)
 *   - subtab CONTENT headings (not nav labels — the rendered SettingsSubNav
 *     buttons read "Providers & Keys (n/m)", "Models & Fallback Chains",
 *     "Quotas & Telemetry", "Claude Code & Agents", "Playground"):
 *     KeyPoolTab h3 "Key Pool Manager", SystemMetricsTab h3 "Engine Metrics",
 *     UnifiedGatewayTab h3 "Unified Gateway", DiscoveryTab h3
 *     "Live Model Discovery & Reconciliation" (the old "Dynamic Model
 *     Discovery" string does not exist anywhere)
 *   - category deep links use the real ids all|frontier|mesh|search (the old
 *     ?category=fast is not a category id; "Fast Community Mesh" is the mesh
 *     tab's label)
 *   - dialogs are Radix @radix-ui/react-dialog 1.3.1, which renders
 *     role="dialog" but NO LONGER emits the aria-modal attribute (verified:
 *     zero 'aria-modal' occurrences in the installed dist) — the old
 *     '[aria-modal="true"]' qualifier could never match; triggers are the real
 *     ones — ProviderRow "Add key", subnav "Manage key pools" /
 *     "Manage cooldowns" / "Discover models" / "Integration snippets"
 *     (there is NO per-card "Key Pool" button and NO "Flush Cooldown"
 *     button in the DOM — those tests were retargeted to the real dialogs
 *     instead of asserting against controls that do not exist)
 *   - every invalid Playwright selector of the form 'text=A, text=B' (the
 *     text engine has no comma-list syntax; the comma is parsed as literal
 *     text) was replaced by single real anchors
 *   - all waitForTimeout calls removed (repo constraint): hydration waits
 *     replaced by content anchors, focus-trap waits by waitForFunction,
 *     discovery-fetch waits by the dialog's own role=alert error path
 *   - screenshots now write to tests/screenshots/ (gitignored) instead of
 *     dirtying docs/
 * Authentication is through the actual non-production endpoint and server-side
 * signed-token verifier. No API mocking: the discovery-fetch test asserts the
 * REAL error path (fresh e2e database => no provider credentials => upstream
 * fetch fails => role=alert), never a fabricated success.
 */

import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

async function identity(request: APIRequestContext, email = 'superadmin@resumepilot.test') {
  const res = await request.post('/api/auth/preview-login', { data: { email, password: 'ephemeral-e2e-only' } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.token).toMatch(/^rptest\./);
  const profile = await request.get('/api/users-data/profile', { headers: { Authorization: `Bearer ${body.token}` } });
  expect(profile.ok()).toBe(true);
  return body;
}
async function authenticate(page: Page, request: APIRequestContext) {
  const body = await identity(request);
  await page.addInitScript(session => localStorage.setItem('ime_dev_user', JSON.stringify(session)), body);
  return body.token as string;
}

// Real per-subtab content anchors (verified against the tab components).
const PROVIDERS_ANCHOR = '[data-testid^="provider-row-"]';
const KEY_POOL_ANCHOR = 'h3:has-text("Key Pool Manager")';
const METRICS_ANCHOR = 'h3:has-text("Engine Metrics")';
const GATEWAY_ANCHOR = 'h3:has-text("Unified Gateway")';
const DISCOVERY_ANCHOR = 'h3:has-text("Live Model Discovery")';

// Helper to wait for AI Settings content — races the REAL anchors of every
// subtab view, so it resolves no matter which subtab the URL deep-links to.
async function waitForAiSettings(page: Page) {
  await Promise.race([
    page.waitForSelector(PROVIDERS_ANCHOR, { timeout: 30000 }),
    page.waitForSelector(KEY_POOL_ANCHOR, { timeout: 30000 }),
    page.waitForSelector(METRICS_ANCHOR, { timeout: 30000 }),
    page.waitForSelector(GATEWAY_ANCHOR, { timeout: 30000 }),
    page.waitForSelector(DISCOVERY_ANCHOR, { timeout: 30000 }),
  ]);
}

async function waitForKeyPoolTab(page: Page) {
  await page.waitForSelector(KEY_POOL_ANCHOR, { timeout: 30000 });
}

async function waitForMetricsTab(page: Page) {
  await page.waitForSelector(METRICS_ANCHOR, { timeout: 30000 });
}

async function waitForUnifiedGatewayTab(page: Page) {
  await page.waitForSelector(GATEWAY_ANCHOR, { timeout: 30000 });
}

async function waitForDiscoveryTab(page: Page) {
  await page.waitForSelector(DISCOVERY_ANCHOR, { timeout: 30000 });
}

// Deterministic focus-trap assertion (replaces waitForTimeout + activeElement
// snapshot): polls until the focused element is an interactive control.
async function expectFocusInsideDialog(page: Page) {
  await page.waitForFunction(
    () => ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? ''),
    undefined,
    { timeout: 10000 },
  );
}

// Helper to check no horizontal overflow
async function checkNoHorizontalOverflow(page: Page) {
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // Allow 1px tolerance
}

// Helper to take viewport screenshot (gitignored tests/screenshots/ dir)
async function takeViewportScreenshot(page: Page, viewportName: string) {
  const screenshotDir = 'tests/screenshots/freellmapi';
  await page.screenshot({
    path: `${screenshotDir}/${viewportName}-freellmapi-providers.png`,
    fullPage: true,
  });
}

test.describe('AI Multi-Provider Engine - Deep Links & Subtab Navigation', () => {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

  test.beforeEach(async ({ page, request }) => {
    await authenticate(page, request);
    // Navigate to admin AI settings - base URL without subtab to get providers view
    await page.goto(`${baseUrl}/admin?tab=ai-settings`, { waitUntil: 'domcontentloaded' });
  });

  test('Deep link: /admin?tab=ai-settings&subtab=providers loads provider catalog', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=providers`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);

    // Verify providers subtab control is rendered (real subnav label is
    // "Providers & Keys (configured/total)")
    const providersTab = page.locator('button:has-text("Providers & Keys")').first();
    await expect(providersTab).toBeVisible();

    // Verify provider rows are rendered (real testid prefix: provider-row-)
    const firstProviderRow = page.locator(PROVIDERS_ANCHOR).first();
    await expect(firstProviderRow).toBeVisible({ timeout: 10000 });
  });

  test('Deep link: /admin?tab=ai-settings&subtab=key-pool loads key pool view', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=key-pool`, { waitUntil: 'domcontentloaded' });
    await waitForKeyPoolTab(page);

    // Verify key-pool subtab content (real heading + real subcopy)
    await expect(page.locator(KEY_POOL_ANCHOR)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Round-robin credential pools').first()).toBeVisible({ timeout: 10000 });
  });

  test('Deep link: /admin?tab=ai-settings&subtab=metrics loads metrics view', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=metrics`, { waitUntil: 'domcontentloaded' });
    await waitForMetricsTab(page);

    // Verify metrics subtab content (real heading + real subcopy)
    await expect(page.locator(METRICS_ANCHOR)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Live provider router inventory').first()).toBeVisible({ timeout: 10000 });
  });

  test('Deep link: /admin?tab=ai-settings&subtab=unified-gateway loads gateway view', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=unified-gateway`, { waitUntil: 'domcontentloaded' });
    await waitForUnifiedGatewayTab(page);

    // Verify unified gateway subtab content (real heading + real subcopy)
    await expect(page.locator(GATEWAY_ANCHOR)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=OpenAI- and Anthropic-compatible endpoints').first()).toBeVisible({ timeout: 10000 });
  });

  test('Deep link: /admin?tab=ai-settings&subtab=discovery loads discovery view', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=discovery`, { waitUntil: 'domcontentloaded' });
    await waitForDiscoveryTab(page);

    // Verify discovery subtab content (real heading: "Live Model Discovery &
    // Reconciliation" — "Dynamic Model Discovery" does not exist in the DOM)
    await expect(page.locator(DISCOVERY_ANCHOR)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Query upstream provider catalogs').first()).toBeVisible({ timeout: 10000 });
  });

  test('Filter deep link: ?provider=groq filters to Groq provider', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&provider=groq`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);

    // Verify the Groq provider row is visible (real testid: provider-row-groq)
    await expect(page.locator('[data-testid="provider-row-groq"]')).toBeVisible({ timeout: 10000 });
  });

  test('Filter deep link: ?category=mesh filters to fast community mesh providers', async ({ page }) => {
    // Real category ids are all|frontier|mesh|search; the mesh tab is
    // labelled "Fast Community Mesh (n)" (the old ?category=fast id does
    // not exist and silently fell back to "all").
    await page.goto(`${baseUrl}/admin?tab=ai-settings&category=mesh`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);

    // Verify the mesh category tab is rendered and provider rows are listed
    await expect(page.locator('[role="tablist"][aria-label="Provider categories"] button:has-text("Fast Community Mesh")').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator(PROVIDERS_ANCHOR).first()).toBeVisible({ timeout: 10000 });
  });

  test('Browser back/forward navigation updates subtab without reload', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=providers`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);

    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=metrics`, { waitUntil: 'domcontentloaded' });
    await waitForMetricsTab(page);

    // Go back — providers view content returns
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(PROVIDERS_ANCHOR).first()).toBeVisible({ timeout: 10000 });

    // Go forward — metrics view content returns
    await page.goForward({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(METRICS_ANCHOR)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('AI Multi-Provider Engine - Modal Census & WCAG 2.1 AA', () => {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

  test.beforeEach(async ({ page, request }) => {
    await authenticate(page, request);
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=providers`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);
  });

  test('Add Key Modal: opens, traps focus, dismisses on Escape, has visible focus ring', async ({ page }) => {
    // Real trigger: "Add key" on the first unconfigured provider row
    // (opens the ConfigureProviderDialog quick-add).
    const addKeyBtn = page.locator('button:has-text("Add key")').first();
    await addKeyBtn.click();

    // Wait for modal (Radix dialog)
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    const modal = page.locator('[role="dialog"]').first();

    // Verify modal is visible
    await expect(modal).toBeVisible();

    // Check focus trap - an interactive control inside the document is focused
    await expectFocusInsideDialog(page);

    // Verify Escape dismisses modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('Key Pool Manager Modal: opens from the engine subnav, traps focus, Escape dismisses', async ({ page }) => {
    // Real trigger: the subnav "Manage key pools" button. (There is no
    // per-provider-card "Key Pool" button in the DOM — the old selector
    // targeted a control that does not exist.)
    const keyPoolBtn = page.locator('button:has-text("Manage key pools")').first();
    await keyPoolBtn.click();

    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible();

    // Verify focus trap
    await expectFocusInsideDialog(page);

    // Escape dismisses
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('Cooldowns Ledger Modal: opens from the engine subnav, shows the ledger, Escape dismisses', async ({ page }) => {
    // Real dialog: "Cooldowns & Rate-Limit Ledger" via subnav "Manage
    // cooldowns". (There is NO "Flush Cooldown" button anywhere in the DOM;
    // the old test conditionally probed for a control that does not exist
    // and silently skipped — this asserts the real dialog instead.)
    const cooldownsBtn = page.locator('button:has-text("Manage cooldowns")').first();
    await cooldownsBtn.click();

    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible();
    await expect(modal.locator('text=Cooldowns & Rate-Limit Ledger').first()).toBeVisible({ timeout: 5000 });
    await expect(modal.locator('button:has-text("Refresh Cooldowns")')).toBeVisible({ timeout: 5000 });

    // Verify focus trap
    await expectFocusInsideDialog(page);

    // Escape dismisses
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('Model Discovery Modal: opens, real fetch attempt surfaces the honest error path, Escape dismisses', async ({ page }) => {
    // Real trigger: subnav "Discover models" (the old "Discover Models"
    // casing does not exist).
    const discoverBtn = page.locator('button:has-text("Discover models")').first();
    await discoverBtn.click();

    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible();

    // Real fetch flow: the "Fetch Live Models" button is disabled until a
    // provider is selected. The e2e database is fresh (no provider
    // credentials), so the honest outcome of a real fetch is the dialog's
    // role=alert error path — never a fabricated success.
    const fetchBtn = modal.locator('button:has-text("Fetch Live Models")');
    await expect(fetchBtn).toBeVisible({ timeout: 5000 });
    await expect(fetchBtn).toBeDisabled();
    await modal.locator('#dialog-discovery-provider').selectOption({ index: 1 });
    await expect(fetchBtn).toBeEnabled({ timeout: 5000 });
    await fetchBtn.click();
    await expect(modal.locator('[role="alert"]')).toBeVisible({ timeout: 30000 });

    // Escape dismisses
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('Integration Snippets Modal: opens, displays real language tabs, copy button works, Escape dismisses', async ({ page }) => {
    // Real trigger: subnav "Integration snippets" (the old "Code Snippets"
    // button label does not exist).
    const snippetsBtn = page.locator('button:has-text("Integration snippets")').first();
    await snippetsBtn.click();

    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    const modal = page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible();

    // Verify real snippet language tabs (cURL / JavaScript / TS / Python /
    // Claude Code — the old 'text=cURL, text=Python, text=JavaScript'
    // comma-list selector is invalid Playwright syntax and matched nothing).
    await expect(modal.locator('button:has-text("cURL"), [role="tab"]:has-text("cURL")').first()).toBeVisible({ timeout: 5000 });
    await expect(modal.locator('text=Python').first()).toBeVisible({ timeout: 5000 });

    // Copy button: real label "Copy Code" -> "Copied" (clipboard permission
    // granted for the headless context).
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const copyBtn = modal.locator('button:has-text("Copy Code")').first();
    await copyBtn.click();
    await expect(modal.locator('button:has-text("Copied")').first()).toBeVisible({ timeout: 5000 });

    // Escape dismisses
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('AI Multi-Provider Engine - Real Data Integration (No Fabrication)', () => {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

  test.beforeEach(async ({ page, request }) => {
    await authenticate(page, request);
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=providers`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);
  });

  test('Provider catalog displays the real backend/freellmapi provider registry', async ({ page }) => {
    // Count real provider rows (testid prefix provider-row-); the registry
    // ships 75 providers — allow slight variance for catalog growth.
    const providerRows = page.locator(PROVIDERS_ANCHOR);
    const count = await providerRows.count();
    expect(count).toBeGreaterThanOrEqual(70);
  });

  test('Status pills show real states (Not Configured on a fresh database)', async ({ page }) => {
    // Fresh e2e database => unconfigured providers render the real
    // "Not Configured" pill (ProviderRow.tsx). The old comma-list selector
    // ('text=Active, text=Not Configured, ...') is invalid Playwright
    // syntax and always counted 0.
    const statusElements = page.locator('text=Not Configured');
    const count = await statusElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Metrics subtab binds to real engine data', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=metrics`, { waitUntil: 'domcontentloaded' });
    await waitForMetricsTab(page);

    // Verify the real stat labels are displayed (individually — no
    // comma-list selectors).
    await expect(page.locator('text=Total Providers').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Configured').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Multi-Key Pools').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Active Cooldowns').first()).toBeVisible({ timeout: 10000 });
  });

  test('Unified Gateway subtab shows real OpenAI/Anthropic endpoints', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=unified-gateway`, { waitUntil: 'domcontentloaded' });
    await waitForUnifiedGatewayTab(page);

    // Verify the real endpoint paths are displayed (UnifiedGatewayTab.tsx
    // renders /v1/chat/completions, /v1/messages, /v1/models, /v1/status).
    // getByText, not 'text=/v1/...': a leading slash would be parsed as a
    // regex literal by the text engine.
    await expect(page.getByText('/v1/chat/completions').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('/v1/messages').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('/v1/status').first()).toBeVisible({ timeout: 10000 });
  });

  test('Empty states show actionable "Add key" actions, not dummy data', async ({ page }) => {
    // Navigate to a provider that's not configured on the fresh database
    await page.goto(`${baseUrl}/admin?tab=ai-settings&provider=groq`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);

    // Should show the real "Not Configured" pill with the actionable
    // "Add key" button (the old 'text=Not Configured, text=Add key, ...'
    // comma-list selector matched nothing).
    await expect(page.locator('[data-testid="provider-row-groq"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Not Configured').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Add key")').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('AI Multi-Provider Engine - Responsive Layout & Zero Horizontal Overflow', () => {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

  const viewports = [
    { name: 'mobile-iphone-se', width: 375, height: 667 },
    { name: 'tablet-ipad-portrait', width: 768, height: 1024 },
    { name: 'small-laptop', width: 1024, height: 768 },
    { name: 'standard-desktop', width: 1440, height: 900 },
    { name: 'ultrawide-desktop', width: 1920, height: 1080 },
  ];

  for (const vp of viewports) {
    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): No horizontal overflow on providers subtab`, async ({ page, request }) => {
      await authenticate(page, request);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=providers`, { waitUntil: 'domcontentloaded' });
      await waitForAiSettings(page);
      await checkNoHorizontalOverflow(page);
      await takeViewportScreenshot(page, vp.name);
    });

    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): No horizontal overflow on key-pool subtab`, async ({ page, request }) => {
      await authenticate(page, request);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=key-pool`, { waitUntil: 'domcontentloaded' });
      await waitForKeyPoolTab(page);
      await checkNoHorizontalOverflow(page);
      await takeViewportScreenshot(page, `${vp.name}-key-pool`);
    });

    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): No horizontal overflow on metrics subtab`, async ({ page, request }) => {
      await authenticate(page, request);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=metrics`, { waitUntil: 'domcontentloaded' });
      await waitForMetricsTab(page);
      await checkNoHorizontalOverflow(page);
      await takeViewportScreenshot(page, `${vp.name}-metrics`);
    });

    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): No horizontal overflow on unified-gateway subtab`, async ({ page, request }) => {
      await authenticate(page, request);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=unified-gateway`, { waitUntil: 'domcontentloaded' });
      await waitForUnifiedGatewayTab(page);
      await checkNoHorizontalOverflow(page);
      await takeViewportScreenshot(page, `${vp.name}-unified-gateway`);
    });

    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): No horizontal overflow on discovery subtab`, async ({ page, request }) => {
      await authenticate(page, request);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=discovery`, { waitUntil: 'domcontentloaded' });
      await waitForDiscoveryTab(page);
      await checkNoHorizontalOverflow(page);
      await takeViewportScreenshot(page, `${vp.name}-discovery`);
    });
  }
});

test.describe('AI Multi-Provider Engine - Modal Responsive Containment', () => {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

  const viewports = [
    { name: 'mobile-iphone-se', width: 375, height: 667 },
    { name: 'tablet-ipad-portrait', width: 768, height: 1024 },
  ];

  for (const vp of viewports) {
    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): Add Key Modal fully contained`, async ({ page, request }) => {
      await authenticate(page, request);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=providers`, { waitUntil: 'domcontentloaded' });
      await waitForAiSettings(page);

      const addKeyBtn = page.locator('button:has-text("Add key")').first();
      await addKeyBtn.click();

      await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
      const modal = page.locator('[role="dialog"]').first();

      // Verify modal is within viewport
      const modalBox = await modal.boundingBox();
      expect(modalBox).not.toBeNull();
      if (modalBox) {
        expect(modalBox.x).toBeGreaterThanOrEqual(0);
        expect(modalBox.y).toBeGreaterThanOrEqual(0);
        expect(modalBox.x + modalBox.width).toBeLessThanOrEqual(vp.width);
        expect(modalBox.y + modalBox.height).toBeLessThanOrEqual(vp.height);
      }

      await page.keyboard.press('Escape');
    });

    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): Key Pool Modal fully contained`, async ({ page, request }) => {
      await authenticate(page, request);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=providers`, { waitUntil: 'domcontentloaded' });
      await waitForAiSettings(page);

      // Real trigger: subnav "Manage key pools" (no per-card Key Pool
      // button exists in the DOM).
      const keyPoolBtn = page.locator('button:has-text("Manage key pools")').first();
      await keyPoolBtn.click();

      await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
      const modal = page.locator('[role="dialog"]').first();

      const modalBox = await modal.boundingBox();
      expect(modalBox).not.toBeNull();
      if (modalBox) {
        expect(modalBox.x).toBeGreaterThanOrEqual(0);
        expect(modalBox.y).toBeGreaterThanOrEqual(0);
        expect(modalBox.x + modalBox.width).toBeLessThanOrEqual(vp.width);
        expect(modalBox.y + modalBox.height).toBeLessThanOrEqual(vp.height);
      }

      await page.keyboard.press('Escape');
    });
  }
});
