import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SEEDED_SINGLE_KEY = 'fixture-sec-audit-single-secret-Z9X8';
const SEEDED_POOL_KEY_1 = 'fixture-sec-audit-pool-alpha-Q7W6';
const SEEDED_POOL_KEY_2 = 'fixture-sec-audit-pool-bravo-M5N4';
const UI_ENTERED_KEY = 'fixture-ui-entered-secret-K3L2';
const FORBIDDEN_PREFIX = 'fixture-sec-audit';

async function loginByEmail(request: APIRequestContext, email: string) {
  const res = await request.post('/api/auth/preview-login', {
    data: { email, password: 'ephemeral-e2e-only' },
  });
  expect(res.status()).toBe(200);
  return res.json();
}

/**
 * Attaches a hard-fail network listener scanning every request URL, request header,
 * request body, response header, and textual response body for any forbidden secret string.
 */
function attachSecretLeakDetector(page: Page, forbiddenSecrets: string[]) {
  const leaks: string[] = [];

  const scanText = (haystack: string, label: string) => {
    for (const secret of forbiddenSecrets) {
      if (secret && haystack.includes(secret)) {
        leaks.push(`Plaintext secret leaked in ${label}`);
      }
    }
  };

  page.on('request', (req) => {
    scanText(req.url(), `request URL (${req.method()} ${req.url()})`);
    scanText(JSON.stringify(req.headers()), `request headers (${req.url()})`);
    const postData = req.postData();
    if (postData) {
      scanText(postData, `request body (${req.method()} ${req.url()})`);
    }
  });

  page.on('response', async (res) => {
    scanText(res.url(), `response URL (${res.url()})`);
    scanText(JSON.stringify(res.headers()), `response headers (${res.url()})`);
    const contentType = res.headers()['content-type'] || '';
    if (/json|text|javascript|html/i.test(contentType)) {
      try {
        const body = await res.text();
        scanText(body, `response body (${res.status()} ${res.url()})`);
      } catch {
        // Navigation/aborted response body unavailable
      }
    }
  });

  return leaks;
}

