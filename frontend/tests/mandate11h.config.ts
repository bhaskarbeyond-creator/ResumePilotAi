import { defineConfig, devices } from '@playwright/test';

/**
 * Mandate 11H — dedicated Playwright configuration.
 *
 * Two Vite dev servers run the same, unmodified application:
 *
 *  - "firebase" (port 4015) starts with placeholder VITE_FIREBASE_* values, so
 *    the real Firebase JS SDK is initialised. The spec answers the SDK's
 *    Identity Toolkit / Secure Token requests with page.route() fixtures, which
 *    lets the login, password-reset, MFA challenge, password change and
 *    two-factor removal flows run through the real SDK code paths. The
 *    placeholder key is not a credential: every googleapis.com request is
 *    intercepted, and an unexpected one fails the test.
 *  - "preview" (port 4016) has no Firebase configuration, which is how local
 *    and QA environments run: sessions come from the backend preview identity
 *    (seeded or answered by fixtures).
 *
 * Every /api request is answered by a fixture; nothing reaches a real backend.
 * One worker keeps the shared dev servers deterministic. Chromium can be
 * overridden with PLAYWRIGHT_CHROMIUM_EXECUTABLE (and PLAYWRIGHT_CHROMIUM_ARGS)
 * for sandboxes that ship their own browser build.
 */
const chromiumArgs = process.env.PLAYWRIGHT_CHROMIUM_ARGS
  ?.split(/\s+/)
  .map((argument) => argument.trim())
  .filter(Boolean);

const FIREBASE_PORT = Number(process.env.MANDATE11H_FIREBASE_PORT || 4015);
const PREVIEW_PORT = Number(process.env.MANDATE11H_PREVIEW_PORT || 4016);
const firebaseUrl = `http://127.0.0.1:${FIREBASE_PORT}`;
const previewUrl = `http://127.0.0.1:${PREVIEW_PORT}`;

/** Placeholder project values; the spec intercepts every request they lead to. */
export const FAKE_FIREBASE_ENV = {
  VITE_FIREBASE_KEY: 'mandate11h-placeholder-key',
  VITE_FIREBASE_DOMAIN: 'mandate11h-test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'mandate11h-test',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:mandate11h',
};

const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  ? {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: chromiumArgs?.length ? chromiumArgs : ['--no-sandbox', '--disable-dev-shm-usage'],
  }
  : undefined;

const devServer = (port: number) => `npm run dev -- --host 0.0.0.0 --port ${port} --strictPort`;

export default defineConfig({
  testDir: '.',
  testMatch: 'mandate11h.spec.ts',
  fullyParallel: false,
  workers: 1,
  // Failures are reported, not hidden by retries; CI gets one retry for
  // dev-server warm-up and reports it as "flaky".
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['line'], ['html', { outputFolder: 'test-results/mandate11h-report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions,
  },
  projects: [
    { name: 'firebase', grep: /@firebase/, use: { baseURL: firebaseUrl } },
    { name: 'preview', grepInvert: /@firebase/, use: { baseURL: previewUrl } },
  ],
  webServer: [
    {
      command: devServer(FIREBASE_PORT),
      url: firebaseUrl,
      env: FAKE_FIREBASE_ENV,
      // Never reuse: a server started without these values would silently run
      // the preview-identity path instead of the Firebase one.
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: devServer(PREVIEW_PORT),
      url: previewUrl,
      // Clear any VITE_FIREBASE_* inherited from the shell so this server runs
      // without Firebase.
      env: { VITE_FIREBASE_KEY: '', VITE_FIREBASE_DOMAIN: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_APP_ID: '' },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
