// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-026: Real-Time In-App Candidate & Recruiter Messaging 10/10 Overhaul
 * Playwright E2E config.
 *
 * Mirrors playwright.dir025.config.js so this directive's suite runs with the
 * same isolation guarantees: one worker, no retries (a flaky messaging test is a
 * real defect, not noise to be re-rolled), and JSON evidence written straight
 * into the bridge evidence pack for Gatekeeper review.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir026-messaging\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir026-results.json' }]],
    timeout: 180_000,
    expect: { timeout: 25_000 },
    outputDir: '.bridge/evidence/dir026-artifacts',
    use: {
        baseURL: process.env.DIR026_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir026-live-desktop',
        use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1440, height: 900 },
        },
    }],
});