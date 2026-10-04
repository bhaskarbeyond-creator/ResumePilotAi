// @ts-check
import { defineConfig, devices } from '@playwright/test';

/** DIR-017 diagnostic probe #2: identical live-stack wiring, diagnostic spec only. */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir017diag\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list']],
    timeout: 420_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir017diag-artifacts',
    use: {
        baseURL: process.env.DIR017_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir017-diag',
        use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--no-sandbox', '--disable-dev-shm-usage'] } },
    }],
});