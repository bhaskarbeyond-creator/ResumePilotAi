import { defineConfig } from '@playwright/test';

// Isolated component/workflow checks with mocked admin APIs. Not auth/backend E2E.
export default defineConfig({
  testDir: '.',
  testMatch: 'engine-integrity.spec.ts',
  workers: 1,
  reporter: 'list',
  outputDir: '../test-results/engine-integrity',
  use: {
    baseURL: 'http://127.0.0.1:4000',
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader'],
    } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
