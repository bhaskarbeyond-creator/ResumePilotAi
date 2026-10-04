// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-008 live-stack organization console configuration.
 *
 * Mirrors playwright.dir006.config.js for the same proven reason: the suite
 * drives the ALREADY RUNNING Vite dev server on http://localhost:3000 so that
 * every `/api/*` request is proxied by vite.config.js to the live backend on
 * http://localhost:8080 and its authoritative MariaDB. No webServer is declared
 * because booting a second origin is exactly what makes the app's own
 * maintenance guard report "Service temporarily unavailable" — the browser must
 * only ever see the real proxied stack.
 *
 * trace stays 'off' with the empirically verified reason documented in
 * playwright.dir006.config.js: with tracing enabled every page.goto against the
 * live dev server stalls until the test timeout, because the tracer serialises
 * the HMR module graph. Failure evidence is still captured by the JSON reporter
 * and by this spec's own console/page-error and >=400 API collectors.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir008-organization-console\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir008-console-results.json' }]],
    timeout: 180_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir008-artifacts',
    use: {
        baseURL: process.env.DIR008_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir008-live-organization-console',
        use: { ...devices['Desktop Chrome'] },
    }],
});
