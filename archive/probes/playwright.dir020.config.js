// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-020 live-stack Interactive Job Application Kanban Tracker configuration.
 *
 * Mirrors playwright.dir019.config.js for the same proven reason: the suite drives
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
 * `workers: 1` and `fullyParallel: false` are load-bearing for AC-2/AC-3/AC-7.
 * The suite drives the candidate's own `job_tracker` rows through stage
 * transitions and deletes, while asserting optimistic revisions; parallel workers
 * would interleave exactly the state these stages read.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir020-job-tracker\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir020-results.json' }]],
    timeout: 420_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir020-artifacts',
    use: {
        baseURL: process.env.DIR020_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir020-live-job-tracker',
        use: {
            ...devices['Desktop Chrome'],
            // AC-2 asserts the five-column board at a real desktop width, so the
            // suite needs a genuine desktop viewport rather than a synthesised one.
            viewport: { width: 1600, height: 1000 },
            launchOptions: {
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            },
        },
    }],
});