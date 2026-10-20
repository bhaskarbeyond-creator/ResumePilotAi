/**
 * Candidate Dashboard end-to-end suite (directive P002 §7): five viewport
 * profiles against the REAL backend (frontend dev server -> /api proxy ->
 * Express -> MariaDB). No API mocking, no auth bypass.
 *
 *   # servers: MariaDB (native or scripts/dev-db bridge), backend on :8080 with a
 *   # non-production identity verifier, frontend `npm run dev` on :4000
 *   npx playwright test -c playwright.candidate.config.ts
 *
 * Environment:
 *   E2E_BASE_URL                    default http://127.0.0.1:4000
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE  optional browser binary (sandboxes without the
 *                                   Playwright CDN); unset = Playwright's own Chromium
 */
import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const launchOptions = executablePath ? { executablePath, args: ['--no-sandbox'] } : {};

const AUTH_DIR = 'test-results/.auth';

export const PROFILES = [
  { name: 'desktop-1920', viewport: { width: 1920, height: 1080 }, mobile: false },
  { name: 'laptop-1366', viewport: { width: 1366, height: 768 }, mobile: false },
  { name: 'tablet-1024', viewport: { width: 1024, height: 768 }, mobile: false },
  { name: 'mobile-390', viewport: { width: 390, height: 844 }, mobile: true },
  { name: 'mobile-320', viewport: { width: 320, height: 568 }, mobile: true },
] as const;

export default defineConfig({
  testDir: './tests/candidate',
  outputDir: 'test-results/candidate',
  fullyParallel: false,
  // The suite shares one database; a single worker keeps runs deterministic.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/candidate/results.json' }],
    ['html', { outputFolder: 'playwright-report/candidate', open: 'never' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, launchOptions },
    },
    ...PROFILES.map((profile) => ({
      name: profile.name,
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: profile.viewport,
        isMobile: profile.mobile,
        hasTouch: profile.mobile,
        storageState: `${AUTH_DIR}/candidate-a.json`,
        launchOptions,
      },
    })),
  ],
});
