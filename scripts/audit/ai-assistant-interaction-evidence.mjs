#!/usr/bin/env node
/**
 * Interaction evidence for the AI Assistant (P002 surface 2): signs in as the
 * E2E account (storage state from frontend/tests/candidate/auth.setup.ts),
 * submits one real bullet, and records what the page displays and which API
 * calls it made. Used for the before/after comparison of the fabricated-output
 * defect. Nothing is mocked.
 *
 *   node scripts/audit/ai-assistant-interaction-evidence.mjs --phase before|after
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = createRequire(path.join(repoRoot, 'frontend', 'package.json'))('@playwright/test');
const phase = process.argv[process.argv.indexOf('--phase') + 1];
if (!['before', 'after'].includes(phase)) {
  console.error('usage: --phase before|after');
  process.exit(2);
}
const INPUT = 'Managed the cloud database and fixed bugs when things broke.';
const INVENTED = ['38%', '$45,000', '99.98%', '42% to 91%', '$120k'];
const outDir = path.join(repoRoot, 'docs', 'ui-audit', 'screenshots', 'ai-assistant', phase);
fs.mkdirSync(outDir, { recursive: true });

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const browser = await chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : {});
const context = await browser.newContext({
  baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4000',
  storageState: path.join(repoRoot, 'frontend', 'test-results', '.auth', 'candidate-a.json'),
  viewport: { width: 1366, height: 900 },
});
const page = await context.newPage();
const apiCalls = [];
page.on('response', (response) => {
  const url = new URL(response.url());
  if (/generate/.test(url.pathname)) apiCalls.push(`${response.status()} ${response.request().method()} ${url.pathname}`);
});
await page.goto('/dashboard/ai', { waitUntil: 'networkidle' });
await page.locator('textarea').first().fill(INPUT);
await page.getByRole('button', { name: /generate/i }).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(outDir, 'interaction-laptop-1366__generate_bullet.jpg'), type: 'jpeg', quality: 60, fullPage: true });
const shown = await page.locator('main').innerText();
const report = {
  phase,
  capturedAt: new Date().toISOString(),
  input: INPUT,
  apiCalls,
  inventedMetricsShown: INVENTED.filter((metric) => shown.includes(metric)),
};
fs.writeFileSync(path.join(outDir, 'interaction-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(report);
await browser.close();
