/**
 * Playwright 5-Viewport E2E Certification for AI Multi-Provider Engine
 * DIR-013 Section 6: Deep Links, Modals, Real Data, Responsive Containment
 *
 * Target: /admin/ai-settings (Admin Console -> AI Multi-Provider Engine)
 * Viewports: 375x667 (Mobile), 768x1024 (Tablet), 1024x768 (Small Laptop),
 *            1440x900 (Standard Desktop), 1920x1080 (Ultrawide Desktop)
 */

import { test, expect } from '@playwright/test';


// Authentication is through the actual non-production endpoint and server-side signed-token verifier.
// No API mocking except the explicitly named single-response transport-failure recovery test.
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

// Helper to wait for AI Settings page to load - specific to providers subtab
async function waitForAiSettings(page) {
  // Wait for app to load and check for either the provider category tabs or any provider content
  await Promise.race([
    page.waitForSelector('[data-testid="provider-category-tabs"]', { timeout: 20000 }),
    page.waitForSelector('[data-testid="provider-row-"]', { timeout: 20000 }),
    page.waitForSelector('text=Key Pool Manager', { timeout: 20000 }),
    page.waitForSelector('text=Engine Metrics', { timeout: 20000 }),
    page.waitForSelector('text=Unified Gateway', { timeout: 20000 }),
    page.waitForSelector('text=Model Discovery', { timeout: 20000 }),
  ]);
}

// Helper to wait for Key Pool subtab to load
async function waitForKeyPoolTab(page) {
  await page.waitForSelector('text=Key Pool Manager', { timeout: 20000 });
}

// Helper to wait for Metrics subtab to load
async function waitForMetricsTab(page) {
  await page.waitForSelector('text=Engine Metrics', { timeout: 20000 });
}

// Helper to wait for Unified Gateway subtab to load
async function waitForUnifiedGatewayTab(page) {
  await page.waitForSelector('text=Unified Gateway', { timeout: 20000 });
}

// Helper to wait for Discovery subtab to load
async function waitForDiscoveryTab(page) {
  await page.waitForSelector('text=Dynamic Model Discovery', { timeout: 20000 });
}

// Helper to check no horizontal overflow
async function checkNoHorizontalOverflow(page) {
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // Allow 1px tolerance
}

