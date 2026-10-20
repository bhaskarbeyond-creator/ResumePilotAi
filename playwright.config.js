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
  testMatch: /.*\.(spec|test)\.(js|mjs|cjs)/,
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
  webServer: process.env.PW_NO_WEBSERVER ? undefined : [
    {
      command: 'npm run dev',
      port: 5173,
      timeout: 240 * 1000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm --prefix backend run dev',
      port: 8080,
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});