// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * DIR-040 — security header crawl / penetration probe.
 *
 * The spec boots its own real backend security middleware on an ephemeral port
 * (see tests/e2e/dir-040.spec.js), so no webServer, dev server, MariaDB or
 * Firebase project is required and the run is deterministic. Results are
 * written to .bridge/evidence/dir040-results.json for the Gatekeeper.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir-040\.spec\.js/,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.bridge/evidence/dir040-results.json' }]],
    timeout: 120_000,
    expect: { timeout: 20_000 },
    outputDir: '.bridge/evidence/dir040-artifacts',
    use: {
        trace: 'off',
        video: 'off',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
            // NOTE: --disable-web-security is deliberately NOT set here. That
            // flag would suppress the very CSP enforcement this suite exists to
            // prove, so the probe runs under normal browser security rules.
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [{
        name: 'dir040-zero-trust',
        use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    }],
});
