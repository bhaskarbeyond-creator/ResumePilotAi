/**
 * IME365 Crawler — live smoke probe (HTTPS origin).
 * Confirms the production SPA at https://ime365.local renders for an anonymous
 * visitor, and enumerates console / page / network failures precisely.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.CRAWL_BASE_URL || 'https://ime365.local';
const OUT = 'crawl-artifacts';

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--font-render-hinting=none', '--ignore-certificate-errors'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
const failed = [];
const api = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('requestfailed', (r) => failed.push({ url: r.url(), err: r.failure()?.errorText }));
page.on('response', (r) => { if (r.url().includes('/api/')) api.push({ url: r.url(), status: r.status(), method: r.request().method() }); });

const t0 = Date.now();
const resp = await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
const loadMs = Date.now() - t0;
await page.waitForTimeout(4000);

const info = await page.evaluate(() => ({
  title: document.title,
  url: location.href,
  bodyLen: (document.body?.innerText || '').length,
  headText: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 600),
  rootChildren: document.querySelector('#root')?.children.length ?? -1,
  links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).slice(0, 60),
  buttons: [...document.querySelectorAll('button')].map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 40),
}));

fs.mkdirSync(`${OUT}/screenshots`, { recursive: true });
await page.screenshot({ path: `${OUT}/screenshots/smoke-home.png`, fullPage: true });

console.log(JSON.stringify({
  base: BASE, httpStatus: resp?.status(), loadMs, ...info,
  consoleErrorCount: consoleErrors.length, consoleErrors: consoleErrors.slice(0, 25),
  pageErrors, failedCount: failed.length, failed: failed.slice(0, 25), api,
}, null, 2));

await browser.close();
