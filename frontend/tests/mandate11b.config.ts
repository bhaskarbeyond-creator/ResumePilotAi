import { defineConfig, devices } from '@playwright/test';

const chromiumArgs = process.env.PLAYWRIGHT_CHROMIUM_ARGS
  ?.split(/\s+/)
  .map((argument) => argument.trim())
  .filter(Boolean);

export default defineConfig({
  testDir: '.',
  testMatch: 'mandate11b.spec.ts',
  workers: 1,
  timeout: 45_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4011',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          args: chromiumArgs?.length ? chromiumArgs : ['--no-sandbox', '--disable-dev-shm-usage'],
        }
      : undefined,
  },
  webServer: {
    command: 'npm run dev -- --host 0.0.0.0 --port 4011',
    url: 'http://127.0.0.1:4011',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  reporter: 'line',
});
