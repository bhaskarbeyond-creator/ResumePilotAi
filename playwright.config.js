// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * The enterprise E2E suite boots its own Vite dev server and serves the
 * /api/enterprise/** contract from the shared stateful fixture, so no
 * external server, database, or Firebase project is required.
 *
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH lets sandboxes without access to the
 * Playwright browser CDN point at any compatible Chromium binary.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.(js|cjs)/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 90_000,
  use: {
    trace: 'on-first-retry',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--disable-software-rasterizer', '--disable-extensions', '--disable-setuid-sandbox', '--headless=new', '--font-render-hinting=none', '--disable-features=VizDisplayCompositor,IsolateOrigins,site-per-process', '--disable-web-security'],
      ...(process.env.PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH
        ? { env: {
            ...process.env,
            LD_LIBRARY_PATH: process.env.PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH,
            FONTCONFIG_PATH: process.env.FONTCONFIG_PATH || '/tmp/chromium-libs',
          } }
        : {}),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
