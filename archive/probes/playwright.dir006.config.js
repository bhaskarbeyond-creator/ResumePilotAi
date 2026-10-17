// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-006 live-stack funnel configuration.
 *
 * Unlike playwright.config.js (which boots an in-process Vite server and serves
 * a fixture contract), this config drives the ALREADY RUNNING Vite dev server on
 * http://localhost:3000 so every /api/* request is proxied by vite.config.js to
 * the live backend on http://localhost:8080 and its authoritative MariaDB.
 *
 * No webServer is declared on purpose: starting a second server is exactly what
 * Directive DIR-006 prohibits, because an unproxied origin makes the app's own
 * maintenance guard report "Service temporarily unavailable".
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir006-funnel\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir006-funnel-results.json' }]],
    timeout: 180_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir006-artifacts',
    use: {
        baseURL: process.env.DIR006_WEB_ORIGIN || 'http://localhost:3000',
        // Tracing must stay OFF for this suite. Verified empirically on this
        // machine: with trace 'retain-on-failure' every page.goto against the
        // live Vite dev server stalls until the 180s test timeout, because the
        // tracer serialises the HMR module graph (hundreds of .vite/deps and
        // /src requests per navigation). With trace 'off' the identical Stage 0
        // navigation completes in ~1.5s. Evidence: .bridge/dir006-trace-bisect.log.
        // Failure evidence is still captured by the JSON reporter and by the
        // defect collectors in the spec itself (console/page errors, >=400 APIs).
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
    },
    projects: [{
        name: 'dir006-live-funnel',
        use: {
            ...devices['Desktop Chrome'],
            // The live interview coach requests microphone access; granting it
            // keeps the CBT session initialisation on the app's own code path.
            permissions: ['microphone'],
        },
    }],
});