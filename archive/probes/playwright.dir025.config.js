// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-025: Universal Link Crawler & Route Completeness Playwright E2E Config
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir025-link-crawler\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir025-results.json' }]],
    timeout: 180_000,
    expect: { timeout: 25_000 },
    outputDir: '.bridge/evidence/dir025-artifacts',
    use: {
        baseURL: process.env.DIR025_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir025-live-desktop',
        use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1440, height: 900 },
        },
    }],
});
