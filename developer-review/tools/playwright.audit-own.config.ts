/**
 * AUDIT-ONLY Playwright config for the audit-authored verification spec
 * (developer-review/tools/audit-browser-verification.spec.ts).
 * Same environment wiring rationale as playwright.audit.config.ts.
 */
import { defineConfig } from '@playwright/test';

const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: '.',
  testMatch: 'audit-browser-verification.spec.ts',
  outputDir: '../Evidence/artifacts/playwright-audit-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4000',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: chromiumExecutable
      ? { executablePath: chromiumExecutable, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] }
      : { args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] },
  },
  projects: [{ name: 'audit-chromium' }],
});
