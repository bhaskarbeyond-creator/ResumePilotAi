/**
 * Playwright Deep Link Verification Suite for AI Multi-Provider Engine
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  viteFixtureDefines,
  installAuthenticatedSession,
} from './helpers/enterprise-fixture.mjs';

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const frontendRoot = path.resolve('frontend');
  const vite = await createServer({
    root: frontendRoot,
    configFile: path.resolve(frontendRoot, 'vite.config.ts'),
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'error',
    define: viteFixtureDefines(),
  });
  const server = await vite.listen();
  const base = `http://127.0.0.1:${server.config.server.port}`;

  const fixtureHandler = async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/admin/ai-settings')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          revision: 53,
          catalog: [],
          fallbackChains: [],
          curatedModels: [],
          cooldowns: {},
          settings: { provider: 'nvidia' },
          maskedKeys: {},
          configuredProviders: { nvidia: true },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    });
  };

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await installAuthenticatedSession(page, {
      uid: 'superadmin',
      email: 'admin@ime365.local',
      displayName: 'System Admin',
      claims: { role: 'SUPER_ADMIN', permissions: ['*'] },
    });
    await page.route('**/api/**', fixtureHandler);

    console.log('[DeepLink Tests] Testing Deep Links and Subtab Navigation...');

    // 1. Alias: /admin?tab=ai
    await page.goto(`${base}/admin?tab=ai`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="provider-category-tabs"]', { timeout: 15_000 });
    console.log('  ✓ /admin?tab=ai routes to AI Settings correctly');

    // 2. Alias: /admin?tab=aiSettings
    await page.goto(`${base}/admin?tab=aiSettings`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="provider-category-tabs"]', { timeout: 15_000 });
    console.log('  ✓ /admin?tab=aiSettings routes to AI Settings correctly');

    // 3. Canonical: /admin?tab=ai-settings
    await page.goto(`${base}/admin?tab=ai-settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="provider-category-tabs"]', { timeout: 15_000 });
    console.log('  ✓ /admin?tab=ai-settings routes to AI Settings correctly');

    // 4. Subtab query: ?subtab=models
    await page.goto(`${base}/admin?tab=ai-settings&subtab=models`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Models & Fallback Chains', { timeout: 10_000 });
    const hasChainControls = await page.getByRole('button', { name: /Save Fallback Chain/i }).isVisible();
    assert.ok(hasChainControls, 'Subtab query ?subtab=models must activate Models & Fallback Chains tab');
    console.log('  ✓ /admin?tab=ai-settings&subtab=models activates Models tab');

    // 5. Subtab query: ?subtab=claude
    await page.goto(`${base}/admin?tab=ai-settings&subtab=claude`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Claude Code CLI & Agent Proxy Configuration', { timeout: 10_000 });
    console.log('  ✓ /admin?tab=ai-settings&subtab=claude activates Claude tab');

    // 6. Subtab query: ?subtab=playground
    await page.goto(`${base}/admin?tab=ai-settings&subtab=playground`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=AI Multi-Provider Playground', { timeout: 10_000 });
    console.log('  ✓ /admin?tab=ai-settings&subtab=playground activates Playground tab');

    // 7. Subtab hash: #models
    await page.goto(`${base}/admin?tab=ai-settings#models`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Models & Fallback Chains', { timeout: 10_000 });
    console.log('  ✓ /admin?tab=ai-settings#models activates Models tab via hash');

    // 8. Subtab hash: #claude
    await page.goto(`${base}/admin?tab=ai-settings#claude`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Claude Code CLI & Agent Proxy Configuration', { timeout: 10_000 });
    console.log('  ✓ /admin?tab=ai-settings#claude activates Claude tab via hash');

    // 9. Subtab hash: #playground
    await page.goto(`${base}/admin?tab=ai-settings#playground`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=AI Multi-Provider Playground', { timeout: 10_000 });
    console.log('  ✓ /admin?tab=ai-settings#playground activates Playground tab via hash');

    // 10. In-page Tab Click URL synchronization
    await page.getByRole('button', { name: /^Keys/i }).click();
    assert.ok(page.url().includes('subtab=keys'), 'Clicking Keys tab must update URL search params to subtab=keys');
    console.log('  ✓ In-page tab click synchronizes URL query params');

    console.log('[DeepLink Tests] ALL 10 DEEP LINK CHECKS PASSED!');
  } finally {
    await browser.close();
    await vite.close();
  }
}

main().catch(err => {
  console.error('[DeepLink Tests] FAILED:', err);
  process.exit(1);
});
