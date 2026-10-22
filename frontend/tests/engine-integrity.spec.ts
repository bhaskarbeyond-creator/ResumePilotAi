import { test, expect } from '@playwright/test';

const provider = {
  id: 'llamacpp', name: 'llama.cpp', label: 'llama.cpp (local)', type: 'openai-compat', group: 'models',
  keyless: true, configuredOnServer: false, hasKey: false, keysCount: 0, enabled: false,
  status: 'unverified', baseUrl: 'http://127.0.0.1:8081/v1', docUrl: '',
  defaultModel: '', recommendedModels: [],
};
const viewports = [[320,568], [390,844], [430,932], [768,1024], [1366,768], [1440,900], [1920,1080]];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    if (route.request().url().endsWith('/admin/ai-settings')) {
      await route.fulfill({ json: { revision: 1, settings: {}, catalog: [provider], fallbackChains: [], curatedModels: [] } });
    } else await route.fulfill({ json: {} });
  });
});

for (const [width, height] of viewports) {
  test(`discovery selects server-added provider, reconciles models and marks stale at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let refresh = 0;
    await page.route('**/api/admin/ai/fetch-models', async route => {
      expect(route.request().postDataJSON()).toEqual({ provider: 'llamacpp' });
      refresh++;
      await route.fulfill({ json: { models: refresh === 1
        ? [{ id: 'old-model', catalogStatus: 'fresh' }]
        : [{ id: 'new-model', catalogStatus: 'stale' }] } });
    });
    await page.goto('/tests/harness/engine.html?subtab=discovery');
    const fetch = page.getByRole('button', { name: 'Fetch Models' });
    await expect(fetch).toBeDisabled();
    await page.getByRole('combobox', { name: 'Discovery provider' }).selectOption('llamacpp');
    await fetch.click();
    await expect(page.getByText('old-model', { exact: true })).toBeVisible();
    await fetch.click();
    await expect(page.getByText('new-model', { exact: true })).toBeVisible();
    await expect(page.getByText('old-model', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('stale or unverified');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('discovery failures are visible, do not erase the prior catalog, and refresh can retry', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/admin/ai/fetch-models', async route => {
    calls++;
    if (calls === 2) await route.fulfill({ status: 503, json: { message: 'Catalog unavailable' } });
    else await route.fulfill({ json: { models: [{ id: 'retained-model', catalogStatus: 'fresh' }] } });
  });
  await page.goto('/tests/harness/engine.html?subtab=discovery');
  await page.getByRole('combobox', { name: 'Discovery provider' }).selectOption('llamacpp');
  const fetch = page.getByRole('button', { name: 'Fetch Models' });
  await fetch.click();
  await expect(page.getByText('retained-model', { exact: true })).toBeVisible();
  await fetch.click();
  await expect(page.getByRole('alert')).toContainText('Catalog unavailable');
  await expect(page.getByText('retained-model', { exact: true })).toBeVisible();
  await fetch.click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const [width, height] of viewports) {
  for (const [subtab, heading] of [['providers', 'llama.cpp'], ['key-pool', 'Key Pool Manager'], ['metrics', 'Engine Metrics'], ['unified-gateway', 'Unified Gateway']]) {
    test(`${subtab} deep link and refresh render without overflow at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(`/tests/harness/engine.html?subtab=${subtab}`);
      await expect(page.getByText(heading, { exact: true }).first()).toBeVisible();
      await page.reload();
      await expect(page.getByText(heading, { exact: true }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
  }
}

test('configuration failure is not displayed as a successful zero-valued dashboard', async ({ page }) => {
  await page.route('**/api/admin/ai-settings', route => route.fulfill({ status: 503, json: { message: 'Storage unavailable' } }));
  await page.goto('/tests/harness/engine.html?subtab=metrics');
  await expect(page.getByRole('alert')).toContainText('Storage unavailable');
  await expect(page.getByText('Total Providers', { exact: true })).toHaveCount(0);
});
