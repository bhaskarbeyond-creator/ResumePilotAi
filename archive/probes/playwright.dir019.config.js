// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-019 live-stack Digital Portfolio & Web CV Studio configuration.
 *
 * Mirrors playwright.dir012/013/014/017.config.js for the same proven reason:
 * the suite drives the ALREADY RUNNING Vite dev server on http://localhost:3000
 * so every `/api/*` request is proxied by vite.config.js to the live backend on
 * http://localhost:8080 and its authoritative MariaDB. No `webServer` is
 * declared, because booting a second origin is what makes the app's own
 * maintenance guard report "Service temporarily unavailable".
 *
 * `trace` stays 'off' for the empirically verified reason documented in
 * playwright.dir006.config.js: with tracing enabled every page.goto against the
 * live dev server stalls until the test timeout.
 *
 * `workers: 1` and `fullyParallel: false` are deliberate and load-bearing for
 * AC-3/AC-6. The suite mints a real Firebase session and drives the studio's
 * save + publish paths against shared MariaDB rows while asserting optimistic
 * revisions; parallel workers would interleave exactly the state these stages
 * read. AC-6 also asserts the vanity badge, whose truthfulness depends on a
 * serialized read of the `portfolios` table.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir019-portfolio-builder\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir019-results.json' }]],
    timeout: 420_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir019-artifacts',
    use: {
        baseURL: process.env.DIR019_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir019-live-portfolio-studio',
        use: {
            ...devices['Desktop Chrome'],
            // AC-2 asserts the responsive preview at true 1440/768/375 render
            // widths, so the suite needs a real desktop viewport rather than a
            // synthesised one.
            viewport: { width: 1600, height: 1000 },
            launchOptions: {
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            },
        },
    }],
});