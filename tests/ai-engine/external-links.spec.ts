import { test, expect } from '@playwright/test';
import { installSession, mintSession, openEngine } from './helpers';

/**
 * External references — browser popup handling.
 *
 * Every provider card links out to that provider's documentation and key
 * console, and the telemetry health row links to the affected-service docs.
 * These are the only navigations that leave the console, so they must:
 *   • open a NEW tab, never navigate the console away (an operator mid-edit
 *     must not lose an unsaved draft),
 *   • carry rel="noopener noreferrer" so the target tab cannot reach back into
 *     the admin window,
 *   • point at the provider's real documentation host from the registry.
 *
 * The sandbox has no outbound network, so the popup itself may fail to load —
 * this test asserts the *browser-level* contract (a new window with the right
 * URL and no opener), not the remote page's content.
 */

/**
 * This sandbox has no outbound egress, so a real provider documentation host
 * cannot answer. Each provider host is fulfilled locally at the ORIGIN level
 * (the URL stays the real one) purely so the popup keeps its identity and the
 * assertions can address it; nothing about the console's own data is affected.
 */
const PROVIDER_HOSTS = [
  'docs.api.nvidia.com',
  'ai.google.dev',
  'platform.openai.com',
  'console.groq.com',
  'openrouter.ai',
  'api-docs.deepseek.com',
  'build.nvidia.com',
  'aistudio.google.com',
  'platform.deepseek.com',
];

async function stubProviderHosts(context: import('@playwright/test').BrowserContext) {
  await context.route(
    (url) => PROVIDER_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>provider documentation (offline stub)</title><h1>offline stub</h1>',
      }),
  );
}

const DOCS_HOSTS: Record<string, string> = {
  nvidia: 'docs.api.nvidia.com',
  gemini: 'ai.google.dev',
  openai: 'platform.openai.com',
  groq: 'console.groq.com',
  openrouter: 'openrouter.ai',
  deepseek: 'api-docs.deepseek.com',
};

test.describe('External references open in a popup', () => {
  test('provider documentation links open a new tab and never navigate the console @smoke', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await stubProviderHosts(context);
    await openEngine(page, 'providers');

    const tabs = page.getByTestId('ai-engine-tabs');
    for (const provider of Object.keys(DOCS_HOSTS)) {
      const card = page.getByTestId(`ai-engine-provider-${provider}`);
      const docs = card.getByRole('link', { name: /API docs/i }).first();
      await docs.scrollIntoViewIfNeeded();
      await expect(docs, `${provider} docs link`).toBeVisible();

      // Structural guarantee: an outbound reference must never retain a handle
      // to this window.
      const rel = (await docs.getAttribute('rel')) ?? '';
      expect(rel, `${provider} docs rel`).toContain('noopener');
      expect(rel, `${provider} docs rel`).toContain('noreferrer');
      expect(await docs.getAttribute('target'), `${provider} target`).toBe('_blank');
      const href = (await docs.getAttribute('href')) ?? '';
      expect(href, `${provider} docs href`).toContain(DOCS_HOSTS[provider]);

      const [popup] = await Promise.all([
        page.waitForEvent('popup', { timeout: 15_000 }),
        docs.click(),
      ]);
      expect(popup.url(), `${provider} popup URL`).toContain(DOCS_HOSTS[provider]);
      // A noopener popup must not be able to call back into the admin window.
      expect(await popup.evaluate(() => window.opener === null).catch(() => true)).toBe(true);
      await popup.close();

      // The console is untouched: same URL, same section, tab strip still live.
      expect(new URL(page.url()).pathname).toMatch(/\/admin\/ai-settings$/);
      await expect(page.getByTestId('ai-engine-section-providers')).toBeVisible();
      await expect(tabs).toBeVisible();
    }
  });

  test('provider key consoles open as popups with the same isolation', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await stubProviderHosts(context);
    await openEngine(page, 'providers');

    const card = page.getByTestId('ai-engine-provider-openai');
    const keyConsole = card.getByRole('link', { name: /Key console/i }).first();
    await keyConsole.scrollIntoViewIfNeeded();

    const rel = (await keyConsole.getAttribute('rel')) ?? '';
    expect(rel).toContain('noopener');

    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 15_000 }),
      keyConsole.click(),
    ]);
    expect(popup.url()).toContain('platform.openai.com');
    await popup.close();

    await expect(page.getByTestId('ai-engine-section-providers')).toBeVisible();
  });

  test('an unsaved draft survives leaving the page to read provider documentation @smoke', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await stubProviderHosts(context);
    await openEngine(page, 'providers');

    // Stage an edit, then use the external link — the classic way an operator
    // loses work in an admin console.
    await page.getByTestId('ai-engine-key-groq').fill('gsk_popup_survival_probe_0123456789');
    await expect(page.getByTestId('ai-engine-unsaved')).toBeVisible();

    const docs = page.getByTestId('ai-engine-provider-groq').getByRole('link', { name: /API docs/i }).first();
    await docs.scrollIntoViewIfNeeded();
    const [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 15_000 }), docs.click()]);
    await popup.close();

    // Still dirty, still holding the staged value, still on the same revision.
    await expect(page.getByTestId('ai-engine-unsaved')).toBeVisible();
    await expect(page.getByTestId('ai-engine-key-groq')).toHaveValue('gsk_popup_survival_probe_0123456789');

    await page.getByRole('button', { name: /Discard/i }).click();
    await expect(page.getByTestId('ai-engine-unsaved')).toHaveCount(0);
  });

  test('the telemetry health row links out to the affected service documentation', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await openEngine(page, 'telemetry');

    const health = page.getByTestId('ai-engine-telemetry-health');
    const docs = health.getByRole('link', { name: /docs|documentation|runbook/i }).first();
    if ((await docs.count()) === 0) {
      // The collector only exposes `docsHref` for services that declare one; an
      // absent link must be absent, not a dead placeholder.
      await expect(health.getByRole('link')).toHaveCount(0);
      return;
    }
    const rel = (await docs.getAttribute('rel')) ?? '';
    expect(rel).toContain('noopener');
    await expect(docs).toHaveAttribute('target', '_blank');
  });
});
