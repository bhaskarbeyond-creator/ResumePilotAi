import { test, expect } from '@playwright/test';
import { apiFor, installSession, mintSession, openEngine, releaseCredential, seedCredential } from './helpers';

/**
 * Popups and failure paths.
 *
 * These are the only tests that intercept a response, and each interception is
 * used to PRODUCE a real server-side failure shape (403 reauth, 409 conflict)
 * so the UI's handling can be proven. Everything else in this suite talks to
 * the live backend.
 */

test.describe('Popups', () => {
  test('reauthentication popup retries the exact pending save', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);

    let failOnce = true;
    await page.route('**/api/admin/ai-settings', async (route) => {
      if (route.request().method() === 'POST' && failOnce) {
        failOnce = false;
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'RECENT_AUTH_REQUIRED',
              message: 'Recent authentication is required for this operation.',
            },
          }),
        });
        return;
      }
      await route.continue();
    });

    await openEngine(page, 'overview');
    await page.locator('#ai-temperature').focus();
    await page.keyboard.press('ArrowRight');
    await page.getByTestId('ai-engine-save-sticky').click();

    const dialog = page.getByTestId('ai-engine-reauth-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Reauthentication required/i)).toBeVisible();
    await expect(dialog.getByText('RECENT_AUTH_REQUIRED')).toBeVisible();
    await expect(dialog.getByText(/Save AI engine configuration/)).toBeVisible();

    // A real 403 is not a success: no "Saved" toast may appear yet.
    await expect(page.getByText(/Saved · revision/i)).toHaveCount(0);

    await page.getByTestId('ai-engine-reauth-retry').click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Saved · revision/i).first()).toBeVisible();

    await page.unroute('**/api/admin/ai-settings');
  });

  test('a revision conflict is reported, and the panel reloads the newest state', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);

    await page.route('**/api/admin/ai-settings', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'AI_SETTINGS_CONFLICT', message: 'AI settings changed after this panel loaded.' },
          }),
        });
        return;
      }
      await route.continue();
    });

    await openEngine(page, 'overview');
    await page.locator('#ai-temperature').focus();
    await page.keyboard.press('ArrowLeft');
    await page.getByTestId('ai-engine-save-sticky').click();

    await expect(page.getByText(/Save failed/i)).toBeVisible();
    await expect(page.getByText('AI_SETTINGS_CONFLICT').first()).toBeVisible();
    await expect(page.getByText(/review before retrying/i).first()).toBeVisible();
    // The edit is preserved so nothing the operator typed is lost.
    await expect(page.getByTestId('ai-engine-unsaved')).toBeVisible();

    await page.unroute('**/api/admin/ai-settings');
  });

  test('model detail popup shows the discovered model and closes on Escape', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);

    // UI-only test: a deterministic catalogue response is required to exercise
    // the row → detail dialog path. The payload shape is the backend's own.
    await page.route('**/api/admin/ai/fetch-models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          provider: 'openai',
          count: 2,
          models: [
            { id: 'gpt-4o-mini', name: 'gpt-4o-mini', owned_by: 'openai' },
            { id: 'gpt-4o', name: 'gpt-4o', owned_by: 'openai' },
          ],
        }),
      });
    });

    await openEngine(page, 'catalog');
    await page.getByTestId('ai-engine-discovery-run-openai').click();
    await expect(page.getByTestId('ai-engine-catalog-rows').locator('li')).toHaveCount(2);

    await page.getByTestId('ai-engine-catalog-row-openai-gpt-4o-mini').click();
    const dialog = page.getByTestId('ai-engine-model-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('gpt-4o-mini', { exact: false }).first()).toBeVisible();
    await expect(dialog.getByText('openai', { exact: true }).first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.unroute('**/api/admin/ai/fetch-models');
  });

  test('confirmation and reauth dialogs trap focus and restore it on close', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);
    // A real credential is required for a revoke control to exist at all.
    const seeded = await seedCredential(api, 'groq');
    await openEngine(page, 'providers');

    const confirmTarget = page.getByTestId('ai-engine-clear-groq');
    const available = (await confirmTarget.count()) > 0 && !(await confirmTarget.isDisabled());
    if (!available) {
      if (seeded) await releaseCredential(api, 'groq');
      test.skip(true, 'The groq credential is deployment-managed; revocation is correctly disabled.');
    }

    await confirmTarget.focus();
    await confirmTarget.click();
    const dialog = page.getByTestId('ai-engine-confirm-dialog');
    await expect(dialog).toBeVisible();
    // Focus must move inside the dialog, not stay on the trigger behind it.
    const focusInside = await page.evaluate(() => {
      const dialogEl = document.querySelector('[data-testid="ai-engine-confirm-dialog"]');
      return Boolean(dialogEl && dialogEl.contains(document.activeElement));
    });
    expect(focusInside).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(confirmTarget).toBeFocused();

    if (seeded) await releaseCredential(api, 'groq');
  });
});

test.describe('Failure honesty', () => {
  test('a rejected settings read renders a retryable error instead of empty panels', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);

    await page.route('**/api/admin/ai-settings', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'AI_SETTINGS_UNAVAILABLE', message: 'Settings store is unreachable.' } }),
      });
    });

    await page.goto('/admin/ai-settings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ai-engine-settings-error')).toBeVisible();
    await expect(page.getByText('AI_SETTINGS_UNAVAILABLE').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Retry load/i })).toBeVisible();
    // Critically: no fabricated default configuration.
    await expect(page.getByTestId('ai-engine-provider-nvidia')).toHaveCount(0);
    await page.unroute('**/api/admin/ai-settings');
  });

  test('a dead availability beacon does not invent provider health', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await page.route('**/api/service-availability', (route) => route.fulfill({ status: 503, body: '{}' }));
    await page.route('**/api/platform/operational-status/ai-providers', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) }),
    );

    await openEngine(page, 'telemetry');
    await expect(page.getByText(/Health row unavailable|Beacon unavailable/i).first()).toBeVisible();
    // The beacon contract has no latency/percentage fields, so none may appear.
    await expect(page.getByText(/\d+% (uptime|success)/i)).toHaveCount(0);
    await page.unroute('**/api/service-availability');
    await page.unroute('**/api/platform/operational-status/ai-providers');
  });
});
