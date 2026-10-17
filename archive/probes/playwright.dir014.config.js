// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-014 live-stack AI Cover Letter Builder configuration.
 *
 * Mirrors playwright.dir012/013.config.js for the same proven reason: the
 * suite drives the ALREADY RUNNING Vite dev server on http://localhost:3000
 * so every `/api/*` request is proxied by vite.config.js to the live backend
 * on http://localhost:8080 and its authoritative MariaDB. No webServer is
 * declared, because booting a second origin is what makes the app's own
 * maintenance guard report "Service temporarily unavailable".
 *
 * trace stays 'off' for the empirically verified reason documented in
 * playwright.dir006.config.js: with tracing enabled every page.goto against
 * the live dev server stalls until the test timeout.
 *
 * `workers: 1` and `fullyParallel: false` are deliberate: the spec mints a
 * real Firebase session and the cover-letter builder performs authenticated
 * CRUD against shared MariaDB rows, so parallel workers would interleave the
 * state these stages assert.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir014-cover-letter\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir014-results.json' }]],
    timeout: 420_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir014-artifacts',
    use: {
        baseURL: process.env.DIR014_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir014-live-cover-letter',
        use: {
            ...devices['Desktop Chrome'],
            // INV-3 keyboard reachability is asserted by tabbing through the
            // stepper, so the suite needs a real viewport rather than a
            // synthesised one, and clipboard permissions for the 1-click
            // keyword-copy chip assertion.
            permissions: ['clipboard-read', 'clipboard-write'],
            launchOptions: {
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            },
        },
    }],
});