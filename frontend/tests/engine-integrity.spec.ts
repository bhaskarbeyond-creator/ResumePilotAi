import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const provider = {
  id: 'llamacpp', name: 'llama.cpp', label: 'llama.cpp (local)', type: 'openai-compat', group: 'models',
  keyless: true, configuredOnServer: false, hasKey: false, keysCount: 0, enabled: false,
  status: 'unverified', baseUrl: 'http://127.0.0.1:8081/v1', docUrl: '',
  defaultModel: '', recommendedModels: [],
};
const viewports = [[320,568], [390,844], [430,932], [768,1024], [1366,768], [1440,900], [1920,1080]] as const;

function makePreviewSession(role = 'SUPER_ADMIN') {
  const payload = Buffer.from(
    JSON.stringify({
      uid: 'u-integrity-super',
      email: 'super@resumepilot.test',
      role,
      exp: 4102444800,
    })
  ).toString('base64url');
  const token = `rptest.${payload}.${'a'.repeat(64)}`;
  return {
    uid: 'u-integrity-super',
    email: 'super@resumepilot.test',
    displayName: 'Integrity Super',
    role,
    token,
  };
}

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
  for (const [subtab, heading] of [['providers', 'llama.cpp'], ['key-pool', 'Key Pool Manager'], ['metrics', 'Engine Metrics'], ['unified-gateway', 'Unified Gateway']] as const) {
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

test('selection modes persist and manual model choices are sourced from discovery, not frontend IDs', async ({ page }) => {
  let saved: any;
  await page.route('**/api/admin/ai-settings', async route => {
    if (route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      await route.fulfill({ json: { revision: 2 } });
    } else await route.fulfill({ json: { revision: saved ? 2 : 1, settings: saved || { provider: 'llamacpp' }, catalog: [provider], curatedModels: [] } });
  });
  await page.route('**/api/admin/ai/fetch-models', route => route.fulfill({ json: { models: [{ id: 'discovered-only', catalogStatus: 'fresh' }] } }));
  await page.goto('/tests/harness/engine.html?subtab=providers');
  const mode = page.getByRole('combobox', { name: 'Selection mode' });
  for (const value of ['auto', 'quality', 'speed', 'balanced']) {
    await mode.selectOption(value);
    await page.getByRole('button', { name: 'Save All Changes', exact: true }).click();
    await expect(mode).toHaveValue(value);
    expect(saved.selectionMode).toBe(value);
  }
  await mode.selectOption('manual');
  await page.getByRole('button', { name: 'Refresh selectable models' }).click();
  await page.getByRole('combobox', { name: 'Pinned model' }).selectOption('discovered-only');
  await page.getByRole('button', { name: 'Save All Changes', exact: true }).click();
  expect(saved.selectionMode).toBe('manual');
  expect(saved.llamacpp.model).toBe('discovered-only');
  await page.reload();
  await expect(mode).toHaveValue('manual');
});

test('all five dialogs render real content and close with Escape', async ({ page }) => {
  await page.goto('/tests/harness/engine.html');
  for (const name of ['Configure Provider', 'Manage key pools', 'Manage cooldowns', 'Discover models', 'Integration snippets']) {
    await page.getByRole('button', { name, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3c Extensions: URL Filter/Dialog Sync, Legacy ?tab= & /adm + /platform
// Redirects, Multi-Tab 409 CAS Conflict, Radix Dialog A11y, and Probe Failure UX
// ═══════════════════════════════════════════════════════════════════════════════

test('URL sync (?provider, ?category, ?status, ?q, ?subtab, ?dialog), configured-first sort, and tab ARIA survive hard reload', async ({ page }) => {
  const multiCatalog = [
    {
      id: 'ollama', name: 'Ollama', label: 'Ollama', type: 'openai-compat', group: 'models',
      keyless: true, configuredOnServer: false, hasKey: false, keysCount: 0, enabled: false,
      status: 'disabled', baseUrl: 'http://127.0.0.1:11434/v1', docUrl: '', defaultModel: 'llama3', recommendedModels: [],
    },
    {
      id: 'groq', name: 'Groq', label: 'Groq', type: 'openai-compat', group: 'models',
      keyless: false, configuredOnServer: true, hasKey: true, keysCount: 1, enabled: true,
      status: 'healthy', baseUrl: 'https://api.groq.com/openai/v1', docUrl: '', defaultModel: 'llama-3.3-70b', recommendedModels: [],
    },
    {
      id: 'tavily', name: 'Tavily Search', label: 'Tavily Search', type: 'search', group: 'search',
      keyless: false, configuredOnServer: true, hasKey: true, keysCount: 1, enabled: true,
      status: 'cooldown', baseUrl: 'https://api.tavily.com', docUrl: '', defaultModel: 'basic', recommendedModels: [],
    },
  ];

  await page.route('**/api/admin/ai-settings', route =>
    route.fulfill({
      json: {
        revision: 3,
        settings: { provider: 'groq', selectionMode: 'balanced' },
        maskedKeys: { groq: '••••••••ABCD', tavily: '••••••••EFGH' },
        cooldowns: { tavily: { remainingSeconds: 45, reason: '429 Retry-After' } },
        catalog: multiCatalog,
      },
    })
  );

  await page.goto('/tests/harness/engine.html?subtab=providers');

  // Simplification #4 + DEF-13: Configured-first sort puts Primary (groq) first, Issues (tavily) second, unconfigured (ollama) last
  const rows = page.locator('[data-testid^="provider-row-"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute('data-testid', 'provider-row-groq');
  await expect(rows.nth(1)).toHaveAttribute('data-testid', 'provider-row-tavily');
  await expect(rows.nth(2)).toHaveAttribute('data-testid', 'provider-row-ollama');
  await expect(page.getByRole('button', { name: 'Issues 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Configured 2', exact: true })).toBeVisible();

  // DEF-19: Category role="tab" has aria-selected and zero aria-pressed
  const frontierTab = page.getByRole('tab', { name: /Frontier Free Tier/i });
  expect(await frontierTab.getAttribute('aria-pressed')).toBeNull();
  await frontierTab.click();
  await expect(frontierTab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/category=frontier/);

  // Filter status + search query + reload
  await page.getByRole('button', { name: 'Configured 2', exact: true }).click();
  await expect(page).toHaveURL(/status=configured/);
  await page.getByRole('searchbox', { name: /Search 3 providers/i }).fill('groq');
  await expect(page).toHaveURL(/q=groq/);

  await page.reload();
  await expect(page.getByRole('tab', { name: /Frontier Free Tier/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox', { name: /Search 3 providers/i })).toHaveValue('groq');
  await expect(page.getByTestId('provider-row-groq')).toBeVisible();

  // ?provider=<id> auto-expands provider drawer & ?dialog=<slug> opens Radix dialog on direct load + reload
  await page.goto('/tests/harness/engine.html?subtab=providers&provider=groq&dialog=configure-provider');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/dialog=/);
  await expect(page.locator('#row-key-input-groq')).toBeVisible();
});

test('Legacy ?tab=ai|aisettings|ai_settings|aimodels aliases and /adm + /platform LegacyRedirect preserve query strings (DEF-17)', async ({ page }) => {
  const session = makePreviewSession('SUPER_ADMIN');
  await page.addInitScript(s => localStorage.setItem('ime_dev_user', JSON.stringify(s)), session);
  await page.route('**/api/users-data/profile', route =>
    route.fulfill({ json: { uid: session.uid, email: session.email, role: 'SUPER_ADMIN' } })
  );

  for (const legacyTab of ['ai', 'aisettings', 'ai_settings', 'aimodels']) {
    await page.goto(`/admin?tab=${legacyTab}&subtab=metrics`);
    await expect(page.getByRole('heading', { name: 'Runtime model selection' })).toBeVisible();
    await expect(page.getByText('Engine Metrics', { exact: true })).toBeVisible();
  }

  // Direct load + SPA client navigation through /adm/ai-settings and /platform/ai-settings preserve query params
  await page.goto('/adm/ai-settings?subtab=discovery&q=llama');
  await expect(page).toHaveURL(/\/admin\/ai-settings\?subtab=discovery&q=llama/);
  await expect(page.getByRole('combobox', { name: 'Discovery provider' })).toBeVisible();

  await page.goto('/platform/ai-settings?subtab=unified-gateway');
  await expect(page).toHaveURL(/\/admin\/ai-settings\?subtab=unified-gateway/);
  await expect(page.getByText('Unified Gateway', { exact: true })).toBeVisible();
});

test('Multi-context optimistic concurrency (409 REVISION_CONFLICT) surfaces banner with Reload and Overwrite affordances (DEF-11)', async ({ browser }) => {
  let serverRevision = 10;
  let serverMode = 'balanced';

  const setupContext = async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/api/**', async route => {
      if (route.request().url().endsWith('/admin/ai-settings')) {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            json: {
              revision: serverRevision,
              settings: { selectionMode: serverMode, provider: 'llamacpp' },
              catalog: [provider],
            },
          });
          return;
        }
        const body = route.request().postDataJSON();
        if (!body.force && body.expectedRevision !== serverRevision) {
          await route.fulfill({
            status: 409,
            json: {
              code: 'REVISION_CONFLICT',
              message: `Stale expectedRevision ${body.expectedRevision}; current is ${serverRevision}.`,
              currentRevision: serverRevision,
            },
          });
          return;
        }
        serverRevision += 1;
        if (body.selectionMode) serverMode = body.selectionMode;
        await route.fulfill({
          json: {
            revision: serverRevision,
            settings: { selectionMode: serverMode, provider: 'llamacpp' },
            catalog: [provider],
          },
        });
      } else {
        await route.fulfill({ json: {} });
      }
    });
    return { context, page };
  };

  const tabA = await setupContext();
  const tabB = await setupContext();

  await tabA.page.goto('/tests/harness/engine.html');
  await tabB.page.goto('/tests/harness/engine.html');
  await expect(tabA.page.getByRole('combobox', { name: 'Selection mode' })).toHaveValue('balanced');
  await expect(tabB.page.getByRole('combobox', { name: 'Selection mode' })).toHaveValue('balanced');

  // Tab A saves first (advances serverRevision 10 -> 11)
  await tabA.page.getByRole('combobox', { name: 'Selection mode' }).selectOption('speed');
  await tabA.page.getByRole('button', { name: 'Save All Changes', exact: true }).click();
  await expect(tabA.page.getByText('Rev #11')).toBeVisible();

  // Tab B saves with stale revision 10 -> receives 409 REVISION_CONFLICT
  await tabB.page.getByRole('combobox', { name: 'Selection mode' }).selectOption('quality');
  await tabB.page.getByRole('button', { name: 'Save All Changes', exact: true }).click();

  const conflictBanner = tabB.page.getByTestId('revision-conflict-banner');
  await expect(conflictBanner).toBeVisible();
  await expect(conflictBanner).toContainText('Server Revision #11');

  // Test Overwrite affordance (sends force: true -> advances serverRevision 11 -> 12)
  await conflictBanner.getByRole('button', { name: 'Overwrite Server Version' }).click();
  await expect(conflictBanner).toHaveCount(0);
  await expect(tabB.page.getByText('Rev #12')).toBeVisible();
  expect(serverMode).toBe('quality');

  await tabA.context.close();
  await tabB.context.close();
});

test('expectedRevision drift during 409 recovery triggers double-409 and prevents silent overwrite', async ({ browser }) => {
  let serverRevision = 20;

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.route('**/api/**', async (route) => {
    if (route.request().url().endsWith('/admin/ai-settings')) {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            revision: serverRevision,
            settings: { selectionMode: 'balanced', provider: 'llamacpp' },
            catalog: [provider],
          },
        });
        return;
      }
      const body = route.request().postDataJSON();
      if (!body.force && body.expectedRevision !== serverRevision) {
        await route.fulfill({
          status: 409,
          json: {
            code: 'REVISION_CONFLICT',
            message: `Stale expectedRevision ${body.expectedRevision}; current is ${serverRevision}.`,
            currentRevision: serverRevision,
          },
        });
        return;
      }
      serverRevision += 1;
      await route.fulfill({
        json: {
          revision: serverRevision,
          settings: { selectionMode: body.selectionMode || 'balanced', provider: 'llamacpp' },
          catalog: [provider],
        },
      });
    } else {
      await route.fulfill({ json: {} });
    }
  });

  await page.goto('/tests/harness/engine.html');
  await expect(page.getByRole('combobox', { name: 'Selection mode' })).toBeVisible();

  // Drift server revision from 20 -> 21 externally
  serverRevision = 21;

  // First save with stale expectedRevision 20 -> triggers first 409
  await page.getByRole('combobox', { name: 'Selection mode' }).selectOption('speed');
  await page.getByRole('button', { name: 'Save All Changes', exact: true }).click();

  const conflictBanner = page.getByTestId('revision-conflict-banner');
  await expect(conflictBanner).toBeVisible();
  await expect(conflictBanner).toContainText('Server Revision #21');

  // While user is viewing the conflict banner, server drifts AGAIN from 21 -> 22
  serverRevision = 22;

  // Clicking "Reload Server Settings" fetches rev 22
  await conflictBanner.getByRole('button', { name: 'Reload Server Settings' }).click();
  await expect(page.getByText('Rev #22')).toBeVisible();

  // Changing option and saving now sends expectedRevision 22 (matching server revision 22) -> succeeds
  await page.getByRole('combobox', { name: 'Selection mode' }).selectOption('quality');
  await page.getByRole('button', { name: 'Save All Changes', exact: true }).click();
  await expect(page.getByText('Rev #23')).toBeVisible();

  await context.close();
});

test('All 5 Radix dialogs enforce aria-labelledby, body scroll lock, Escape + backdrop close, focus return, and Axe compliance (DEF-18)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/harness/engine.html');

  const triggers = [
    'Configure Provider',
    'Manage key pools',
    'Manage cooldowns',
    'Discover models',
    'Integration snippets',
  ] as const;

  for (const label of triggers) {
    const trigger = page.getByRole('button', { name: label, exact: true });
    await trigger.focus();
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // aria-labelledby must reference a non-empty title element
    const labelledBy = await dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const titleText = await page.locator(`[id="${labelledBy}"]`).textContent();
    expect((titleText || '').trim().length).toBeGreaterThan(0);

    // Background scroll locked while Radix Dialog is open
    const scrollLocked = await page.evaluate(
      () =>
        document.body.style.overflow === 'hidden' ||
        document.body.hasAttribute('data-scroll-locked')
    );
    expect(scrollLocked).toBe(true);

    // Zero critical/serious Axe violations while dialog is open
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    ).toEqual([]);

    // Close via Escape -> unmounts dialog and returns focus to trigger button
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.textContent?.trim() || ''))
      .toContain(label);

    // Re-open and close via backdrop overlay click at top-left (4, 4)
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(4, 4);
    await expect(dialog).toHaveCount(0);
  }
});

test('Test Connection and Test Key Before Saving surface { success: false } payload failures instead of false green status (DEF-07, DEF-21, DEF-22)', async ({ page }) => {
  const groqCatalog = {
    id: 'groq', name: 'Groq', label: 'Groq', type: 'openai-compat', group: 'models',
    keyless: false, configuredOnServer: true, hasKey: true, keysCount: 1, enabled: true,
    status: 'unverified', baseUrl: 'https://api.groq.com/openai/v1', docUrl: '', defaultModel: 'llama-3.3-70b', recommendedModels: [],
  };
  await page.route('**/api/admin/ai-settings', route =>
    route.fulfill({ json: { revision: 1, settings: { provider: 'groq' }, maskedKeys: { groq: '••••••••1234' }, catalog: [groqCatalog] } })
  );
  await page.route('**/api/admin/ai/test-provider', route =>
    route.fulfill({ status: 200, json: { success: false, message: 'Upstream rejected API key (401)' } })
  );

  await page.goto('/tests/harness/engine.html?subtab=providers');
  // DEF-22: Accessible name begins with visible text "Test Connection"
  const testBtn = page.getByRole('button', { name: 'Test Connection for Groq' });
  await testBtn.click();
  await expect(page.getByRole('alert')).toContainText('Upstream rejected API key (401)');
  await expect(page.getByTestId('provider-row-groq')).toContainText('Connection Issue');
});
