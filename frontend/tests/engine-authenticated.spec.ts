import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
const path = '/admin?tab=ai-settings';
const viewports = [[320,568],[390,844],[430,932],[768,1024],[1366,768],[1440,900],[1920,1080]];
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
for (const [width, height] of viewports) {
  test(`authenticated routes, deep links, refresh, responsive bounds ${width}x${height}`, async ({ page, request }) => {
    await authenticate(page, request);
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const subtab of ['providers', 'key-pool', 'metrics', 'unified-gateway', 'discovery']) {
      await page.goto(`${path}&subtab=${subtab}`);
      await expect(page.getByRole('heading', { name: 'Runtime model selection' })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('combobox', { name: 'Selection mode' })).toBeVisible();
      expect(page.url()).toContain(`subtab=${subtab}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    for (const name of ['Models & Fallback Chains', 'Claude Code & Agents', 'Playground']) {
      await page.getByRole('button', { name, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    for (const [alias, subtab] of [['adm', 'metrics'], ['platform', 'providers']]) {
      await page.goto(`/${alias}?tab=ai-settings&subtab=${subtab}`);
      await expect(page).toHaveURL(new RegExp(`/admin\\?tab=ai-settings&subtab=${subtab}`));
      await expect(page.getByRole('combobox', { name: 'Selection mode' })).toBeVisible();
    }
    await page.goBack();
    await expect(page).toHaveURL(/subtab=metrics/);
    await expect(page.getByRole('combobox', { name: 'Selection mode' })).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/subtab=providers/);
    await page.screenshot({ path: test.info().outputPath(`engine-${width}x${height}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}
test('real UI login, discovery, persisted modes and manual pin execute the actual discovered model', async ({ page, request }) => {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel('Email').fill('superadmin@resumepilot.test');
  await page.getByLabel('Password', { exact: true }).fill('ephemeral-e2e-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Selection mode' })).toBeVisible();
  await page.goto(`${path}&subtab=discovery`);
  await page.getByRole('combobox', { name: 'Discovery provider' }).selectOption('llamacpp');
  const discovered = page.waitForResponse(res => res.url().endsWith('/admin/ai/fetch-models') && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'Fetch Models', exact: true }).click();
  const catalog = await (await discovered).json();
  expect(catalog.models.length).toBeGreaterThan(0);
  expect(catalog.models[0].catalogStatus).toBe('fresh');
  const model = catalog.models[0].id;
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('ime_dev_user') || '{}'));
  const assertInference = async (expectedMode: string) => {
    const response = await request.post('/api/v1/chat/completions', { headers: { Authorization: `Bearer ${session.token}` },
      data: { model: 'auto', messages: [{ role: 'user', content: 'Write one sentence about a tree.' }], max_tokens: 32 } });
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.model).toBe(model);
    expect(result._freellmapi.provider).toBe('llamacpp');
    expect(result._freellmapi.actual_model).toBe(model);
    expect(result._freellmapi.routing_decision.mode).toBe(expectedMode);
    expect(result.choices[0].message.content.trim().length).toBeGreaterThan(0);
  };
  const mode = page.getByRole('combobox', { name: 'Selection mode' });
  for (const value of ['auto','quality','speed','balanced']) {
    await mode.selectOption(value);
    const saved = page.waitForResponse(res => res.url().endsWith('/admin/ai-settings') && res.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save All Changes' }).click();
    expect((await saved).ok()).toBe(true);
    await page.reload();
    await expect(mode).toHaveValue(value);
    await assertInference(value);
  }
  await mode.selectOption('manual');
  await page.getByRole('combobox', { name: 'Pinned provider' }).selectOption('llamacpp');
  await page.getByRole('button', { name: 'Refresh selectable models' }).click();
  await page.getByRole('combobox', { name: 'Pinned model' }).selectOption(model);
  const saved = page.waitForResponse(res => res.url().endsWith('/admin/ai-settings') && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save All Changes' }).click();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(mode).toHaveValue('manual');
  await expect(page.getByRole('combobox', { name: 'Pinned model' })).toHaveValue(model);
  await assertInference('manual');
});
test('ordinary identity is denied protected settings/discovery and redirected from console', async ({ page, request }) => {
  const body = await identity(request, 'ordinary-ai-e2e@resumepilot.test');
  const headers = { Authorization: `Bearer ${body.token}` };
  expect((await request.get('/api/admin/ai-settings', { headers })).status()).toBe(403);
  expect((await request.post('/api/admin/ai/fetch-models', { headers, data: { provider: 'llamacpp' } })).status()).toBe(403);
  expect((await request.post('/api/admin/ai-settings', { headers, data: { selectionMode: 'manual' } })).status()).toBe(403);
  await page.addInitScript(session => localStorage.setItem('ime_dev_user', JSON.stringify(session)), body);
  await page.goto(path);
  await expect(page).toHaveURL(/\/dashboard/);
});
test('single injected transport failure is visible, Retry recovers through real authenticated API', async ({ page, request }) => {
  await authenticate(page, request);
  let failures = 0;
  await page.route('**/api/admin/ai-settings', async route => {
    if (!failures++ && route.request().method() === 'GET') await route.fulfill({ status: 503, json: { error: 'E2E deliberate transient failure' } });
    else await route.continue();
  });
  await page.goto(path);
  await expect(page.getByRole('alert')).toContainText('Engine configuration could not be loaded');
  await page.getByRole('button', { name: 'Retry configuration' }).click();
  await expect(page.getByRole('combobox', { name: 'Selection mode' })).toBeVisible();
});
test('five real dialogs open, trap focus, close on Escape, and preserve route state', async ({ page, request }) => {
  await authenticate(page, request);
  await page.goto(path);
  for (const name of ['Configure Provider', 'Manage key pools', 'Manage cooldowns', 'Discover models', 'Integration snippets']) {
    await page.getByRole('button', { name, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(page.url()).toContain('tab=ai-settings');
  }
});
