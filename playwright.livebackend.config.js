// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Authenticated suite against the REAL backend (no API mocks): boots
 * backend/index.js with the in-memory Firestore data plane and proxies the
 * Vite dev server to it. See tests/enterprise-live-backend.spec.js.
 *
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH / PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH
 * support sandboxes without the Playwright browser CDN.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /enterprise-live-backend\.spec\.js/,
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
