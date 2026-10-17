// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-055 -- hermetic browser certification for the unified builder header and
 * the real notifications pipeline.
 *
 * SHAPE IS MIRRORED FROM playwright.dir048.config.js ON PURPOSE, and two of its
 * choices are load-bearing rather than stylistic:
 *
 *   `webServer` is DELIBERATELY ABSENT. tests/e2e/dir0055-builder-notifications
 *   .spec.js boots its own Vite through `createServer({ server: { port: 0 } })`,
 *   so the OS assigns a free port at run time. A declared `webServer` would start
 *   a SECOND origin, which is exactly the failure mode documented in
 *   playwright.dir021.config.js.
 *
 *   `workers: 1` is load-bearing: every test reuses one Vite server and reseeds
 *   fixture state through the same page, so parallel workers would race on
 *   interception order.
 *
 * `testMatch` selects only this directive's spec, so running this config can
 * never execute -- and thereby invalidate -- another directive's suite.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir0055-builder-notifications\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir055-results.json' }]],
    timeout: 600_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir055-artifacts',
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
        name: 'dir055-builder-notifications',
        use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1280, height: 900 },
            launchOptions: {
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            },
        },
    }],
});
