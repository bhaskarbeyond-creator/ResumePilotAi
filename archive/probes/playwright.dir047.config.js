// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-047 -- hermetic browser certification config for the Universal SWOT UAT suite.
 *
 * SHAPE IS MIRRORED FROM playwright.dir046.config.js ON PURPOSE. That file is the
 * only config in this repository that has actually driven a Vite-booting spec to a
 * green run, and two of its choices are load-bearing rather than stylistic:
 *
 *   `webServer` is DELIBERATELY ABSENT. tests/e2e/universal-swot-uat.spec.js boots
 *   its own Vite through `createServer({ server: { port: 0 } })`, so the OS assigns a
 *   free port at run time. Declaring a `webServer` here would start a SECOND origin,
 *   and a second origin is exactly what makes this application's own maintenance guard
 *   answer "Service temporarily unavailable" -- the failure mode documented in
 *   playwright.dir021.config.js.
 *
 *   `workers: 1` is load-bearing. Every test in this suite reuses one Vite server and
 *   reseeds fixture state through the same page, so parallel workers would race on
 *   interception order and produce a non-deterministic result.
 *
 * TWO THINGS DIFFER FROM DIR-046, AND BOTH ARE BUDGET DECISIONS, NOT PREFERENCES:
 *
 * 1. `timeout` is 900_000. DIR-046 walks four portals and needed 300s. This suite's
 *    AC-3 crawls EVERY route in the reconciled census at five canonical breakpoints,
 *    and AC-4 runs axe-core over the portals in both themes. Those are the two most
 *    expensive assertions in the directive and they sit in single tests, so the
 *    per-test budget is raised rather than the crawl being cut short. A generous
 *    ceiling is not a licence to be slow: the suite's own runtime is reported as
 *    evidence precisely so a slow PASS is distinguishable from a fast one.
 *
 * 2. `testMatch` selects only this directive's spec, so running this config can never
 *    accidentally execute -- and thereby invalidate -- another directive's suite.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /universal-swot-uat\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir047-results.json' }]],
    timeout: 900_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir047-artifacts',
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
        name: 'dir047-universal-swot-uat',
        use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1440, height: 900 },
            launchOptions: {
                args: ['--no-sandbox', '--disable-dev-shm-usage'],
            },
        },
    }],
});