// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * LIVE production configuration: runs tests/enterprise-live.spec.js against
 * https://airesume.projectdemo.guru (override with PROD_BASE_URL). Requires
 * real test credentials — see the spec header. No dev server, no mocks.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /enterprise-live\.spec\.js/,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: 'list',
  timeout: 120_000,
  use: {
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      ...(process.env.PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH
        ? { env: { ...process.env, LD_LIBRARY_PATH: process.env.PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH } }
        : {}),
    },
  },
  projects: [{ name: 'chromium-live', use: { ...devices['Desktop Chrome'] } }],
});
