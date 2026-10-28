/**
 * AUDIT-ONLY Playwright configuration (developer-review/), created for the
 * temporary-environment verification pass.
 *
 * Why this file exists instead of using frontend/playwright.config.ts:
 *  - the repository config declares two `webServer` entries, one of which
 *    (`scripts/start-ai-engine-e2e.cjs`) refuses to boot unless a disposable
 *    MariaDB 11.4 is reachable (see TEMP-ENVIRONMENT-MANIFEST.md);
 *  - this environment cannot obtain MariaDB, so the audit starts the Vite dev
 *    server and the Express API manually;
 *  - the repository config points at Playwright's CDN-hosted Chromium, which
 *    this sandbox cannot download; the browser here comes from the
 *    repository's own `@sparticuz/chromium` dependency instead.
 *
 * Everything else deliberately MIRRORS the repository configuration — the same
 * project names, viewports and `snapshotPathTemplate` — so that visual
 * regression tests COMPARE against the committed baselines in
 * frontend/tests/engine-responsive.spec.ts-snapshots/ instead of silently
 * writing new ones. (A first attempt used a single project named
 * `audit-chromium`; Playwright then wrote five new "*audit-chromium-linux.png"
 * baselines, i.e. the run proved nothing. Those files were deleted and the
 * config below reproduces the repository's project matrix.)
 *
 * Nothing in the application under audit is modified: this config only
 * supplies environment wiring. Spec files run unmodified from ../../frontend/tests.
 */
import { defineConfig, devices } from '@playwright/test';

if (!process.env.TEST_AUTH_HMAC_SECRET) {
  process.env.TEST_AUTH_HMAC_SECRET = 'local-test-auth-hmac-secret-super-secure-32chars';
}

const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4000';
const launchOptions = chromiumExecutable
  ? { executablePath: chromiumExecutable, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] }
  : { args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] };

export default defineConfig({
  testDir: '../../frontend/tests',
  outputDir: '../Evidence/artifacts/playwright-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list'], ['json', { outputFile: '../Evidence/artifacts/playwright-report.json' }]],
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  // identical to frontend/playwright.config.ts — required for baseline comparison
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{projectName}-{platform}{ext}',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions,
  },
  projects: [
    // ─── Preserved platform viewport projects (as in the repository config) ───
    {
      name: 'mobile-iphone-se',
      testIgnore: /engine-(responsive|security)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    },
    {
      name: 'tablet-ipad-portrait',
      testIgnore: /engine-(responsive|security)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: 'small-laptop',
      testIgnore: /engine-(responsive|security)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'standard-desktop',
      testIgnore: /engine-(responsive|security)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'ultrawide-desktop',
      testIgnore: /engine-(responsive|security)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    // ─── AI Multi-Provider Engine 5-viewport certification matrix ───
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 640 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: '4k', use: { ...devices['Desktop Chrome'], viewport: { width: 3840, height: 2160 } } },
  ],
});
