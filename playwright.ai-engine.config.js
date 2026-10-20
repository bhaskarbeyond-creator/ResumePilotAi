// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * AI Multi-Provider Engine — cross-viewport acceptance suite.
 *
 * The suite drives the REAL stack: the Vite dev server proxies `/api/*` to the
 * Express backend, which runs against its own repository layer. Nothing about
 * the engine's data is mocked by default, so every assertion about credentials,
 * revisions, catalogue responses and health rows is an assertion about real
 * server output. The only intercepted requests are in the explicitly named
 * failure-path tests, where a server error must be *produced* to prove the UI
 * reports it honestly instead of inventing a success.
 *
 * Five viewports are exercised because the engine console collapses at three
 * distinct breakpoints (1-col cards, 2-col cards, sticky action bar):
 *   375 (iPhone SE/13 mini) · 414 (Plus/Pro Max) · 768 (iPad portrait)
 *   1280 (laptop)            · 1920 (desktop)
 *
 * `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` / `PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH`
 * let a sandbox point at any compatible Chromium build.
 */
const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none',
];

const launchOptions = {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: CHROMIUM_ARGS,
  ...(process.env.PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH
    ? {
        env: {
          ...process.env,
          LD_LIBRARY_PATH: process.env.PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH,
          FONTCONFIG_PATH: process.env.FONTCONFIG_PATH || '/tmp/chromium-libs',
        },
      }
    : {}),
};

const viewports = [
  { name: 'mobile-375', width: 375, height: 812, isMobile: true },
  { name: 'mobile-414', width: 414, height: 896, isMobile: true },
  { name: 'tablet-768', width: 768, height: 1024, isMobile: true },
  { name: 'laptop-1280', width: 1280, height: 800, isMobile: false },
  { name: 'desktop-1920', width: 1920, height: 1080, isMobile: false },
];

export default defineConfig({
  testDir: './tests/ai-engine',
  testMatch: /.*\.spec\.(ts|js|mjs)$/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: 'playwright-report/ai-engine', open: 'never' }]] : [['list']],
  outputDir: 'test-results/ai-engine',
  use: {
    baseURL: process.env.AI_ENGINE_WEB_ORIGIN || 'http://localhost:4000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions,
  },
  webServer: [
    {
      // Frontend (clean-room IME365 app). Proxies /api → the backend below.
      command: 'npm --prefix frontend run dev',
      url: 'http://localhost:4000',
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Backend in certification mode: no MariaDB required, identity comes from
      // the non-production HMAC verifier, and the Super Admin role is granted
      // only through the server-side allowlist below.
      command: 'node index.js',
      cwd: 'backend',
      url: 'http://localhost:8080/api/service-availability',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        PORT: '8080',
        IN_MEMORY_REPOSITORY: '1',
        TEST_AUTH_HMAC_SECRET:
          process.env.TEST_AUTH_HMAC_SECRET || 'local-test-auth-hmac-secret-super-secure-32chars',
        PREVIEW_SUPER_ADMIN_EMAILS: 'ai-engine-super@ime365.test',
        PREVIEW_ADMIN_EMAILS: 'ai-engine-admin@ime365.test',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
  /**
   * Tag strategy (keeps the matrix honest without a 15-minute run):
   *   @responsive — the layout matrix. Runs on ALL five viewports.
   *   @smoke      — the deepest single-journey checks (deep link, provider
   *                 render, save contract). Runs on ALL five viewports.
   *   untagged    — the full behavioural suite. Runs on the two large viewports,
   *                 where reading a dense console is the realistic use case.
   * The mobile projects therefore still prove rendering, reachability, dialogs
   * and the primary journey on real small screens.
   */
  projects: viewports.map((vp) => {
    const small = vp.width < 1024;
    return {
      name: vp.name,
      grep: small ? /@responsive|@smoke/ : undefined,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        deviceScaleFactor: 1,
      },
    };
  }),
});
