import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/chrome$|chromium$|chrome-headless-shell$/.test(entry.name)) candidates.push(full);
    }
  };
  walk('/home/user/.local/chrome');
  walk('/home/user/.cache/ms-playwright');
  return candidates.find((item) => fs.existsSync(item));
}

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* retry */ }
    await delay(400);
  }
  throw new Error(`Server did not start: ${url}`);
}

async function fillIfExists(page, selector, value) {
  const locator = page.locator(selector).first();
  if (await locator.count()) {
    await locator.fill(value);
    return true;
  }
  return false;
}

const chrome = findChrome();
if (!chrome) {
  console.error('BROWSER_UNAVAILABLE: no Chromium/Chrome executable found');
  process.exit(2);
}

const port = process.env.ATS_BROWSER_PORT || '4178';
const base = `http://127.0.0.1:${port}`;
const server = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', port], {
  cwd: process.cwd(),
  stdio: 'pipe',
});
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

try {
  await waitForServer(`${base}/build-resume/heading`);
  const browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);
  await page.goto(`${base}/build-resume/heading`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="ats-score-meter"]');
  const startScore = await page.locator('[data-testid="ats-readiness-score"]').innerText();

  await fillIfExists(page, 'input[name="firstname"]', 'Maya');
  await fillIfExists(page, 'input[name="lastname"]', 'Iyer');
  await fillIfExists(page, 'input[name="email"]', 'maya@example.com');
  await fillIfExists(page, 'input[name="phone"]', '4155550199');
  await fillIfExists(page, 'input[name="occupation"]', 'Senior Software Engineer');
  await fillIfExists(page, 'input[name="city"]', 'San Francisco');
  await delay(700);
  const afterHeading = await page.locator('[data-testid="ats-readiness-score"]').innerText();

  await page.goto(`${base}/build-resume/summary`, { waitUntil: 'domcontentloaded' });
  const summary = page.locator('textarea, [contenteditable="true"]').first();
  if (await summary.count()) {
    await summary.fill('Senior engineer who ships reliable product surfaces and coaches teammates on delivery.');
  }
  await delay(700);

  await page.goto(`${base}/build-resume/work-history`, { waitUntil: 'domcontentloaded' });
  await fillIfExists(page, 'input[name*="jobTitle"], input[name*="title"]', 'Senior Software Engineer');
  await fillIfExists(page, 'input[name*="employer"], input[name*="company"]', 'Northwind Labs');
  const workDesc = page.locator('textarea, [contenteditable="true"]').first();
  if (await workDesc.count()) {
    await workDesc.fill('Led a platform rewrite that reduced checkout latency 37% and recovered $1.2M.');
  }
  await delay(800);

  for (const step of ['education', 'skills', 'projects', 'certifications', 'achievements', 'references', 'languages']) {
    await page.goto(`${base}/build-resume/${step}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="ats-score-meter"]');
  }

  await page.locator('[data-testid="ats-score-meter"] button[aria-expanded]').click();
  await page.locator('[data-testid="ats-jd-toggle"]').click();
  await page.locator('[data-testid="ats-jd-input"]').fill('Senior Software Engineer. Required: React Native, Node.js, CI/CD, Google Cloud.');
  await page.locator('[data-testid="ats-jd-apply"]').click();
  await delay(400);
  const matchText = await page.locator('[data-testid="ats-jd-match"]').innerText();
  const readiness = await page.locator('[data-testid="ats-readiness-score"]').innerText();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/build-resume/heading`, { waitUntil: 'domcontentloaded' });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4);

  const preview = page.getByRole('button', { name: /preview/i }).first();
  if (await preview.count()) await preview.click().catch(() => {});
  const download = page.getByRole('button', { name: /download/i }).first();
  const hasDownload = await download.count() > 0;

  await browser.close();
  console.log(JSON.stringify({
    ok: true,
    chrome,
    startScore,
    afterHeading,
    readiness,
    matchText,
    mobileOverflow,
    hasDownload,
    serverLogTail: serverLog.slice(-400),
  }, null, 2));
  if (!matchText.toLowerCase().includes('match') && !/%/.test(matchText)) throw new Error(`JD match not shown: ${matchText}`);
  if (mobileOverflow) throw new Error('Mobile viewport caused horizontal overflow');
} finally {
  server.kill('SIGTERM');
}
