import { defineConfig, devices } from '@playwright/test';

/**
 * Mandate 11E — dedicated Playwright configuration.
 *
 * Mirrors the existing mandate11b setup: one worker (the suite drives shared
 * routes and must stay deterministic), a dedicated port so it never collides
 * with another mandate's server, and Chromium overridable through
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE for sandboxes that ship their own build.
 *
 * The suite talks only to the Vite dev server; every /api request is answered
 * by a test fixture through page.route(), so nothing touches a real backend or
 * production data.
 */
const chromiumArgs = process.env.PLAYWRIGHT_CHROMIUM_ARGS
  ?.split(/\s+/)
  .map((argument) => argument.trim())
  .filter(Boolean);

const PORT = Number(process.env.MANDATE11E_PORT || 4012);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: '.',
  testMatch: 'mandate11e.spec.ts',
  fullyParallel: false,
  workers: 1,
  // A failure is reported, never hidden by retries; CI gets one retry to absorb
  // dev-server warm-up, and reports it as "flaky".
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // The HTML report lands in the ignored test-results folder, never in source.
  reporter: [['line'], ['html', { outputFolder: 'test-results/mandate11e-report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
        args: chromiumArgs?.length ? chromiumArgs : ['--no-sandbox', '--disable-dev-shm-usage'],
      }
      : undefined,
  },
  webServer: {
    command: `npm run dev -- --host 0.0.0.0 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
