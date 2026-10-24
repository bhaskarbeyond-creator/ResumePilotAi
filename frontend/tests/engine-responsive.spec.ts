import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PRIMARY_SUBTABS = [
  'providers',
  'discovery',
  'metrics',
  'unified-gateway',
  'playground',
] as const;

const DETERMINISTIC_SNAPSHOT_CATALOG = [
  {
    id: 'groq',
    name: 'Groq',
    label: 'Groq Cloud',
    type: 'openai-compat',
    group: 'models',
    keyless: false,
    configuredOnServer: true,
    hasKey: true,
    keysCount: 2,
    enabled: true,
    status: 'healthy',
    latencyMs: 84,
    credentialSource: 'mariadb-secret-store',
    baseUrl: 'https://api.groq.com/openai/v1',
    docUrl: 'https://console.groq.com/docs',
    defaultModel: 'llama-3.3-70b-versatile',
    recommendedModels: ['llama-3.3-70b-versatile'],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    label: 'Cerebras Inference',
    type: 'openai-compat',
    group: 'models',
    keyless: false,
    configuredOnServer: true,
    hasKey: true,
    keysCount: 1,
    enabled: true,
    status: 'unverified',
    credentialSource: 'environment',
    baseUrl: 'https://api.cerebras.ai/v1',
    docUrl: 'https://inference-docs.cerebras.ai',
    defaultModel: 'llama3.1-8b',
    recommendedModels: ['llama3.1-8b'],
  },
  {
    id: 'llamacpp',
    name: 'llama.cpp',
    label: 'llama.cpp (local)',
    type: 'openai-compat',
    group: 'models',
    keyless: true,
    configuredOnServer: false,
    hasKey: false,
    keysCount: 0,
    enabled: false,
    status: 'disabled',
    credentialSource: 'none',
    baseUrl: 'http://127.0.0.1:8081/v1',
    docUrl: '',
    defaultModel: 'local-gguf',
    recommendedModels: [],
  },
  {
    id: 'tavily',
    name: 'Tavily Search',
    label: 'Tavily Search',
    type: 'search',
    group: 'search',
    keyless: false,
    configuredOnServer: false,
    hasKey: false,
    keysCount: 0,
    enabled: false,
    status: 'disabled',
    credentialSource: 'none',
    baseUrl: 'https://api.tavily.com',
    docUrl: 'https://docs.tavily.com',
    defaultModel: 'basic',
    recommendedModels: [],
  },
];

async function loginRole(request: APIRequestContext, email: string) {
  const res = await request.post('/api/auth/preview-login', {
    data: { email, password: 'ephemeral-e2e-only' },
  });
  expect(res.status()).toBe(200);
  return res.json();
}

function isExternalGoogleFontNoise(text: string): boolean {
  return (
    /fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(text) ||
    (/Failed to load resource/i.test(text) &&
      /ERR_CONNECTION_CLOSED|ERR_BLOCKED_BY_CLIENT|ERR_NAME_NOT_RESOLVED/i.test(text))
  );
}

async function assertAxeClean(page: Page, contextLabel: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const severe = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(
    severe,
    `Axe critical/serious violations on ${contextLabel}: ${JSON.stringify(
      severe.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.html) }))
    )}`
  ).toEqual([]);
}

