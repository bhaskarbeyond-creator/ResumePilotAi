// @ts-check
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.LIVE_CERT_BASE_URL;
export default defineConfig({
  testDir: './tests',
  testMatch: /admin-superadmin-live-certification\.spec\.js/,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  forbidOnly: true,
  reporter: 'list',
  timeout: 120_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--no-zygote', '--disable-dev-shm-usage'],
      ...(process.env.PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH
        ? { env: { ...process.env, LD_LIBRARY_PATH: process.env.PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH } }
        : {}),
    },
  },
  projects: [{ name: 'chromium-admin-live', use: { ...devices['Desktop Chrome'] } }],
});
