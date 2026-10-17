// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-046 -- hermetic browser certification config for the DIR-001 suite.
 *
 * `webServer` is DELIBERATELY ABSENT. tests/e2e/dir-001.spec.js boots its own
 * Vite dev server through `createServer({ server: { port: 0 } })`, so the OS
 * assigns a free port at run time. Declaring a `webServer` here would start a
 * SECOND origin, and booting a second origin is exactly what makes this app's own
 * maintenance guard answer "Service temporarily unavailable" -- the failure mode
 * documented in playwright.dir021.config.js.
 *
 * Being hermetic is also an invariant, not a convenience: the suite proves the
 * Cuba shell contract against deterministic fixtures, so it must not depend on a
 * developer's live MariaDB or a backend that happens to be running.
 *
 * `workers: 1` is load-bearing. Each spec file owns a Vite server and every test
 * reseeds fixture state through the same page, so parallel workers would race on
 * the interception order and produce a non-deterministic result.
 *
 * `trace` stays 'off' for the reason recorded in playwright.dir006.config.js:
 * with tracing enabled, page.goto against a Vite dev server stalls until timeout.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir-001\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir046-results.json' }]],
    // Generous per-test budget: each AC walks four portals and each AC-5 pass
    // walks four portals at five widths, all against a cold Vite transform.
    timeout: 300_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir046-artifacts',
    use: {
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir046-dir001-certification',
        use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1440, height: 900 },
            launchOptions: {
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            },
        },
    }],
});