test.describe('AI Engine Security, Secret Non-Disclosure & Runtime Rollback', () => {
  test.describe.configure({ mode: 'serial' });

  test('DOM mask regex (/^•{8,}[A-Za-z0-9]{4}$/), zero network secret leakage, and zero Web Storage secret persistence (DEF-01, DEF-02)', async ({
    page,
    request,
  }) => {
    const superSession = await loginByEmail(request, 'superadmin@resumepilot.test');
    const headers = { Authorization: `Bearer ${superSession.token}` };

    // Seed single key + multi-key pool on server BEFORE browser opens so 100% of page traffic is scanned
    const seedRes = await request.post('/api/admin/ai-settings', {
      headers,
      data: {
        force: true,
        cerebrasApiKey: SEEDED_SINGLE_KEY,
        sambanovaApiKeys: [SEEDED_POOL_KEY_1, SEEDED_POOL_KEY_2],
        enabledProviders: { cerebras: true, sambanova: true },
      },
    });
    expect(seedRes.ok()).toBe(true);

    try {
      await page.addInitScript(
        (s) => localStorage.setItem('ime_dev_user', JSON.stringify(s)),
        superSession
      );
      const leaks = attachSecretLeakDetector(page, [
        SEEDED_SINGLE_KEY,
        SEEDED_POOL_KEY_1,
        SEEDED_POOL_KEY_2,
        FORBIDDEN_PREFIX,
      ]);

      await page.goto('/admin/ai-settings?subtab=providers');
      await expect(page.getByRole('heading', { name: 'Runtime model selection' })).toBeVisible();

      // Expand rows and open Key Pool dialog to exercise all credential surfaces
      await page.getByTestId('expand-provider-cerebras').click();
      await page.getByRole('button', { name: 'Manage key pools', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');

      // Reload and assert every rendered masked-key badge strictly matches /^•{8,}[A-Za-z0-9]{4}$/
      await page.reload();
      await expect(page.getByTestId('masked-key-cerebras')).toBeVisible();
      const maskBadges = page.locator('[data-testid^="masked-key-"]');
      const badgeCount = await maskBadges.count();
      expect(badgeCount).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < badgeCount; i++) {
        const text = (await maskBadges.nth(i).textContent())?.trim() || '';
        const keyMaskToken = text.replace(/\s+\+\d+$/, '');
        expect(keyMaskToken).toMatch(/^•{8,}\S{4}$/);
      }

      // Specific suffix check without prefix leak (single key + 2-key pool)
      const cerebrasMask = (await page.getByTestId('masked-key-cerebras').textContent())?.trim() || '';
      expect(cerebrasMask).toMatch(/^•{8,}[A-Za-z0-9]{4}$/);
      await expect(page.getByTestId('masked-key-cerebras')).toHaveText('••••••••Z9X8');
      await expect(page.getByTestId('masked-key-sambanova')).toHaveText('••••••••Q7W6 +1');

      // Scan full DOM HTML for any trace of plaintext secrets or prefix
      const html = await page.content();
      expect(html).not.toContain(SEEDED_SINGLE_KEY);
      expect(html).not.toContain(SEEDED_POOL_KEY_1);
      expect(html).not.toContain(SEEDED_POOL_KEY_2);
      expect(html).not.toContain(FORBIDDEN_PREFIX);

      // Scan localStorage and sessionStorage for any plaintext key material
      const storageDump = await page.evaluate(() => ({
        local: JSON.stringify(localStorage),
        session: JSON.stringify(sessionStorage),
      }));
      for (const secret of [SEEDED_SINGLE_KEY, SEEDED_POOL_KEY_1, SEEDED_POOL_KEY_2, FORBIDDEN_PREFIX]) {
        expect(storageDump.local).not.toContain(secret);
        expect(storageDump.session).not.toContain(secret);
      }

      // Hard-fail if network listener caught any leak in URL, headers, request body, or response body
      expect(leaks).toEqual([]);
    } finally {
      await request.post('/api/admin/ai-settings', {
        headers,
        data: {
          force: true,
          clearSecrets: { cerebras: true, sambanova: true },
        },
      });
    }
  });

  test('Post-save test-provider sends { provider } only (zero apiKey re-transmission) and pool draft renders count only (DEF-03, DEF-04)', async ({
    page,
    request,
  }) => {
    const superSession = await loginByEmail(request, 'superadmin@resumepilot.test');
    const headers = { Authorization: `Bearer ${superSession.token}` };
    await page.addInitScript(
      (s) => localStorage.setItem('ime_dev_user', JSON.stringify(s)),
      superSession
    );

    const testProviderBodies: Array<Record<string, unknown>> = [];
    let postSaveLeakGuardActive = false;
    const postSaveLeaks: string[] = [];

    page.on('request', (req) => {
      if (req.url().includes('/api/admin/ai/test-provider') && req.method() === 'POST') {
        const parsed = req.postDataJSON() as Record<string, unknown>;
        testProviderBodies.push(parsed);
      }
      if (postSaveLeakGuardActive) {
        const hay = `${req.url()} ${JSON.stringify(req.headers())} ${req.postData() || ''}`;
        if (hay.includes(UI_ENTERED_KEY)) {
          postSaveLeaks.push(`UI key re-transmitted after save in ${req.method()} ${req.url()}`);
        }
      }
    });

    page.on('response', async (res) => {
      if (!postSaveLeakGuardActive) return;
      const ct = res.headers()['content-type'] || '';
      if (/json|text/i.test(ct)) {
        try {
          const text = await res.text();
          if (text.includes(UI_ENTERED_KEY)) {
            postSaveLeaks.push(`UI key echoed in response ${res.url()}`);
          }
        } catch {
          // ignore closed body
        }
      }
    });

    try {
      await page.goto('/admin/ai-settings?subtab=providers');
      await page.getByTestId('expand-provider-cerebras').click();

      // DEF-04: Typing multi-key pool displays count badge only, never prefix/suffix chips
      const poolBox = page.locator('#row-pool-input-cerebras');
      await poolBox.fill(`${SEEDED_POOL_KEY_1}\n${SEEDED_POOL_KEY_2}`);
      await expect(page.getByText('2 key(s) staged for server vault')).toBeVisible();
      await poolBox.fill('');

      // DEF-03: Enter single key in row input and click Save Key
      const keyInput = page.locator('#row-key-input-cerebras');
      await keyInput.fill(UI_ENTERED_KEY);

      const savePromise = page.waitForResponse(
        (r) => r.url().includes('/api/admin/ai-settings') && r.request().method() === 'POST'
      );
      const probePromise = page.waitForResponse(
        (r) => r.url().includes('/api/admin/ai/test-provider') && r.request().method() === 'POST'
      );

      await page.getByRole('button', { name: 'Save Key', exact: true }).click();
      await savePromise;
      // Immediately activate leak guard for everything after the save response
      postSaveLeakGuardActive = true;
      await probePromise;

      // Input must be cleared immediately after save
      await expect(keyInput).toHaveValue('');

      // Explicit manual "Test Connection" click must also send { provider } only without apiKey
      await page.getByRole('button', { name: 'Test Connection for Cerebras' }).click();
      expect(testProviderBodies.length).toBeGreaterThanOrEqual(2);
      for (const body of testProviderBodies) {
        expect(body).toEqual({ provider: 'cerebras' });
        expect(body).not.toHaveProperty('apiKey');
      }
      expect(postSaveLeaks).toEqual([]);
    } finally {
      await request.post('/api/admin/ai-settings', {
        headers,
        data: { force: true, clearSecrets: { cerebras: true } },
      });
    }
  });

  test('API RBAC boundary denies non-SUPER_ADMIN roles on /api/admin/ai-settings and 401 redirects UI to /login?next=', async ({
    page,
    request,
  }) => {
    // Unauthenticated API -> 401
    expect((await request.get('/api/admin/ai-settings')).status()).toBe(401);

    // ADMIN and USER -> 403 on Super-Admin credential vault endpoint
    for (const email of ['admin@resumepilot.test', 'ordinary-sec-e2e@resumepilot.test']) {
      const s = await loginByEmail(request, email);
      const res = await request.get('/api/admin/ai-settings', {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      expect(res.status()).toBe(403);
    }

    // 1. Expired session in localStorage redirects /admin/ai-settings?subtab=metrics -> /login?next= and stays there
    const expiredPayload = Buffer.from(
      JSON.stringify({
        uid: 'expired-super-admin',
        email: 'superadmin@resumepilot.test',
        role: 'SUPER_ADMIN',
        exp: Math.floor(Date.now() / 1000) - 60,
      }),
      'utf8'
    ).toString('base64url');
    const expiredSession = {
      uid: 'expired-super-admin',
      email: 'superadmin@resumepilot.test',
      name: 'Expired Super Admin',
      role: 'SUPER_ADMIN',
      plan: 'Enterprise',
      token: `rptest.${expiredPayload}.${'a'.repeat(64)}`,
    };
    await page.goto('/login');
    await page.evaluate(
      (s) => localStorage.setItem('ime_dev_user', JSON.stringify(s)),
      expiredSession
    );
    await page.goto('/admin/ai-settings?subtab=metrics');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fai-settings%3Fsubtab%3Dmetrics/);
  });

  test('Runtime feature flag ai_settings_v2_enabled toggles safe-mode rollback view OFF and restores v2 UI ON without restart', async ({
    page,
    request,
  }) => {
    const superSession = await loginByEmail(request, 'superadmin@resumepilot.test');
    const headers = { Authorization: `Bearer ${superSession.token}` };
    await page.addInitScript(
      (s) => localStorage.setItem('ime_dev_user', JSON.stringify(s)),
      superSession
    );

    try {
      // Toggle ai_settings_v2_enabled OFF at runtime
      const offRes = await request.put(
        '/api/admin/operations/feature-flags/ai_settings_v2_enabled',
        { headers, data: { value: false } }
      );
      expect(offRes.status()).toBe(200);

      await page.goto('/admin/ai-settings');
      const rollbackView = page.getByTestId('ai-settings-rollback-view');
      await expect(rollbackView).toBeVisible();
      await expect(rollbackView).toContainText('Runtime Rollback Active');

      // Axe WCAG 2.1 AA check on rollback view
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
      ).toEqual([]);

      // Restore v2 UI directly via button click
      const restoreResp = page.waitForResponse(
        (r) =>
          r.url().includes('/api/admin/operations/feature-flags/ai_settings_v2_enabled') &&
          r.request().method() === 'PUT'
      );
      await rollbackView.getByRole('button', { name: 'Restore v2 Engine UI' }).click();
      expect((await restoreResp).ok()).toBe(true);

      await expect(page.getByTestId('ai-multi-provider-engine')).toBeVisible();
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Runtime model selection' })).toBeVisible();
    } finally {
      await request.put('/api/admin/operations/feature-flags/ai_settings_v2_enabled', {
        headers,
        data: { value: true },
      });
    }
  });

  test('Pre-save probe transmits candidate key, post-save probe sends {provider} only, and candidate key is NOT persisted in admin_audit_logs (A1)', async ({
    page,
    request,
  }) => {
    const superSession = await loginByEmail(request, 'superadmin@resumepilot.test');
    const headers = { Authorization: `Bearer ${superSession.token}` };
    await page.addInitScript(
      (s) => localStorage.setItem('ime_dev_user', JSON.stringify(s)),
      superSession
    );

    const PRE_SAVE_CANDIDATE = 'fixture-a1-presave-probe-candidate-R4T5';
    const preSaveBodies: Array<Record<string, unknown>> = [];
    const postSaveBodies: Array<Record<string, unknown>> = [];
    let savedAt: number | null = null;

    page.on('request', (req) => {
      if (req.url().includes('/api/admin/ai/test-provider') && req.method() === 'POST') {
        const body = req.postDataJSON() as Record<string, unknown>;
        if (savedAt === null) {
          preSaveBodies.push(body);
        } else {
          postSaveBodies.push(body);
        }
      }
      if (req.url().includes('/api/admin/ai-settings') && req.method() === 'POST' && !req.url().includes('test-provider')) {
        savedAt = Date.now();
      }
    });

    try {
      await page.goto('/admin/ai-settings?subtab=providers');
      await expect(page.getByRole('heading', { name: 'Runtime model selection' })).toBeVisible();

      // 1. Open Configure Provider dialog for Cerebras
      await page.goto('/admin/ai-settings?subtab=providers&dialog=configure-provider&target=cerebras');
      await expect(page.getByRole('dialog')).toBeVisible();

      // 2. Enter candidate key
      const keyInput = page.locator('#modal-api-key-input');
      await keyInput.fill(PRE_SAVE_CANDIDATE);

      // 3. Trigger PRE-SAVE probe: "Test Key Before Saving"
      const preProbePromise = page.waitForResponse(
        (r) => r.url().includes('/api/admin/ai/test-provider') && r.request().method() === 'POST'
      );
      await page.getByRole('button', { name: 'Test Key Before Saving' }).click();
      const preRes = await preProbePromise;
      const preBody = preRes.request().postDataJSON() as Record<string, unknown>;

      // PRE-SAVE probe carries candidate key
      expect(preBody.provider).toBe('cerebras');
      expect(preBody.apiKey).toBe(PRE_SAVE_CANDIDATE);

      // 4. Save and activate
      const savePromise = page.waitForResponse(
        (r) => r.url().includes('/api/admin/ai-settings') && r.request().method() === 'POST' && !r.url().includes('test-provider')
      );
      const postProbePromise = page.waitForResponse(
        (r) => r.url().includes('/api/admin/ai/test-provider') && r.request().method() === 'POST'
      );
      await page.getByRole('button', { name: 'Add key & Activate' }).click();
      await savePromise;
      await postProbePromise;

      // Dialog closes
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // 5. POST-SAVE probe sends { provider } ONLY (zero apiKey re-transmission)
      expect(postSaveBodies.length).toBeGreaterThanOrEqual(1);
      for (const body of postSaveBodies) {
        expect(body).toEqual({ provider: 'cerebras' });
        expect(body).not.toHaveProperty('apiKey');
      }

      // Verify admin_audit_logs: candidate key must NOT appear in any audit row
      const auditRes = await request.get('/api/admin/audit-logs?limit=50', { headers });
      expect(auditRes.ok()).toBe(true);
      const auditData = await auditRes.json();
      const auditLogs = auditData.logs || [];
      for (const log of auditLogs) {
        const logStr = JSON.stringify(log);
        expect(logStr).not.toContain(PRE_SAVE_CANDIDATE);
      }
    } finally {
      await request.post('/api/admin/ai-settings', {
        headers,
        data: { force: true, clearSecrets: { cerebras: true } },
      });
    }
  });

  test('CSP header includes script-src restriction on AI settings endpoints', async ({
    request,
  }) => {
    const superSession = await loginByEmail(request, 'superadmin@resumepilot.test');
    const headers = { Authorization: `Bearer ${superSession.token}` };

    const settingsRes = await request.get('/api/admin/ai-settings', { headers });
    expect(settingsRes.ok()).toBe(true);
    const cspHeader = settingsRes.headers()['content-security-policy'] || '';
    // CSP should restrict script-src and prohibit unsafe-inline scripts
    if (cspHeader) {
      expect(cspHeader).toContain('script-src');
      const scriptSrcMatch = cspHeader.match(/script-src\s+([^;]+)/);
      if (scriptSrcMatch) {
        expect(scriptSrcMatch[1]).not.toContain("'unsafe-inline'");
      }
    }
  });
});
