import { defineConfig, devices } from '@playwright/test';

if (!process.env.TEST_AUTH_HMAC_SECRET) {
  process.env.TEST_AUTH_HMAC_SECRET = 'local-test-auth-hmac-secret-super-secure-32chars';
}

const chromiumLaunchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ? {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    }
  : {};

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  expect: {
    timeout: 15_000,
    // Visual regression pixel-diff tolerance (<= 1% subpixel font/AA variance across environments)
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{projectName}-linux{ext}',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? 'off' : 'retain-on-failure',
    launchOptions: chromiumLaunchOptions,
  },
  projects: [
    // ─── Preserved Existing Platform Viewport Projects ───
    {
      name: 'mobile-iphone-se',
      testIgnore: /engine-(responsive|security)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 667 },
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1',
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'tablet-ipad-portrait',
      testIgnore: /engine-(responsive|security)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1',
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
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

    // ─── AI Multi-Provider Engine 5-Viewport Certification Matrix ───
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 640 } },
    },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'laptop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: '4k',
      use: { ...devices['Desktop Chrome'], viewport: { width: 3840, height: 2160 } },
    },
  ],
  webServer: [
    {
      command: 'node ../scripts/start-ai-engine-e2e.cjs',
      url: 'http://127.0.0.1:8080/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'npm run dev -- --host 0.0.0.0 --port 4000 --strictPort',
      url: 'http://127.0.0.1:4000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
