// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-012 live-stack Platform Admin console configuration.
 *
 * Mirrors playwright.dir011.config.js for the same proven reason: the suite drives
 * the ALREADY RUNNING Vite dev server on http://localhost:3000 so that every
 * `/api/*` request is proxied by vite.config.js to the live backend on
 * http://localhost:8080 and its authoritative MariaDB. No webServer is declared,
 * because booting a second origin is what makes the app's own maintenance guard
 * report "Service temporarily unavailable".
 *
 * trace stays 'off' for the empirically verified reason documented in
 * playwright.dir006.config.js: with tracing enabled every page.goto against the
 * live dev server stalls until the test timeout. Failure evidence is captured by
 * the JSON reporter plus this spec's own console/page-error and >=400 collectors.
 *
 * `workers: 1` and `fullyParallel: false` are deliberate, not incidental: the
 * role-view simulator writes sessionStorage and the console polls shared health
 * endpoints, so parallel workers would interleave the very state stage 3 asserts.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir012-admin-console\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir012-results.json' }]],
    timeout: 180_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir012-artifacts',
    use: {
        baseURL: process.env.DIR012_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir012-live-admin-console',
        use: { ...devices['Desktop Chrome'] },
    }],
});
