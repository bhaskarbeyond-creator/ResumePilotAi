/** Isolated Mandate 11I browser gate. All API responses are fixtures in the spec. */
import { defineConfig, devices } from '@playwright/test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const PORT = Number(process.env.MANDATE11I_PORT ?? 4018);
const BASE_URL = process.env.MANDATE11I_BASE_URL ?? `http://127.0.0.1:${PORT}`;
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
let browserArgs = process.env.PLAYWRIGHT_CHROMIUM_ARGS?.split(/\s+/).filter(Boolean) ?? ['--no-sandbox', '--disable-dev-shm-usage'];
// The repository already depends on the serverless Chromium distribution. Use
// it when Playwright's CDN is unavailable; no production dependency is added.
if (!executablePath && process.platform === 'linux') {
  try {
    const require = createRequire(import.meta.url);
    const entry = require.resolve('@sparticuz/chromium');
    const module = await import(pathToFileURL(entry).href);
    const chromium = module.default;
    executablePath = await chromium.executablePath();
    const packageDirectory = path.dirname(path.dirname(entry));
    await chromium.inflate?.(path.join(packageDirectory, 'bin', 'al2023.tar.br'));
    const { inflate } = module;
    if (inflate) await inflate(path.join(packageDirectory, 'bin', 'al2023.tar.br'));
    process.env.LD_LIBRARY_PATH = `/tmp/al2023/lib:/tmp:${process.env.LD_LIBRARY_PATH ?? ''}`;
    // Keep Chromium's normal process isolation: --single-process crashes when
    // Playwright closes one context while another is being created.
  } catch { /* Standard Playwright browser installation remains the default. */ }
}
export default defineConfig({
  testDir: '.', testMatch: 'mandate11i.spec.ts', workers: 1, fullyParallel: false,
  timeout: 60_000, expect: { timeout: 10_000 }, retries: 0, forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['json', { outputFile: 'test-results/mandate11i/results.json' }]],
  outputDir: 'test-results/mandate11i/artifacts',
  use: {
    ...devices['Desktop Chrome'], baseURL: BASE_URL, timezoneId: 'Asia/Kolkata', locale: 'en-IN',
    actionTimeout: 10_000, navigationTimeout: 30_000, trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath, args: browserArgs } : undefined,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } }, grep: /@responsive/ },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }, grep: /@responsive/ },
  ],
  webServer: {
    command: `npm run dev -- --host 0.0.0.0 --port ${PORT} --strictPort`,
    url: BASE_URL, reuseExistingServer: !process.env.CI, timeout: 120_000,
  },
});
