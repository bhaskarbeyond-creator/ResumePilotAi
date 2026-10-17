// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-056 SUB-056-4 -- hermetic browser certification config for the
 * Saved Favorites & Bookmarks workspace.
 *
 * SHAPE IS MIRRORED FROM playwright.dir048.config.js ON PURPOSE, and two of
 * its choices are load-bearing rather than stylistic:
 *
 *   `webServer` is DELIBERATELY ABSENT. tests/e2e/dir0056-favorites-workspace.spec.js
 *   boots its own Vite through `createServer({ server: { port: 0 } })`, so the
 *   OS assigns a free port at run time. A declared `webServer` would start a
 *   SECOND origin, which is exactly the failure mode documented in
 *   playwright.dir021.config.js.
 *
 *   `workers: 1` is load-bearing: the fixture backend is stateful across the
 *   tests in a file, so parallel workers would race on interception order.
 *
 * `testMatch` selects only this directive's spec, so running this config can
 * never execute -- and thereby invalidate -- another directive's suite.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir0056-favorites-workspace\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir056-favorites-results.json' }]],
    timeout: 600_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir056-artifacts',
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
        name: 'dir056-favorites-workspace',
        use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1440, height: 900 },
            launchOptions: {
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            },
        },
    }],
});
