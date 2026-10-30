import { defineConfig, devices } from '@playwright/test';

/**
 * Mandate 11J — Playwright configuration for the portfolio builder, the public
 * portfolio, the showcase gallery and the share/custom-domain dialogs.
 *
 * One Vite dev server runs the unmodified application without Firebase settings,
 * so authentication uses the backend preview identity: the spec seeds an
 * `rptest.` session that the AuthProvider confirms through
 * `GET /api/users-data/profile`, and answers every `/api` request with a fixture.
 * Nothing reaches a real backend, and no production code has a mock path.
 *
 * One worker keeps the dev server and the fixture state deterministic.
 *
 * Sandboxes without Playwright's browser download can point at any Chromium:
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome
 *   PLAYWRIGHT_CHROMIUM_ARGS="--no-sandbox --disable-dev-shm-usage"
 *   LD_LIBRARY_PATH=/path/to/chromium/libs   (when the build needs older libs)
 */
const chromiumArgs = process.env.PLAYWRIGHT_CHROMIUM_ARGS
  ?.split(/\s+/)
  .map((argument) => argument.trim())
  .filter(Boolean);

const PORT = Number(process.env.MANDATE11J_PORT || 4017);
const baseURL = `http://127.0.0.1:${PORT}`;

const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ? {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: chromiumArgs?.length ? chromiumArgs : ['--no-sandbox', '--disable-dev-shm-usage'],
  }
  : undefined;

export default defineConfig({
  testDir: '.',
  testMatch: 'mandate11j.spec.ts',
  // Playwright resolves reporter/test output paths from this config's directory.
  outputDir: '../test-results/mandate11j',
  fullyParallel: false,
  workers: 1,
  // Failures are reported, not retried away; CI gets one retry for dev-server warm-up.
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['line'],
    ['html', { outputFolder: '../playwright-report/mandate11j', open: 'never' }],
    ['json', { outputFile: '../test-results/mandate11j/results.json' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions,
  },
  webServer: {
    // `webServer.cwd` defaults to this config's directory (frontend/tests); the
    // dev server must run from the frontend root.
    cwd: '..',
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: baseURL,
    // No Firebase settings: this is the same configuration local/QA uses, where
    // sessions come from the backend preview identity.
    env: {
      VITE_FIREBASE_KEY: '',
      VITE_FIREBASE_DOMAIN: '',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_APP_ID: '',
    },
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
