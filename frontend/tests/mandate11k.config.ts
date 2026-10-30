import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'mandate11k.spec.ts', workers: 1, timeout: 30000,
  reporter: 'list', outputDir: '../test-results/mandate11k',
  use: { baseURL: 'http://127.0.0.1:4000', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] } : {} },
  webServer: { command: 'npm run dev -- --host 0.0.0.0 --port 4000', cwd: new URL('..', import.meta.url).pathname, url: 'http://127.0.0.1:4000', reuseExistingServer: true, timeout: 60000 },
});
