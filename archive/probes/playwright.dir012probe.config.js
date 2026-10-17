import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir012-probe\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list']],
    timeout: 180_000,
    outputDir: '.bridge/evidence/dir012-probe-artifacts',
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{ name: 'probe', use: { ...devices['Desktop Chrome'] } }],
});
