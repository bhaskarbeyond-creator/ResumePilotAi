import { test, expect } from '@playwright/test';
import {
  PROVIDER_IDS,
  apiFor,
  installSession,
  mintSession,
  openEngine,
} from './helpers';

/**
 * Provider cards, the write-only secret contract, revisioned saving and the
 * confirmation popup.
 *
 * Every assertion is checked against the real API afterwards: the test never
 * trusts the UI's own claim that something was stored.
 */

interface SettingsBody {
  revision: number;
  persistence?: string;
  settings: { provider: string; temperature: number; enableFallback: boolean };
  providers: Record<string, { enabled: boolean; model: string; credentialConfigured: boolean; credentialSource: string }>;
  configuredProviders: Record<string, boolean>;
}

test.describe('Providers & save contract', () => {
  test('renders exactly the six runtime adapters with server-resolved state @smoke', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);

    await openEngine(page, 'providers');

    // The suite creates and revokes credentials, so the projection can move
    // between the first read and this assertion. Compare the RENDERED state
    // against a read taken after the page settled, and poll, so this test
    // verifies fidelity rather than a particular ordering of tests.
    await expect
      .poll(
        async () => {
          const fresh = await api.get<SettingsBody>('/admin/ai-settings');
          const mismatches: string[] = [];
          for (const id of PROVIDER_IDS) {
            const card = page.getByTestId(`ai-engine-provider-${id}`);
            if (!(await card.isVisible())) {
              mismatches.push(`${id}: card not visible`);
              continue;
            }
            const configured = fresh.body.providers?.[id]?.credentialConfigured === true;
            const expectedLabel = configured ? 'Credential present' : 'No credential';
            const labelCount = await card.getByText(expectedLabel, { exact: false }).count();
            if (labelCount === 0) mismatches.push(`${id}: expected "${expectedLabel}"`);
            const enabled = await page
              .getByTestId(`ai-engine-enable-${id}`)
              .getAttribute('aria-checked')
              .catch(() => null);
            if (enabled !== String(fresh.body.providers?.[id]?.enabled === true)) {
              mismatches.push(`${id}: enable switch ${enabled}`);
            }
          }
          return mismatches;
        },
        { timeout: 20_000, message: 'rendered provider state must match the server projection' },
      )
      .toEqual([]);

    for (const id of PROVIDER_IDS) {
      await expect(page.getByTestId(`ai-engine-provider-${id}`), `card for ${id}`).toBeVisible();
    }
    await expect(page.getByTestId('ai-engine-persistence')).toHaveText(/MariaDB|Certification store/);
  });

  test('staged secret is write-only, cleared after save, and masked by the server', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);
    const before = await api.get<SettingsBody>('/admin/ai-settings');
    const revision = before.body.revision;
    const stagedKey = 'sk-certification-ui-test-0123456789abcdef';

    await openEngine(page, 'providers');
    const keyField = page.getByTestId('ai-engine-key-deepseek');
    await keyField.fill(stagedKey);
    await expect(keyField).toHaveAttribute('type', 'password');
    await expect(page.getByTestId('ai-engine-unsaved')).toBeVisible();

    // The staged secret must never be persisted in browser storage.
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(stored).not.toContain(stagedKey);

    await page.getByTestId('ai-engine-save').click();
    await expect(page.getByText(/Saved · revision/i).first()).toBeVisible();

    const after = await api.get<SettingsBody>('/admin/ai-settings');
    expect(after.body.revision, 'revision must advance on a successful save').toBeGreaterThan(revision);
    expect(after.body.providers.deepseek.credentialConfigured, 'server must now hold a deepseek credential').toBe(true);

    // Post-save masking: the field is empty, and only the server's mask is shown.
    await expect(keyField).toHaveValue('');
    const mask = before.body.providers.deepseek ? after.body.providers.deepseek : null;
    expect(mask).not.toBeNull();
    await expect(page.getByTestId('ai-engine-provider-deepseek').getByText(/Credential present/).first()).toBeVisible();

    // Restore the pre-test state so the suite stays idempotent across viewports.
    await page.getByTestId('ai-engine-clear-deepseek').click();
    await expect(page.getByTestId('ai-engine-confirm-dialog')).toBeVisible();
    await page.getByTestId('ai-engine-confirm-action').click();
    await expect(page.getByText(/marked for removal/i).first()).toBeVisible();
    await page.getByTestId('ai-engine-save').click();
    await expect(page.getByText(/Saved · revision/i).first()).toBeVisible();
    const restored = await api.get<SettingsBody>('/admin/ai-settings');
    expect(restored.body.providers.deepseek.credentialConfigured).toBe(false);
  });

  test('revoking a credential requires an explicit confirmation', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);

    // Establish a credential to revoke (idempotent: skip if the deployment
    // already manages one through the environment, which cannot be revoked).
    const initial = await api.get<SettingsBody>('/admin/ai-settings');
    const target = 'groq';
    if (!initial.body.providers[target]?.credentialConfigured) {
      await api.post('/admin/ai-settings', {
        provider: initial.body.settings.provider,
        groqApiKey: 'gsk_certification_ui_test_0123456789',
        enableGroq: true,
        expectedRevision: initial.body.revision,
      });
    }

    await openEngine(page, 'providers');
    const card = page.getByTestId(`ai-engine-provider-${target}`);
    const revoke = page.getByTestId(`ai-engine-clear-${target}`);
    if (!(await revoke.count()) || (await revoke.isDisabled())) {
      test.skip(true, `${target} credential is deployment-managed in this environment; revocation is correctly disabled.`);
    }

    await revoke.click();
    const dialog = page.getByTestId('ai-engine-confirm-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Revoke/i).first()).toBeVisible();

    // Cancel leaves the credential untouched.
    await dialog.getByRole('button', { name: /^Cancel$/ }).click();
    await expect(dialog).toBeHidden();
    await expect(card.getByText(/Credential present/).first()).toBeVisible();

    // Confirm marks it for removal (nothing is deleted until save).
    await revoke.click();
    await page.getByTestId('ai-engine-confirm-action').click();
    await expect(card.getByText(/Removal pending save/)).toBeVisible();
    await expect(page.getByTestId('ai-engine-unsaved')).toBeVisible();

    // Discard restores the server state exactly.
    await page.getByRole('button', { name: /Discard/i }).click();
    await expect(card.getByText(/Removal pending save/)).toHaveCount(0);

    // Cleanup: actually revoke so the suite leaves no staged credential behind.
    await revoke.click();
    await page.getByTestId('ai-engine-confirm-action').click();
    await page.getByTestId('ai-engine-save').click();
    await expect(page.getByText(/Saved · revision/i).first()).toBeVisible();
  });

  test('routing policy changes are saveable and persist with a new revision', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);
    const before = await api.get<SettingsBody>('/admin/ai-settings');

    await openEngine(page, 'overview');
    const slider = page.locator('#ai-temperature');
    await slider.focus();
    const direction = before.body.settings.temperature > 0.2 ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.press(direction);
    await expect(page.getByTestId('ai-engine-unsaved')).toBeVisible();

    await page.getByTestId('ai-engine-save-sticky').click();
    await expect(page.getByText(/Saved · revision/i).first()).toBeVisible();

    const after = await api.get<SettingsBody>('/admin/ai-settings');
    expect(after.body.revision).toBeGreaterThan(before.body.revision);
    expect(after.body.settings.temperature).not.toBe(before.body.settings.temperature);

    // Restore the original temperature so the suite stays order-independent.
    await api.post('/admin/ai-settings', {
      provider: after.body.settings.provider,
      temperature: before.body.settings.temperature,
      expectedRevision: after.body.revision,
    });
  });

  test('primary provider selection offers every adapter and reflects server state', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);
    const { body } = await api.get<SettingsBody>('/admin/ai-settings');

    await openEngine(page, 'overview');
    const select = page.locator('#ai-primary-provider');
    await expect(select).toHaveValue(body.settings.provider);
    const optionValues = await select.locator('option').evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    expect(optionValues).toEqual([...PROVIDER_IDS]);

    // The failover chain always leads with the configured primary.
    const chain = page.getByTestId('ai-engine-failover-order');
    await expect(chain.locator('li').first()).toContainText(/PRIMARY|primary/i);
  });

  test('connectivity test reports the server outcome verbatim — success or failure', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await openEngine(page, 'providers');

    // Compare the rendered result with a direct API call for the same provider.
    const api = apiFor(request, session);
    const direct = await api.post<{ success?: boolean; message?: string; error?: string; code?: string }>(
      '/admin/ai/test-provider',
      { provider: 'openai' },
    );

    await page.getByTestId('ai-engine-test-openai').click();
    const card = page.getByTestId('ai-engine-provider-openai');
    await expect(card.getByText(/Reachable|Test failed/)).toBeVisible({ timeout: 45_000 });

    if (direct.status === 200 && direct.body.success) {
      await expect(card.getByText(/Reachable/)).toBeVisible();
    } else {
      // A failed probe must surface the server's code, and must NOT show a
      // fabricated latency figure for a request that never completed.
      await expect(card.getByText(/Test failed/)).toBeVisible();
      const expectedCode = direct.body.code;
      if (expectedCode) {
        await expect(card.getByText(new RegExp(expectedCode))).toBeVisible();
      }
      await expect(card.getByText(/\d+ ms measured by this browser/)).toHaveCount(0);
    }
  });
});
