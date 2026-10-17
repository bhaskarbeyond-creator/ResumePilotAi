// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-017 live-stack Candidate Account & Security Command Center configuration.
 *
 * Mirrors playwright.dir012/013/014.config.js for the same proven reason: the
 * suite drives the ALREADY RUNNING Vite dev server on http://localhost:3000 so
 * every `/api/*` request is proxied by vite.config.js to the live backend on
 * http://localhost:8080 and its authoritative MariaDB. No webServer is declared,
 * because booting a second origin is what makes the app's own maintenance guard
 * report "Service temporarily unavailable".
 *
 * `trace` stays 'off' for the empirically verified reason documented in
 * playwright.dir006.config.js: with tracing enabled every page.goto against the
 * live dev server stalls until the test timeout.
 *
 * `workers: 1` and `fullyParallel: false` are deliberate. The settings spec mints
 * a real Firebase session and asserts on authenticated CRUD against shared
 * MariaDB rows (profile persistence, preference saves), so parallel workers would
 * interleave the exact state these stages assert.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir017-candidate-settings\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir017-results.json' }]],
    timeout: 420_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir017-artifacts',
    use: {
        baseURL: process.env.DIR017_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir017-live-candidate-settings',
        use: {
            ...devices['Desktop Chrome'],
            // AC-6 asserts password input validation by real keyboard entry, and
            // the TOTP manual-key copy affordance reads the clipboard, so the
            // suite needs a real viewport plus clipboard permissions rather than
            // a synthesised one.
            permissions: ['clipboard-read', 'clipboard-write'],
            launchOptions: {
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            },
        },
    }],
});
