import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Resolve the same Playwright installation used by the root-level CLI.
const rootRequire = createRequire(resolve(here, '../../package.json'));
const { defineConfig, devices } = rootRequire('@playwright/test') as typeof import('@playwright/test');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const args = process.env.PLAYWRIGHT_CHROMIUM_ARGS?.split(/\s+/).filter(Boolean) || ['--no-sandbox', '--disable-dev-shm-usage'];

export default defineConfig({
  testDir: here,
  testMatch: 'mandate11g.spec.ts',
  outputDir: resolve(tmpdir(), 'mandate11g-playwright-results'),
  reporter: 'list',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 12_000 },
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1366, height: 900 },
    baseURL: 'http://127.0.0.1:4017',
    launchOptions: executablePath ? { executablePath, args } : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 0.0.0.0 --port 4017 --strictPort',
    cwd: resolve(here, '..'),
    url: 'http://127.0.0.1:4017',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