test.describe.parallel('AI Multi-Provider Engine — Multi-Viewport Responsive, Axe & Visual Baselines', () => {
  test('Live authenticated responsive bounds, above-the-fold CTA, modal reflow & WCAG 2.1 AA across all subtabs and modals', async ({
    page,
    request,
  }, testInfo) => {
    const superSession = await loginRole(request, 'superadmin@resumepilot.test');
    await page.addInitScript(
      (s) => localStorage.setItem('ime_dev_user', JSON.stringify(s)),
      superSession
    );

    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isExternalGoogleFontNoise(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Check above-the-fold primary CTA visibility without scrolling on initial load
    await page.goto('/admin/ai-settings?subtab=providers');
    await expect(page.getByRole('heading', { name: 'Runtime model selection' })).toBeVisible();
    const vp = page.viewportSize()!;
    const primarySaveBtn = page.getByRole('button', { name: 'Save All Changes', exact: true });
    await expect(primarySaveBtn).toBeVisible();
    const saveBox = await primarySaveBtn.boundingBox();
    expect(saveBox).not.toBeNull();
    expect(saveBox!.x).toBeGreaterThanOrEqual(0);
    expect(saveBox!.x + saveBox!.width).toBeLessThanOrEqual(vp.width + 1);
    expect(saveBox!.y).toBeGreaterThanOrEqual(0);
    expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(vp.height);

    const ctaBtn = page.getByRole('button', { name: 'Configure Provider', exact: true });
    await expect(ctaBtn).toBeVisible();
    const ctaBox = await ctaBtn.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(ctaBox!.x).toBeGreaterThanOrEqual(0);
    expect(ctaBox!.x + ctaBox!.width).toBeLessThanOrEqual(vp.width + 1);
    if (vp.height >= 800) {
      expect(ctaBox!.y).toBeGreaterThanOrEqual(0);
      expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(vp.height);
    }

    // 2. Check zero horizontal overflow + 0 critical/serious Axe violations across every primary subtab
    for (const subtab of PRIMARY_SUBTABS) {
      await page.goto(`/admin/ai-settings?subtab=${subtab}`);
      await expect(page.getByRole('heading', { name: 'Runtime model selection' })).toBeVisible();
      const noOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(noOverflow, `Overflow on subtab=${subtab} (${testInfo.project.name})`).toBe(true);
      await assertAxeClean(page, `${testInfo.project.name}:subtab=${subtab}`);
    }

    // 3. Check expanded inline provider drawer overflow + Axe
    await page.goto('/admin/ai-settings?subtab=providers&provider=groq');
    await expect(page.locator('#row-key-input-groq')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true);
    await assertAxeClean(page, `${testInfo.project.name}:expanded-row-groq`);

    // 4. Check all 5 Radix dialogs reflow inside viewport bounds + Axe
    await page.goto('/admin/ai-settings?subtab=providers');
    for (const dialogBtnName of [
      'Configure Provider',
      'Manage key pools',
      'Manage cooldowns',
      'Discover models',
      'Integration snippets',
    ] as const) {
      await page.getByRole('button', { name: dialogBtnName, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const dlgBox = await dialog.boundingBox();
      expect(dlgBox).not.toBeNull();
      expect(dlgBox!.x).toBeGreaterThanOrEqual(0);
      expect(dlgBox!.x + dlgBox!.width).toBeLessThanOrEqual(vp.width + 1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
      ).toBe(true);
      await assertAxeClean(page, `${testInfo.project.name}:dialog=${dialogBtnName}`);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }

    expect(consoleErrors).toEqual([]);
  });

  test('ADMIN role responsive bounds and WCAG 2.1 AA compliance', async ({
    page,
    request,
  }, testInfo) => {
    const adminSession = await loginRole(request, 'admin@resumepilot.test');
    await page.addInitScript(
      (s) => localStorage.setItem('ime_dev_user', JSON.stringify(s)),
      adminSession
    );
    await page.goto('/admin/ai-settings');
    await expect(page.getByTestId('super-admin-restriction-notice')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true);
    await assertAxeClean(page, `${testInfo.project.name}:role=ADMIN`);
  });

  for (const subtab of PRIMARY_SUBTABS) {
    test(`Visual regression baseline — subtab=${subtab}`, async ({ page, request }) => {
      // Under Policy B: Dual platform snapshots committed ({platform} template).
      // Both Linux and Windows run their respective platform baselines.
      const superSession = await loginRole(request, 'superadmin@resumepilot.test');
      await page.addInitScript(
        (s) => localStorage.setItem('ime_dev_user', JSON.stringify(s)),
        superSession
      );

      // Pin deterministic read payloads so visual baselines never drift due to live counters
      await page.route('**/api/admin/ai-settings', (route) =>
        route.fulfill({
          json: {
            revision: 1,
            settings: {
              selectionMode: 'balanced',
              provider: 'groq',
              temperature: 0.7,
              maxTokens: 2048,
              enableFallback: true,
            },
            maskedKeys: { groq: '••••••••A1B2', cerebras: '••••••••C3D4' },
            credentialSources: {
              groq: 'mariadb-secret-store',
              cerebras: 'environment',
            },
            cooldowns: {},
            catalog: DETERMINISTIC_SNAPSHOT_CATALOG,
            discoveredModels: [
              {
                id: 'llama-3.3-70b-versatile',
                name: 'Llama 3.3 70B',
                providerId: 'groq',
                contextWindow: 128000,
                capabilities: { vision: false, tools: true, json: true },
                catalogStatus: 'fresh',
              },
            ],
            featureFlags: { ai_settings_v2_enabled: true },
          },
        })
      );
      await page.route('**/api/admin/ai/quota-stats', (route) =>
        route.fulfill({
          json: {
            todayDate: '2026-10-24',
            totalTodayRequests: 42,
            activeUsersToday: 5,
            totalHistoricalRecords: 1280,
            topConsumers: [],
            limits: { basic: 10, premium: 100, enterprise: 5000, admin: 10000 },
            quotaRevision: 1,
          },
        })
      );
      await page.route('**/api/freellmapi/status', (route) =>
        route.fulfill({
          json: {
            success: true,
            version: '0.17.0-inprocess-74p',
            totalProvidersCount: 75,
          },
        })
      );
      await page.route('**/api/freellmapi/metrics', (route) =>
        route.fulfill({
          json: {
            success: true,
            summary: {
              totalRequests: 320,
              successCount: 318,
              errorCount: 2,
              totalTokens: 184200,
              avgLatencyMs: 92,
              backend: 'sqlite',
            },
            providers: [],
          },
        })
      );
      await page.route('**/api/users-data/ai-usage', (route) =>
        route.fulfill({
          json: {
            plan: 'Admin',
            usedToday: 0,
            effectiveLimit: 10000,
            remainingToday: 10000,
            isExhausted: false,
          },
        })
      );
      await page.route('**/api/notifications**', (route) =>
        route.fulfill({ json: { notifications: [], unreadCount: 0 } })
      );

      await page.goto(`/admin/ai-settings?subtab=${subtab}`);
      await expect(page.getByRole('heading', { name: 'Runtime model selection' })).toBeVisible();
      await expect(page).toHaveScreenshot(`ai-settings-${subtab}.png`, {
        animations: 'disabled',
      });
    });
  }
});
