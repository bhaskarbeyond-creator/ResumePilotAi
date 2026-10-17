// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Authenticated suite against the real Express backend with explicit MariaDB contract doubles: boots
 * backend/index.js with the in-memory MariaDB contract doubles and proxies the
 * Vite dev server to it. See tests/enterprise-contract-backend.spec.js.
 *
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH / PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH
 * support sandboxes without the Playwright browser CDN.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /enterprise-contract-backend\.spec\.js/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 180_000,
  use: {
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'],
      ...(process.env.PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH
        ? { env: { ...process.env, LD_LIBRARY_PATH: process.env.PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH } }
        : {}),
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