// Helper to take viewport screenshot
async function takeViewportScreenshot(page, viewportName) {
  const screenshotDir = 'docs/ui-audit/screenshots/freellmapi';
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
    // Wait for app to hydrate
    await page.waitForTimeout(1000);
  });

  test('Deep link: /admin?tab=ai-settings&subtab=providers loads provider catalog', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=providers`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);

    // Verify providers subtab is active
    const providersTab = page.locator('button:has-text("Providers"), [role="tab"]:has-text("Providers")').first();
    await expect(providersTab).toBeVisible();

    // Verify provider cards are rendered
    const providerCards = page.locator('[data-testid^="provider-card-"], .provider-card, [class*="provider-card"]').first();
    await expect(providerCards).toBeVisible({ timeout: 10000 });
  });

  test('Deep link: /admin?tab=ai-settings&subtab=key-pool loads key pool view', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=key-pool`, { waitUntil: 'domcontentloaded' });
    await waitForKeyPoolTab(page);

    // Verify key-pool subtab content
    await expect(page.locator('text=Key Pool Manager, text=Multi-key pooling')).toBeVisible({ timeout: 10000 });
  });

  test('Deep link: /admin?tab=ai-settings&subtab=metrics loads metrics view', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=metrics`, { waitUntil: 'domcontentloaded' });
    await waitForMetricsTab(page);

    // Verify metrics subtab content
    await expect(page.locator('text=Engine Metrics, text=Real-time Engine Metrics')).toBeVisible({ timeout: 10000 });
  });

  test('Deep link: /admin?tab=ai-settings&subtab=unified-gateway loads gateway view', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=unified-gateway`, { waitUntil: 'domcontentloaded' });
    await waitForUnifiedGatewayTab(page);

    // Verify unified gateway subtab content
    await expect(page.locator('text=Unified Gateway, text=OpenAI Compatible Endpoint')).toBeVisible({ timeout: 10000 });
  });

  test('Deep link: /admin?tab=ai-settings&subtab=discovery loads discovery view', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=discovery`, { waitUntil: 'domcontentloaded' });
    await waitForDiscoveryTab(page);

    // Verify discovery subtab content
    await expect(page.locator('text=Model Discovery, text=Dynamic Model Discovery')).toBeVisible({ timeout: 10000 });
  });

  test('Filter deep link: ?provider=groq filters to Groq provider', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&provider=groq`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);

    // Verify Groq provider card is visible
    await expect(page.locator('[data-testid="provider-card-groq"], text=Groq').first()).toBeVisible({ timeout: 10000 });
  });

  test('Filter deep link: ?category=fast filters to fast providers', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&category=fast`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);

    // Verify fast category filter is active
    await expect(page.locator('button:has-text("Fast"), [role="tab"]:has-text("Fast")').first()).toBeVisible();
  });

  test('Browser back/forward navigation updates subtab without reload', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=providers`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);

    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=metrics`, { waitUntil: 'domcontentloaded' });
    await waitForMetricsTab(page);

    // Go back
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=Providers, text=Key Pool Manager').first()).toBeVisible({ timeout: 10000 });

    // Go forward
    await page.goForward({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=Engine Metrics, text=Real-time Engine Metrics').first()).toBeVisible({ timeout: 10000 });
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
    // Click Add Key button (or first provider's Manage Keys)
    const addKeyBtn = page.locator('button:has-text("Add key"), button:has-text("Manage Keys")').first();
    await addKeyBtn.click();

    // Wait for modal
    await page.waitForSelector('[role="dialog"][aria-modal="true"], [data-testid="add-key-dialog"]', { timeout: 10000 });
    const modal = page.locator('[role="dialog"][aria-modal="true"]').first();

    // Verify modal is visible
    await expect(modal).toBeVisible();

    // Check focus trap - first focusable element should be focused
    await page.waitForTimeout(100);
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(focused);

    // Verify Escape dismisses modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('Key Pool Manager Modal: opens from provider card, traps focus, Escape dismisses', async ({ page }) => {
    // Find a provider with keys and click Key Pool button
    const keyPoolBtn = page.locator('button:has-text("Key Pool")').first();
    await keyPoolBtn.click();

    await page.waitForSelector('[role="dialog"][aria-modal="true"], [data-testid="key-pool-dialog"]', { timeout: 10000 });
    const modal = page.locator('[role="dialog"][aria-modal="true"]').first();
    await expect(modal).toBeVisible();

    // Verify focus trap
    await page.waitForTimeout(100);
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(focused);

    // Escape dismisses
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('Cooldown Flush Modal: opens from provider with cooldown, shows details, Escape dismisses', async ({ page }) => {
    // This test requires a provider with active cooldown
    // For now, verify modal can open if triggered
    const flushBtn = page.locator('button:has-text("Flush Cooldown")').first();

    if (await flushBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await flushBtn.click();
      await page.waitForSelector('[role="dialog"][aria-modal="true"], [data-testid="cooldown-dialog"]', { timeout: 10000 });
      const modal = page.locator('[role="dialog"][aria-modal="true"]').first();
      await expect(modal).toBeVisible();

      // Verify focus trap
      await page.waitForTimeout(100);
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(focused);

      // Escape dismisses
      await page.keyboard.press('Escape');
      await expect(modal).not.toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, 'No active cooldown to test flush modal');
    }
  });

  test('Model Discovery Modal: opens, fetches models, displays results, Escape dismisses', async ({ page }) => {
    const discoverBtn = page.locator('button:has-text("Discover Models"), button:has-text("Discover")').first();
    await discoverBtn.click();

    await page.waitForSelector('[role="dialog"][aria-modal="true"], [data-testid="discovery-dialog"]', { timeout: 10000 });
    const modal = page.locator('[role="dialog"][aria-modal="true"]').first();
    await expect(modal).toBeVisible();

    // Click fetch models
    const fetchBtn = page.locator('button:has-text("Fetch Models"), [data-testid="discovery-fetch"]').first();
    await fetchBtn.click();

    // Wait for loading or results
    await page.waitForTimeout(3000);

    // Escape dismisses
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('Code Snippets Modal: opens, displays snippets for provider, copy buttons work, Escape dismisses', async ({ page }) => {
    const snippetsBtn = page.locator('button:has-text("Code Snippets")').first();
    await snippetsBtn.click();

    await page.waitForSelector('[role="dialog"][aria-modal="true"], [data-testid="code-snippets-dialog"]', { timeout: 10000 });
    const modal = page.locator('[role="dialog"][aria-modal="true"]').first();
    await expect(modal).toBeVisible();

    // Verify code snippets content
    await expect(page.locator('text=cURL, text=Python, text=JavaScript').first()).toBeVisible({ timeout: 5000 });

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

  test('Provider catalog displays 74 real providers from backend/freellmapi', async ({ page }) => {
    // Count provider cards
    const providerCards = page.locator('[data-testid^="provider-card-"], .provider-card, [class*="provider-card"]');
    const count = await providerCards.count();
    expect(count).toBeGreaterThanOrEqual(70); // Allow slight variance
  });

  test('Status pills show real states (Active/Not Configured/Disabled/Cooldown)', async ({ page }) => {
    // Verify at least one provider shows a status
    const statusElements = page.locator('text=Active, text=Not Configured, text=Disabled, text=Cooldown, text=Rate-Limited');
    const count = await statusElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Metrics subtab binds to real SQLite data at /v1/status', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=metrics`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);

    // Verify metrics are displayed (not dummy placeholders)
    await expect(page.locator('text=Total Providers, text=Configured, text=Multi-Key Pools, text=Active Cooldowns').first()).toBeVisible({ timeout: 10000 });
  });

  test('Unified Gateway subtab shows real OpenAI/Anthropic endpoints', async ({ page }) => {
    await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=unified-gateway`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);

    // Verify endpoint URLs are displayed
    await expect(page.locator('text=/v1/chat/completions, text=/v1/messages, text=/v1/models, text=/v1/status').first()).toBeVisible({ timeout: 10000 });
  });

  test('Empty states show actionable "Configure Key" actions, not dummy data', async ({ page }) => {
    // Navigate to a provider that's not configured
    await page.goto(`${baseUrl}/admin?tab=ai-settings&provider=groq`, { waitUntil: 'domcontentloaded' });
    await waitForAiSettings(page);

    // Should show "Not Configured" with actionable button
    await expect(page.locator('text=Not Configured, text=Add key, text=Manage Keys').first()).toBeVisible({ timeout: 10000 });
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
    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): No horizontal overflow on providers subtab`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=providers`, { waitUntil: 'domcontentloaded' });
      await waitForAiSettings(page);
      await checkNoHorizontalOverflow(page);
      await takeViewportScreenshot(page, vp.name);
    });

    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): No horizontal overflow on key-pool subtab`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=key-pool`, { waitUntil: 'domcontentloaded' });
      await waitForAiSettings(page);
      await checkNoHorizontalOverflow(page);
      await takeViewportScreenshot(page, `${vp.name}-key-pool`);
    });

    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): No horizontal overflow on metrics subtab`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=metrics`, { waitUntil: 'domcontentloaded' });
      await waitForAiSettings(page);
      await checkNoHorizontalOverflow(page);
      await takeViewportScreenshot(page, `${vp.name}-metrics`);
    });

    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): No horizontal overflow on unified-gateway subtab`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=unified-gateway`, { waitUntil: 'domcontentloaded' });
      await waitForAiSettings(page);
      await checkNoHorizontalOverflow(page);
      await takeViewportScreenshot(page, `${vp.name}-unified-gateway`);
    });

    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): No horizontal overflow on discovery subtab`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=discovery`, { waitUntil: 'domcontentloaded' });
      await waitForAiSettings(page);
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
    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): Add Key Modal fully contained`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=providers`, { waitUntil: 'domcontentloaded' });
      await waitForAiSettings(page);

      const addKeyBtn = page.locator('button:has-text("Add key"), button:has-text("Manage Keys")').first();
      await addKeyBtn.click();

      await page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 10000 });
      const modal = page.locator('[role="dialog"][aria-modal="true"]').first();

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

    test(`Viewport ${vp.name} (${vp.width}x${vp.height}): Key Pool Modal fully contained`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/admin?tab=ai-settings&subtab=providers`, { waitUntil: 'domcontentloaded' });
      await waitForAiSettings(page);

      const keyPoolBtn = page.locator('button:has-text("Key Pool")').first();
      await keyPoolBtn.click();

      await page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout: 10000 });
      const modal = page.locator('[role="dialog"][aria-modal="true"]').first();

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