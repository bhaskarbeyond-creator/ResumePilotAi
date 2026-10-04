// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-013 live-stack AI Interview Coach configuration.
 *
 * Mirrors playwright.dir012.config.js for the same proven reason: the suite
 * drives the ALREADY RUNNING Vite dev server on http://localhost:3000 so every
 * `/api/*` request is proxied by vite.config.js to the live backend on
 * http://localhost:8080 and its authoritative MariaDB. No webServer is
 * declared, because booting a second origin is what makes the app's own
 * maintenance guard report "Service temporarily unavailable".
 *
 * trace stays 'off' for the empirically verified reason documented in
 * playwright.dir006.config.js: with tracing enabled every page.goto against the
 * live dev server stalls until the test timeout.
 *
 * `workers: 1` and `fullyParallel: false` are deliberate: the spec mints a real
 * Firebase session and reads shared health endpoints, so parallel workers would
 * interleave the state these stages assert.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir013-interview-coach\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir013-results.json' }]],
    timeout: 420_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir013-artifacts',
    use: {
        baseURL: process.env.DIR013_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir013-live-interview-coach',
        use: {
            ...devices['Desktop Chrome'],
            // INV-2: a real media stream is requested, but the spec never grants
            // camera hardware. --use-fake-device-for-media-stream supplies a
            // synthetic stream so the analyser path is genuinely exercised
            // instead of being skipped by a permission denial.
            permissions: ['microphone', 'camera'],
            launchOptions: {
                args: [
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--use-fake-ui-for-media-stream',
                    '--use-fake-device-for-media-stream',
                ],
            },
        },
    }],
});