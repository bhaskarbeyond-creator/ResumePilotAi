#!/usr/bin/env node
/**
 * Capture before/after evidence for a candidate-dashboard surface at the five
 * directive profiles, signed in as the E2E test account (storage state written
 * by frontend/tests/candidate/auth.setup.ts). Records console errors, failed
 * requests and failed /api responses next to each screenshot. Nothing is mocked.
 * Only the Google Fonts hosts are ignored: they are unreachable from the sandbox
 * (net::ERR_CONNECTION_CLOSED) and are never an application defect.
 *
 *   node scripts/audit/capture-candidate-screens.mjs --surface cover-letters \
 *     --phase before --routes /dashboard/cover-letters,/cover-letter/new
 *
 * Env: E2E_BASE_URL (default http://127.0.0.1:4000),
 *      PLAYWRIGHT_CHROMIUM_EXECUTABLE (optional browser binary).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontendRequire = createRequire(path.join(repoRoot, 'frontend', 'package.json'));
const { chromium } = frontendRequire('@playwright/test');

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
};
const surface = arg('surface');
const phase = arg('phase');
const routes = String(arg('routes', '')).split(',').filter(Boolean);
if (!surface || !['before', 'after'].includes(phase) || !routes.length) {
  console.error('usage: --surface <name> --phase before|after --routes /a,/b');
  process.exit(2);
}

const PROFILES = [
  { name: 'desktop-1920', width: 1920, height: 1080, mobile: false },
  { name: 'laptop-1366', width: 1366, height: 768, mobile: false },
  { name: 'tablet-1024', width: 1024, height: 768, mobile: false },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
  { name: 'mobile-320', width: 320, height: 568, mobile: true },
];
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4000';
const UNREACHABLE_THIRD_PARTY = /^https?:\/\/fonts\.(googleapis|gstatic)\.com\//;
const describeUrl = (raw) => {
  const url = new URL(raw);
  return url.origin === new URL(baseURL).origin ? url.pathname : url.href;
};
const storageState = path.join(repoRoot, 'frontend', 'test-results', '.auth', 'candidate-a.json');
const outDir = path.join(repoRoot, 'docs', 'ui-audit', 'screenshots', surface, phase);
fs.mkdirSync(outDir, { recursive: true });

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const browser = await chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : {});
const report = { surface, phase, capturedAt: new Date().toISOString(), baseURL, pages: [] };

for (const profile of PROFILES) {
  const context = await browser.newContext({
    baseURL,
    storageState,
    viewport: { width: profile.width, height: profile.height },
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
  });
  for (const route of routes) {
    const page = await context.newPage();
    const consoleErrors = [];
    const failedApi = [];
    const failedRequests = [];
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      // Chromium's "Failed to load resource: net::ERR_*" text omits the URL; attribute it.
      const source = message.location()?.url || '';
      if (/^Failed to load resource/.test(text)) {
        if (UNREACHABLE_THIRD_PARTY.test(source)) return;
        consoleErrors.push(source ? `${text} [${describeUrl(source)}]` : text);
        return;
      }
      consoleErrors.push(text);
    });
    page.on('requestfailed', (request) => {
      if (UNREACHABLE_THIRD_PARTY.test(request.url())) return;
      failedRequests.push(`${request.failure()?.errorText || 'failed'} ${request.method()} ${describeUrl(request.url())}`);
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/') && response.status() >= 400) failedApi.push(`${response.status()} ${response.request().method()} ${url.pathname}`);
    });
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const slug = route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_') || 'root';
    const file = `${profile.name}__${slug}.jpg`;
    await page.screenshot({ path: path.join(outDir, file), fullPage: true, type: 'jpeg', quality: 60 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    report.pages.push({ profile: profile.name, route, finalUrl: new URL(page.url()).pathname, file, horizontalOverflowPx: Math.max(0, overflow), consoleErrors, failedRequests, failedApi });
    await page.close();
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(path.join(outDir, 'capture-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`captured ${report.pages.length} screens -> ${path.relative(repoRoot, outDir)}`);
for (const entry of report.pages) {
  const issues = [entry.horizontalOverflowPx ? `overflow ${entry.horizontalOverflowPx}px` : '', entry.failedApi.length ? `api ${entry.failedApi.join(', ')}` : '', entry.failedRequests.length ? `requests ${entry.failedRequests.join(', ')}` : '', entry.consoleErrors.length ? `${entry.consoleErrors.length} console errors` : ''].filter(Boolean).join(' | ');
  console.log(`  ${entry.profile.padEnd(13)} ${entry.route.padEnd(28)} ${issues || 'clean'}`);
}
