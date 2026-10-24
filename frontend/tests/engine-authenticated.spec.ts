import { createHmac } from 'node:crypto';
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const path = '/admin?tab=ai-settings';
const viewports = [[320,568],[390,844],[430,932],[768,1024],[1366,768],[1440,900],[1920,1080]] as const;
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

/**
 * Explicit allow-list for DEF-24 external Google Fonts offline network refusal only.
 * Every other console error, uncaught pageerror, or failed /api/* response fails the test.
 */
function isExternalGoogleFontNoise(text: string): boolean {
  return (
    /fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(text) ||
    (/Failed to load resource/i.test(text) && /ERR_CONNECTION_CLOSED|ERR_BLOCKED_BY_CLIENT|ERR_NAME_NOT_RESOLVED/i.test(text))
  );
}

function attachConsoleAndApiHygiene(page: Page) {
  const consoleErrors: string[] = [];
  const apiFailures: string[] = [];

  page.on('pageerror', (err) => {
    consoleErrors.push(`pageerror: ${err.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isExternalGoogleFontNoise(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/') && res.status() >= 400) {
      apiFailures.push(`${res.status()} ${res.request().method()} ${url}`);
    }
  });

  return { consoleErrors, apiFailures };
}

async function assertZeroCriticalOrSeriousAxe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const severe = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(
    severe,
    `Expected 0 critical/serious WCAG 2.1 AA violations, got: ${JSON.stringify(
      severe.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.html) }))
    )}`
  ).toEqual([]);
}

async function provisionRoleSession(
  request: APIRequestContext,
  role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'AUDITOR' | 'USER'
) {
  if (role === 'SUPER_ADMIN') return identity(request, 'superadmin@resumepilot.test');
  if (role === 'ADMIN') return identity(request, 'admin@resumepilot.test');
  if (role === 'USER') return identity(request, 'ordinary-ai-e2e@resumepilot.test');

  const email = role === 'SUPPORT' ? 'support-ai-e2e@resumepilot.test' : 'auditor-ai-e2e@resumepilot.test';
  const initial = await identity(request, email);
  const hmacSecret = process.env.TEST_AUTH_HMAC_SECRET || 'sandbox-hmac-secret-resumepilot-2026';
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    uid: initial.uid,
    email,
    role,
    email_verified: true,
    auth_time: nowSec,
    exp: nowSec + 3600,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', hmacSecret).update(encodedPayload).digest('hex');
  const token = `rptest.${encodedPayload}.${sig}`;

  // Verify the backend accepts this signed token and enforces 403 on Super-Admin AI settings
  const checkRes = await request.get('/api/admin/ai-settings', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(checkRes.status()).toBe(403);

  return {
    ...initial,
    role,
    token,
  };
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
    for (const [alias, subtab] of [['adm', 'metrics'], ['platform', 'providers']] as const) {
      await page.goto(`/${alias}?tab=ai-settings&subtab=${subtab}`);
      await expect(page).toHaveURL(new RegExp(`/admin\\?tab=ai-settings&subtab=${subtab}`));
      await expect(page.getByRole('combobox', { name: 'Selection mode' })).toBeVisible();
    }
    await page.goBack();
    await expect(page).toHaveURL(/subtab=metrics/);
    await expect(page.getByRole('combobox', { name: 'Selection mode' })).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/subtab=providers/);
    await expect(page.getByRole('combobox', { name: 'Selection mode' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Runtime model selection' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`engine-${width}x${height}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('real UI login, discovery, persisted modes and manual pin execute the actual discovered model', async ({ page, request }) => {
  // Ensure local inference provider is enabled and clean prior metric records for deterministic test assertion
  const adminSession = await identity(request, 'superadmin@resumepilot.test');
  await request.post('/api/admin/ai-settings', {
    headers: { Authorization: `Bearer ${adminSession.token}` },
    data: {
      force: true,
      provider: 'llamacpp',
      enabledProviders: { llamacpp: true },
      llamacpp: { enabled: true, disabled: false, baseUrl: 'http://127.0.0.1:8081/v1', model: 'llama-3.2-1b-instruct' },
    },
  });
  try {
    const sqlite = await import('node:sqlite');
    const pathMod = await import('node:path');
    const dbPath = pathMod.resolve('data/freellm_metrics.db');
    const db = new sqlite.DatabaseSync(dbPath);
    db.exec('DELETE FROM request_log; DELETE FROM provider_metrics;');
    db.close();
  } catch {
    // node:sqlite optional or in-memory fallback
  }

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
    if (name === 'Configure Provider') {
      await dialog.getByRole('button', { name: 'Provider key', exact: true }).click();
      await dialog.getByTestId('platform-selector').click();
      await dialog.getByTestId('platform-option-ollama').click();
      const probe = dialog.getByRole('button', { name: 'Test Key Before Saving', exact: true });
      await expect(probe).toBeEnabled();
      await dialog.getByRole('button', { name: 'Custom endpoint', exact: true }).click();
      await expect(probe).toBeDisabled();
      await dialog.getByPlaceholder('https://my-openai-gateway.com/v1').fill('https://unsaved.example/v1');
      await dialog.getByRole('button', { name: 'Provider key', exact: true }).click();
      await expect(probe).toBeDisabled();
    }
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(page.url()).toContain('tab=ai-settings');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3b Extensions: 6-Role Deep-Link Matrix, Provider CRUD, ADMIN Governance,
// SUPPORT/AUDITOR Deterministic 403, and 75-Provider Enable/Disable Persistence
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Phase 3b — 6-Role Deep-Link Matrix & Real Persistence', () => {
  test.describe.configure({ mode: 'serial' });

  const deepLinkUrls = [
    '/admin/ai-settings',
    '/admin?tab=ai-settings',
    '/admin?tab=ai',
    '/admin?tab=aisettings',
    '/admin?tab=ai_settings',
    '/admin?tab=aimodels',
    '/adm/ai-settings?subtab=metrics',
    '/platform/ai-settings?subtab=providers',
    '/admin/ai-settings?subtab=providers&provider=llamacpp&category=mesh&status=all',
    '/admin/ai-settings?subtab=discovery',
    '/admin/ai-settings?subtab=metrics',
    '/admin/ai-settings?subtab=unified-gateway',
    '/admin/ai-settings?subtab=playground',
    '/admin/ai-settings?dialog=configure-provider',
  ];

  test('unauthenticated visitor is redirected to /login across all AI settings deep links and hard refreshes', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    for (const targetUrl of ['/admin/ai-settings', '/admin?tab=ai-settings', '/adm/ai-settings?subtab=metrics', '/admin/ai-settings?dialog=configure-provider']) {
      await page.goto(targetUrl);
      await expect(page).toHaveURL(/\/login/);
      await page.reload();
      await expect(page).toHaveURL(/\/login/);
    }
    await context.close();
  });

  test('USER role is redirected to /dashboard across AI settings deep links and hard refreshes', async ({ browser, request }) => {
    const userSession = await provisionRoleSession(request, 'USER');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(s => localStorage.setItem('ime_dev_user', JSON.stringify(s)), userSession);
    for (const targetUrl of ['/admin/ai-settings', '/admin?tab=ai', '/platform/ai-settings?subtab=providers']) {
      await page.goto(targetUrl);
      await expect(page).toHaveURL(/\/dashboard/);
      await page.reload();
      await expect(page).toHaveURL(/\/dashboard/);
    }
    await context.close();
  });

  for (const staffRole of ['SUPPORT', 'AUDITOR'] as const) {
    test(`${staffRole} role renders deterministic admin-tab-forbidden 403 card on /admin/ai-settings + aliases across reload and passes Axe`, async ({ browser, request }) => {
      const staffSession = await provisionRoleSession(request, staffRole);
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.addInitScript(s => localStorage.setItem('ime_dev_user', JSON.stringify(s)), staffSession);
      const hygiene = attachConsoleAndApiHygiene(page);

      for (const targetUrl of ['/admin/ai-settings', '/admin?tab=ai-settings', '/admin?tab=ai', '/adm/ai-settings?subtab=metrics']) {
        await page.goto(targetUrl);
        await expect(page.getByTestId('admin-tab-forbidden')).toBeVisible();
        await expect(page.getByTestId('admin-tab-forbidden')).toContainText('403 — Access Restricted');
        // Deterministic URL contract: stays on the requested /admin route until user clicks Return
        await expect(page).toHaveURL(/\/admin/);
        await page.reload();
        await expect(page.getByTestId('admin-tab-forbidden')).toBeVisible();
      }

      await assertZeroCriticalOrSeriousAxe(page);

      // Clicking "Return to Allowed Workspace" navigates deterministically to the role's default tab
      await page.getByRole('button', { name: 'Return to Allowed Workspace' }).click();
      const expectedAllowedPath = staffRole === 'SUPPORT' ? /\/admin\/support/ : /\/admin\/health/;
      await expect(page).toHaveURL(expectedAllowedPath);
      expect(hygiene.consoleErrors).toEqual([]);
      expect(hygiene.apiFailures).toEqual([]);
      await context.close();
    });
  }

  test('ADMIN role renders Super-Admin restriction notice + interactive Quota Governance with zero 403 ai-settings calls and passes Axe', async ({ browser, request }) => {
    const adminSession = await provisionRoleSession(request, 'ADMIN');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(s => localStorage.setItem('ime_dev_user', JSON.stringify(s)), adminSession);
    const hygiene = attachConsoleAndApiHygiene(page);

    const adminHeaders = { Authorization: `Bearer ${adminSession.token}` };
    const initialStatsRes = await request.get('/api/admin/ai/quota-stats', { headers: adminHeaders });
    expect(initialStatsRes.ok()).toBe(true);
    const initialStats = await initialStatsRes.json();
    const originalBasic = Number(initialStats.limits?.basic ?? 10);

    try {
      for (const targetUrl of ['/admin/ai-settings', '/admin?tab=ai', '/adm/ai-settings?subtab=metrics']) {
        await page.goto(targetUrl);
        await expect(page.getByTestId('super-admin-restriction-notice')).toBeVisible();
        await expect(page.getByRole('heading', { name: /AI Quota Governance/i })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Retry configuration' })).toHaveCount(0);
        await page.reload();
        await expect(page.getByTestId('super-admin-restriction-notice')).toBeVisible();
      }
      await assertZeroCriticalOrSeriousAxe(page);
      expect(hygiene.consoleErrors).toEqual([]);
      expect(hygiene.apiFailures).toEqual([]);
      await page.close();

      // Seed non-default baseline (25 != initial useState '10') so input hydration is an exact state barrier
      const preSeedStats = await (await request.get('/api/admin/ai/quota-stats', { headers: adminHeaders })).json();
      const seedRes = await request.post('/api/admin/ai/quota-limits', {
        headers: adminHeaders,
        data: {
          basicDailyLimit: 25,
          premiumDailyLimit: Number(preSeedStats.limits?.premium ?? 100),
          enterpriseDailyLimit: Number(preSeedStats.limits?.enterprise ?? 5000),
          adminDailyLimit: Number(preSeedStats.limits?.admin ?? 10000),
          expectedRevision: Number(preSeedStats.quotaRevision ?? 0),
        },
      });
      expect(seedRes.ok()).toBe(true);

      const quotaPage = await context.newPage();
      const quotaHygiene = attachConsoleAndApiHygiene(quotaPage);
      await quotaPage.goto('/admin/ai-settings', { waitUntil: 'networkidle' });
      const basicInput = quotaPage.getByLabel('Basic Daily Limit');
      await expect(basicInput).toHaveValue('25');

      // Persist quota limits (25 -> 30) as ADMIN and verify reload persistence (DEF-05, DEF-06)
      await basicInput.fill('30');
      await expect(basicInput).toHaveValue('30');
      const quotaSave = quotaPage.waitForResponse(
        (r) => r.url().includes('/api/admin/ai/quota-limits') && r.request().method() === 'POST'
      );
      await quotaPage.getByRole('button', { name: 'Save Quota Limits' }).click();
      const savedResp = await quotaSave;
      expect(savedResp.ok()).toBe(true);
      expect(savedResp.request().postDataJSON().basicDailyLimit).toBe(30);
      await expect(quotaPage.getByRole('button', { name: 'Save Quota Limits' })).toBeEnabled();

      await quotaPage.reload({ waitUntil: 'networkidle' });
      await expect(quotaPage.getByLabel('Basic Daily Limit')).toHaveValue('30');
      expect(quotaHygiene.consoleErrors).toEqual([]);
      expect(quotaHygiene.apiFailures).toEqual([]);
      await quotaPage.close();
    } finally {
      const latestRes = await request.get('/api/admin/ai/quota-stats', { headers: adminHeaders });
      const latest = await latestRes.json();
      await request.post('/api/admin/ai/quota-limits', {
        headers: adminHeaders,
        data: {
          basicDailyLimit: originalBasic,
          premiumDailyLimit: Number(latest.limits?.premium ?? 100),
          enterpriseDailyLimit: Number(latest.limits?.enterprise ?? 5000),
          adminDailyLimit: Number(latest.limits?.admin ?? 10000),
          expectedRevision: Number(latest.quotaRevision ?? 0),
        },
      });
      await context.close();
    }
  });

  test('SUPER_ADMIN traverses full deep-link matrix with direct load + hard refresh + zero console/API errors + Axe pass', async ({ page, request }) => {
    test.setTimeout(180_000);
    const token = await authenticate(page, request);
    const headers = { Authorization: `Bearer ${token}` };
    // Ensure self-contained local inference provider is discovered & enabled even when run in isolation (-g)
    const enableRes = await request.post('/api/admin/ai-settings', {
      headers,
      data: { force: true, llamacppEnabled: true, llamacppBaseUrl: 'http://127.0.0.1:8081/v1', selectionMode: 'balanced' },
    });
    expect(enableRes.ok()).toBe(true);
    const discoverRes = await request.post('/api/admin/ai/fetch-models', {
      headers,
      data: { provider: 'llamacpp' },
    });
    expect(discoverRes.ok()).toBe(true);

    const hygiene = attachConsoleAndApiHygiene(page);

    for (const targetUrl of deepLinkUrls) {
      await page.goto(targetUrl);
      if (targetUrl.includes('dialog=configure-provider')) {
        await expect(page.getByRole('dialog', { name: 'Configure Provider' })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: 'Runtime model selection' })).toBeVisible();
      }
      await page.reload();
      if (targetUrl.includes('dialog=configure-provider')) {
        await expect(page.getByRole('dialog', { name: 'Configure Provider' })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: 'Runtime model selection' })).toBeVisible();
      }
    }

    await page.goto('/admin/ai-settings?subtab=unified-gateway');
    await expect(page.getByRole('heading', { name: 'Unified Gateway' })).toBeVisible();
    // DEF-14: dynamic origin, zero hardcoded localhost in user-facing gateway/snippets when accessed via 127.0.0.1
    const gatewayCode = await page.getByRole('region', { name: 'Gateway integration code snippet' }).textContent();
    expect(gatewayCode).toContain('http://127.0.0.1:4000/v1');
    expect(gatewayCode).not.toContain('localhost:');

    // DEF-15: Playground executes live completion
    await page.goto('/admin/ai-settings?subtab=playground');
    const completionResp = page.waitForResponse(
      (r) => r.url().includes('/api/v1/chat/completions') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Execute Inference' }).click();
    expect((await completionResp).ok()).toBe(true);

    await assertZeroCriticalOrSeriousAxe(page);
    expect(hygiene.consoleErrors).toEqual([]);
    expect(hygiene.apiFailures).toEqual([]);
  });

  test('Provider CRUD persistence: save key, custom baseUrl, primary & tuning [0..2 / 256..8192] across hard reload, then remove via Radix Dialog', async ({ page, request }) => {
    const token = await authenticate(page, request);
    const headers = { Authorization: `Bearer ${token}` };
    const beforeState = await (await request.get('/api/admin/ai-settings', { headers })).json();

    try {
      await page.goto('/admin/ai-settings?subtab=providers');
      await expect(page.getByRole('heading', { name: 'Runtime model selection' })).toBeVisible();

      // Open Configure Provider dialog via row-level "Add key" or header CTA (Simplification #1)
      await page.getByRole('button', { name: 'Configure Provider', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByTestId('platform-selector').click();
      await dialog.getByTestId('platform-option-cerebras').click();
      await dialog.getByRole('textbox', { name: 'API Key' }).fill('fixture-cerebras-secret-9876');

      // Switch to Custom endpoint tab, set custom Base URL, and save (DEF-09)
      await dialog.getByRole('button', { name: 'Custom endpoint', exact: true }).click();
      await dialog.getByPlaceholder('https://my-openai-gateway.com/v1').fill('https://gateway.resumepilot.test/v1');
      await dialog.getByRole('button', { name: 'Provider key', exact: true }).click();

      const saveResp = page.waitForResponse(
        (r) => r.url().includes('/api/admin/ai-settings') && r.request().method() === 'POST'
      );
      await dialog.getByRole('button', { name: 'Add key & Activate', exact: true }).click();
      expect((await saveResp).ok()).toBe(true);
      await expect(dialog).toHaveCount(0);

      // Hard reload and assert masked key ••••••••9876 + MariaDB Vault source + custom Base URL (DEF-01, DEF-02, DEF-09)
      await page.reload();
      const row = page.getByTestId('provider-row-cerebras');
      await expect(row).toBeVisible();
      await expect(page.getByTestId('masked-key-cerebras')).toHaveText('••••••••9876');
      await expect(row).toContainText('MariaDB Vault');

      await page.getByTestId('expand-provider-cerebras').click();
      await expect(page.locator('#row-baseurl-input-cerebras')).toHaveValue('https://gateway.resumepilot.test/v1');

      // Test Temperature [0..2] and Max Tokens [256..8192] bounds persistence (DEF-20)
      await page.getByRole('button', { name: /Tuning \(/ }).click();
      await page.locator('#ai-temperature-slider').fill('1.65');
      await page.locator('#ai-max-tokens-slider').fill('6144');
      const tuningSave = page.waitForResponse(
        (r) => r.url().includes('/api/admin/ai-settings') && r.request().method() === 'POST'
      );
      await page.getByRole('button', { name: 'Save All Changes', exact: true }).click();
      expect((await tuningSave).ok()).toBe(true);
      await page.reload();
      await expect(page.getByRole('button', { name: /Tuning \(1\.65 · 6144 tok\)/ })).toBeVisible();

      // Remove stored key via accessible Radix confirmation dialog (zero window.confirm — DEF-18)
      await page.getByTestId('expand-provider-cerebras').click();
      await page.getByRole('button', { name: 'Remove Stored Key' }).click();
      const confirmDlg = page.getByRole('dialog');
      await expect(confirmDlg).toContainText('Remove Stored API Key');
      const clearSave = page.waitForResponse(
        (r) => r.url().includes('/api/admin/ai-settings') && r.request().method() === 'POST'
      );
      await confirmDlg.getByRole('button', { name: 'Remove Key' }).click();
      expect((await clearSave).ok()).toBe(true);
      await page.reload();
      await expect(page.getByTestId('masked-key-cerebras')).toHaveCount(0);
    } finally {
      await request.post('/api/admin/ai-settings', {
        headers,
        data: {
          force: true,
          selectionMode: beforeState.settings?.selectionMode || 'balanced',
          provider: beforeState.settings?.provider || 'llamacpp',
          temperature: beforeState.settings?.temperature ?? 0.7,
          maxTokens: beforeState.settings?.maxTokens ?? 2048,
          cerebrasBaseUrl: 'none',
          clearSecrets: { cerebras: true },
        },
      });
    }
  });

  test('Enable/disable persistence across hard reloads for 3 non-legacy 75-provider registry entries (DEF-08)', async ({ page, request }) => {
    const token = await authenticate(page, request);
    const headers = { Authorization: `Bearer ${token}` };
    const targets = [
      { id: 'cerebras', name: 'Cerebras', key: 'fixture-cerebras-toggle-1111' },
      { id: 'sambanova', name: 'SambaNova', key: 'fixture-sambanova-toggle-2222' },
      { id: 'mistral', name: 'Mistral', key: 'fixture-mistral-toggle-3333' },
    ];

    try {
      // Seed synthetic keys for 3 non-legacy providers from the 75-provider registry
      const seedRes = await request.post('/api/admin/ai-settings', {
        headers,
        data: {
          force: true,
          cerebrasApiKey: targets[0]!.key,
          sambanovaApiKey: targets[1]!.key,
          mistralApiKey: targets[2]!.key,
          enabledProviders: { cerebras: true, sambanova: true, mistral: true },
        },
      });
      expect(seedRes.ok()).toBe(true);

      await page.goto('/admin/ai-settings?subtab=providers');
      for (const t of targets) {
        const checkbox = page.getByTestId(`provider-row-${t.id}`).getByRole('checkbox');
        await expect(checkbox).toBeChecked();
        const toggleOff = page.waitForResponse(
          (r) => r.url().includes('/api/admin/ai-settings') && r.request().method() === 'POST'
        );
        await checkbox.uncheck();
        expect((await toggleOff).ok()).toBe(true);
      }

      // Hard reload and verify all 3 remain unchecked (disabled: true persisted in MariaDB)
      await page.reload();
      for (const t of targets) {
        const checkbox = page.getByTestId(`provider-row-${t.id}`).getByRole('checkbox');
        await expect(checkbox).not.toBeChecked();
      }

      // Re-enable all 3 and verify persistence across a second hard reload
      for (const t of targets) {
        const checkbox = page.getByTestId(`provider-row-${t.id}`).getByRole('checkbox');
        const toggleOn = page.waitForResponse(
          (r) => r.url().includes('/api/admin/ai-settings') && r.request().method() === 'POST'
        );
        await checkbox.check();
        expect((await toggleOn).ok()).toBe(true);
      }
      await page.reload();
      for (const t of targets) {
        await expect(page.getByTestId(`provider-row-${t.id}`).getByRole('checkbox')).toBeChecked();
      }
    } finally {
      await request.post('/api/admin/ai-settings', {
        headers,
        data: {
          force: true,
          clearSecrets: { cerebras: true, sambanova: true, mistral: true },
        },
      });
    }
  });

  test('Disabling active primary provider is blocked with warning and cannot corrupt routing', async ({ page, request }) => {
    const token = await authenticate(page, request);
    const headers = { Authorization: `Bearer ${token}` };

    await page.goto('/admin/ai-settings?subtab=providers');
    const primaryPill = page.locator('span:text-is("Primary")');
    await expect(primaryPill).toBeVisible();

    const primaryRow = page.locator('[data-testid^="provider-row-"]').filter({ has: primaryPill });
    const checkbox = primaryRow.getByRole('checkbox');
    await expect(checkbox).toBeChecked();
    await checkbox.click({ force: true });

    const alert = page.locator('[role="alert"]').filter({ hasText: /Cannot disable .* active primary provider/i });
    await expect(alert).toBeVisible();
    await expect(checkbox).toBeChecked();

    const primaryId = (await primaryRow.getAttribute('data-testid'))?.replace('provider-row-', '') || 'nvidia';
    const rejectRes = await request.post('/api/admin/ai-settings', {
      headers,
      data: { force: true, enabledProviders: { [primaryId]: false } },
    });
    expect(rejectRes.status()).toBe(400);
    const body = await rejectRes.json();
    expect(body.code || body.reasonCode).toMatch(/CANNOT_DISABLE_PRIMARY_PROVIDER/);
  });

  test('Toggle legacy provider (gemini) OFF and ON persists across hard reloads on both public_config and ai_providers', async ({ page, request }) => {
    const token = await authenticate(page, request);
    const headers = { Authorization: `Bearer ${token}` };

    // Ensure Gemini has a key and is enabled before toggle-off assertion
    await request.post('/api/admin/ai-settings', {
      headers,
      data: { force: true, geminiApiKey: 'test-gemini-key-12345678', enabledProviders: { gemini: true } },
    });

    try {
      await page.goto('/admin/ai-settings?subtab=providers');
      const geminiCheckbox = page.getByTestId('provider-row-gemini').getByRole('checkbox');
      await expect(geminiCheckbox).toBeChecked();

      // Toggle OFF
      const toggleOff = page.waitForResponse(
        (r) => r.url().includes('/api/admin/ai-settings') && r.request().method() === 'POST'
      );
      await geminiCheckbox.uncheck();
      expect((await toggleOff).ok()).toBe(true);

      // Hard reload - persists as unchecked
      await page.reload();
      await expect(page.getByTestId('provider-row-gemini').getByRole('checkbox')).not.toBeChecked();

      // Toggle ON
      const toggleOn = page.waitForResponse(
        (r) => r.url().includes('/api/admin/ai-settings') && r.request().method() === 'POST'
      );
      await page.getByTestId('provider-row-gemini').getByRole('checkbox').check();
      expect((await toggleOn).ok()).toBe(true);

      // Hard reload - persists as checked
      await page.reload();
      await expect(page.getByTestId('provider-row-gemini').getByRole('checkbox')).toBeChecked();
    } finally {
      await request.post('/api/admin/ai-settings', {
        headers,
        data: { force: true, clearSecrets: { gemini: true } },
      });
    }
  });
});
