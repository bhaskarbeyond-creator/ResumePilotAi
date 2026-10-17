// @ts-check
import { defineConfig, devices } from '@playwright/test';

/** DIR-017 read-only ground-truth probe: identical live-stack wiring, probe spec only. */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir017readonly\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list']],
    timeout: 300_000,
    expect: { timeout: 30_000 },
    outputDir: '.bridge/evidence/dir017probe-artifacts',
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
        name: 'dir017-live-probe',
        use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--no-sandbox', '--disable-dev-shm-usage'] } },
    }],
});