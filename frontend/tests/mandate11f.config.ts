/**
 * Playwright configuration for the Mandate 11F verification suite.
 *
 * Scope: the five surfaces of Mandate 11F (Interview Coach + voice, ATS
 * diagnostics, AI writing, notifications + poller, recruiter messaging). It is
 * deliberately separate from playwright.config.ts so this suite never widens
 * (or weakens) the repository's existing browser matrix.
 *
 * Isolation: every network call is answered by a route fixture inside the spec,
 * so nothing here touches a real API, database or AI provider. The dev server is
 * started on its own port, and no test writes to persistent storage.
 *
 * A browser is required. If the environment cannot supply one, the run fails
 * loudly instead of silently skipping: this suite is evidence, so a skipped run
 * must not be reportable as a passing one.
 *
 * `PLAYWRIGHT_CHROMIUM_EXECUTABLE` / `PLAYWRIGHT_CHROMIUM_ARGS` select a
 * pre-installed Chromium build (the same convention as `mandate11b.config.ts`);
 * without them Playwright uses its own downloaded browser.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.MANDATE11F_PORT ?? 4012);
const BASE_URL = `http://127.0.0.1:${PORT}`;

const chromiumArgs = process.env.PLAYWRIGHT_CHROMIUM_ARGS
  ?.split(/\s+/)
  .map((argument) => argument.trim())
  .filter(Boolean);

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: '.',
  testMatch: 'mandate11f.spec.ts',
  /* One worker: the notification poller assertions count requests over real
     timers, and parallel pages would make those counts meaningless. */
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath
      ? {
          executablePath,
          args: chromiumArgs?.length ? chromiumArgs : ['--no-sandbox', '--disable-dev-shm-usage'],
        }
      : undefined,
  },
  webServer: {
    command: `npm run dev -- --host 0.0.0.0 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
