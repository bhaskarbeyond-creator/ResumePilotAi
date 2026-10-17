// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-021 live-stack AI Career Copilot & Universal Command Surface configuration.
 *
 * Mirrors playwright.dir020.config.js for the same proven reason: the suite drives
 * the ALREADY RUNNING Vite dev server on http://localhost:3000 so every `/api/*`
 * request is proxied by vite.config.js to the live backend on http://localhost:8080
 * and its authoritative MariaDB. No `webServer` is declared, because booting a
 * second origin is what makes the app's own maintenance guard report "Service
 * temporarily unavailable".
 *
 * `trace` stays 'off' for the reason documented in playwright.dir006.config.js:
 * with tracing enabled every page.goto against the live dev server stalls until
 * the test timeout.
 *
 * `workers: 1` and `fullyParallel: false` are load-bearing. AC-3 dispatches REAL
 * AI requests against the shared, long-lived identity, and those requests consume
 * that account's MariaDB daily quota. Parallel workers would race on the quota
 * counter and make the run non-deterministic, which is exactly the failure mode
 * INV-3 exists to prevent. One worker also keeps the palette's open/close state
 * machine observed one test at a time.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir021-command-copilot\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir021-results.json' }]],
    timeout: 420_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir021-artifacts',
    use: {
        baseURL: process.env.DIR021_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir021-live-command-copilot',
        use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1600, height: 1000 },
            launchOptions: {
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            },
        },
    }],
});