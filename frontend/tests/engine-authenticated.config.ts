import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: ['engine-authenticated.spec.ts', 'engine-import.spec.ts', 'engine-legacy-comparison.spec.ts'], workers: 1, timeout: 90000,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  outputDir: '../test-results/engine-authenticated',
  use: { baseURL: 'http://127.0.0.1:4000', trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {} },
  webServer: [
    { command: 'node scripts/start-ai-engine-e2e.cjs', cwd: new URL('../..', import.meta.url).pathname, url: 'http://127.0.0.1:8080/api/health', timeout: 60000, reuseExistingServer: !process.env.CI },
    { command: 'npm run dev -- --host 0.0.0.0 --port 4000 --strictPort', cwd: new URL('..', import.meta.url).pathname, url: 'http://127.0.0.1:4000', timeout: 60000, reuseExistingServer: !process.env.CI },
    ...(process.env.LEGACY_FRONTEND_DIR ? [{ command: 'npm run dev -- --host 0.0.0.0 --port 4001 --strictPort', cwd: process.env.LEGACY_FRONTEND_DIR, url: 'http://127.0.0.1:4001', timeout: 60000, reuseExistingServer: false }] : []),
  ],
});
