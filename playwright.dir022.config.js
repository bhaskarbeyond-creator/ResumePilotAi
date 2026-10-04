// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-022 live-stack Payment Webhook Reconciler configuration.
 *
 * Mirrors playwright.dir021.config.js for the same proven reason: the suite
 * drives the ALREADY RUNNING Vite dev server on http://localhost:3000 so every
 * `/api/*` request is proxied by vite.config.js to the live backend on
 * http://localhost:8080 and its authoritative MariaDB. No `webServer` is
 * declared, because booting a second origin is what makes the app's own
 * maintenance guard report "Service temporarily unavailable".
 *
 * `trace` stays 'off' for the reason documented in playwright.dir006.config.js:
 * with tracing enabled every page.goto against the live dev server stalls until
 * the test timeout.
 *
 * `workers: 1` and `fullyParallel: false` are load-bearing. This suite mutates
 * a real candidate's payment state in MariaDB to observe the grace banner, and
 * parallel workers would race on that same row — producing a pass in one worker
 * and a failure in another for reasons that have nothing to do with the code.
 * DIR-022 is precisely about a single authoritative entitlement record, so the
 * test must observe it the same way the product does: one at a time.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir022-payment-reconciliation\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir022-results.json' }]],
    timeout: 420_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir022-artifacts',
    use: {
        baseURL: process.env.DIR022_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir022-live-payment-reconciliation',
        use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1600, height: 1000 },
            launchOptions: {
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            },
        },
    }],
});