// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-017 offender probe configuration.
 *
 * Same live-stack wiring as playwright.dir017.config.js (no webServer; the suite
 * drives the ALREADY RUNNING Vite dev server on :3000 so /api/* is proxied to the
 * live backend on :8080 and its authoritative MariaDB). `trace` stays 'off' for
 * the reason documented in playwright.dir006.config.js: tracing stalls every
 * page.goto against the live dev server until the test times out.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir017offender\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list']],
    timeout: 180_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir017offender-artifacts',
    use: {
        baseURL: process.env.DIR017_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'off',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir017-offender-probe',
        use: { ...devices['Desktop Chrome'] },
    }],
});