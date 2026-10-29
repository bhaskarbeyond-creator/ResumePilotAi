import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'mandate9.spec.ts', workers: 1,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4000', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : undefined },
  webServer: { command: 'npm run dev -- --host 0.0.0.0 --port 4000', url: 'http://127.0.0.1:4000', reuseExistingServer: !process.env.CI, timeout: 60000 },
  reporter: 'line',
});
