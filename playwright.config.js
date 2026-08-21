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
  testMatch: /enterprise-e2e\.spec\.js/,
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
      args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
