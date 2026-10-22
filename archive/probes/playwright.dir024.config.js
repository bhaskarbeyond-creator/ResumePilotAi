// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-024 live-stack crawler/SEO verification.
 *
 * This suite intentionally does not declare a webServer or install request
 * interception. It drives the existing Vite dev server, whose same-origin
 * proxies route API, LLM documents, and sitemap requests to the backend and its
 * configured MariaDB repository. A disconnected or in-memory fallback stack is
 * not valid evidence for this directive.
 */
export default defineConfig({
    testDir: '../../tests/e2e',
    testMatch: /dir024-geo-seo\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir024-results.json' }]],
    timeout: 180_000,
    expect: { timeout: 25_000 },
    outputDir: '.bridge/evidence/dir024-artifacts',
    use: {
        baseURL: process.env.DIR024_WEB_ORIGIN || 'http://localhost:3000',
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir024-live-mariadb-desktop',
        use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1440, height: 900 },
        },
    }],
});
