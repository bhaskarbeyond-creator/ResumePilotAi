// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-018 live-stack Billing / Pricing / Checkout configuration.
 *
 * Mirrors playwright.dir012/013/014/017.config.js for the same proven reason: the
 * suite drives the ALREADY RUNNING Vite dev server on http://localhost:3000 so
 * every `/api/*` request is proxied by vite.config.js to the live backend on
 * http://localhost:8080 and its authoritative MariaDB. No webServer is declared,
 * because booting a second origin is what makes the app's own maintenance guard
 * report "Service temporarily unavailable".
 *
 * AC-7 requires the suite to read REAL plan/pricing state, so route mocking is
 * forbidden here by the same convention DIR-012/013/014/017 follow: if the billing
 * config cannot be reached, the suite must fail loudly rather than assert against
 * a fabricated payload.
 *
 * `trace` stays 'off' for the empirically verified reason documented in
 * playwright.dir006.config.js: with tracing enabled every page.goto against the
 * live dev server stalls until the test timeout.
 *
 * `workers: 1` and `fullyParallel: false` are deliberate. The billing surfaces read
 * and (on the checkout stage) drive live subscription rows in shared MariaDB, so
 * parallel workers would interleave the exact state these stages assert.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir018-billing-checkout\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir018-results.json' }]],
    timeout: 420_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir018-artifacts',
    use: {
        baseURL: process.env.DIR018_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir018-live-billing-checkout',
        use: {
            ...devices['Desktop Chrome'],
            // AC-7 asserts WCAG AA contrast, which needs a real viewport and real
            // layout rather than a synthesised one.
            launchOptions: {
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            },
        },
    }],
});