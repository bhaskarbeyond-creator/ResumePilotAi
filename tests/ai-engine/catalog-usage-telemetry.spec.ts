import { test, expect } from '@playwright/test';
import {
  PROVIDER_IDS,
  apiFor,
  installSession,
  mintSession,
  openEngine,
} from './helpers';

/**
 * Catalogue, quota ledger and telemetry.
 *
 * These three surfaces are the ones most likely to be "helpfully" faked, so the
 * assertions here are specifically about provenance: every number has to match a
 * real response, and a missing response has to look missing.
 */

test.describe('Model catalogue', () => {
  test('empty state explains that nothing has been fetched yet', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await openEngine(page, 'catalog');
    await expect(page.getByText(/No catalogue has been discovered yet/i)).toBeVisible();
    // Placeholder model rows must never be rendered before discovery.
    await expect(page.getByTestId('ai-engine-catalog-rows').locator('li')).toHaveCount(0);
  });

  test('discovery without a resolvable credential surfaces the server error code', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);
    const settings = await api.get<{ providers: Record<string, { credentialConfigured: boolean }> }>('/admin/ai-settings');
    const unconfigured = PROVIDER_IDS.find((id) => settings.body.providers?.[id]?.credentialConfigured !== true);
    test.skip(!unconfigured, 'Every provider already has a credential in this environment.');

    const direct = await api.post<{ code?: string }>('/admin/ai/fetch-models', { provider: unconfigured });
    expect(direct.body.code, 'unconfigured discovery must be refused by the backend').toBe('AI_PROVIDER_NOT_CONFIGURED');

    await openEngine(page, 'catalog');
    await page.getByTestId(`ai-engine-discovery-run-${unconfigured}`).click();
    const status = page.getByTestId(`ai-engine-discovery-status-${unconfigured}`);
    await expect(status.getByText(/AI_PROVIDER_NOT_CONFIGURED|no server-side credential/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('ai-engine-catalog-rows').locator('li')).toHaveCount(0);
  });

  test('configured credentials are the only ones offered for bulk discovery', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);
    const settings = await api.get<{ providers: Record<string, { credentialConfigured: boolean }> }>('/admin/ai-settings');
    const configuredCount = PROVIDER_IDS.filter((id) => settings.body.providers?.[id]?.credentialConfigured).length;

    await openEngine(page, 'catalog');
    await page.getByTestId('ai-engine-discover-all').click();
    if (configuredCount === 0) {
      await expect(page.getByText(/No provider can be discovered/i)).toBeVisible();
    } else {
      await expect(page.getByText(/No provider can be discovered/i)).toHaveCount(0);
    }
  });
});

test.describe('Quota & usage', () => {
  test('renders the ledger when the server can read it, and an honest error when it cannot', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);
    const direct = await api.get<{ success: boolean; todayRecords?: unknown[]; code?: string }>('/admin/ai/quota-stats');

    await openEngine(page, 'usage');

    if (direct.status === 200 && direct.body.success) {
      await expect(page.getByTestId('ai-engine-quota-limits')).toBeVisible();
      await expect(page.getByTestId('ai-engine-quota-ledger')).toBeVisible();
      const rows = direct.body.todayRecords?.length ?? 0;
      if (rows === 0) {
        await expect(page.getByText(/No AI usage recorded today/i)).toBeVisible();
      } else {
        await expect(page.getByTestId('ai-engine-quota-ledger').locator('li')).toHaveCount(rows);
      }
    } else {
      await expect(page.getByText(/Ledger read failed/i)).toBeVisible();
      if (direct.body.code) {
        await expect(page.getByText(new RegExp(`Ledger read failed \\(${direct.body.code}\\)`)).first()).toBeVisible();
      }
      // No invented tier limits and no zeroed usage table on a failed read.
      await expect(page.getByTestId('ai-engine-quota-limits')).toHaveCount(0);
      await expect(page.getByText(/No AI usage recorded today/i)).toHaveCount(0);
    }
  });

  test('quota mutations are guarded by a confirmation popup', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);
    const direct = await api.get<{ success: boolean }>('/admin/ai/quota-stats');
    test.skip(direct.status !== 200, 'The usage ledger is not readable in this environment, so no reset control is rendered.');

    await openEngine(page, 'usage');
    await page.getByTestId('ai-engine-reset-all').click();
    const dialog = page.getByTestId('ai-engine-confirm-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Reset the AI quota for every user/i)).toBeVisible();
    await dialog.getByRole('button', { name: /^Cancel$/ }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe('Telemetry provenance', () => {
  test('health row, beacon and credential matrix match the server responses', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);

    const service = await api.get<{ service: { state: string; reason: string; metrics: Record<string, number> } }>(
      '/platform/operational-status/ai-providers',
    );
    const settings = await api.get<{
      providers: Record<string, { enabled: boolean; credentialConfigured: boolean; model: string }>;
    }>('/admin/ai-settings');

    await openEngine(page, 'telemetry');
    const health = page.getByTestId('ai-engine-telemetry-health');
    await expect(health.getByText(service.body.service.state, { exact: false }).first()).toBeVisible();

    const beacon = page.getByTestId('ai-engine-telemetry-beacon');
    const availability = await request.get('http://localhost:8080/api/service-availability');
    if (availability.ok()) {
      const payload = (await availability.json()) as { ai?: { providers?: boolean } };
      const value = payload.ai?.providers === true ? 'true' : 'false';
      await expect(beacon.getByText(value).first()).toBeVisible();
    }

    // Every provider row in the credential matrix reflects the API, not a guess.
    for (const id of PROVIDER_IDS) {
      const model = settings.body.providers?.[id]?.model ?? '';
      if (!model) continue;
      await expect(page.getByText(model, { exact: true }).first()).toBeVisible();
    }
  });

  test('the engine header status agrees with the health collector', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);
    const service = await api.get<{ service: { state: string } }>('/platform/operational-status/ai-providers');

    await openEngine(page);
    const expectedLabel =
      service.body.service.state === 'OPERATIONAL'
        ? 'Operational'
        : service.body.service.state === 'NOT_CONFIGURED'
          ? 'Not configured'
          : service.body.service.state === 'UNKNOWN'
            ? 'Unknown'
            : service.body.service.state === 'DEGRADED'
              ? 'Degraded'
              : service.body.service.state === 'UNAVAILABLE'
                ? 'Unavailable'
                : 'Attention';
    await expect(page.getByTestId('ai-engine-status')).toContainText(expectedLabel);
  });
});
