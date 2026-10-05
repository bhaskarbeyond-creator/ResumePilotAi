// @ts-check
// DIR-047 temporary probe config (deleted after the import probe).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: /dir047probe-import\.spec\.js/,
    workers: 1,
    retries: 0,
    reporter: [['list']],
    timeout: 60_000,
    outputDir: '.bridge/evidence/dir047probe-artifacts',
    use: { trace: 'off', video: 'off' },
    projects: [{ name: 'dir047-probe', use: { ...devices['Desktop Chrome'] } }],
});