/** Capture ALL responses (not just /api/) so a stray 404 can be identified. */
import { DEFAULT_BASE, launchBrowser, newContext } from './crawler-harness.mjs';

const BASE = process.env.CRAWL_BASE_URL || DEFAULT_BASE;
const ROUTE = process.argv[2] || '/create-resume/heading';
const W = Number(process.argv[3] || 375);
const H = Number(process.argv[4] || 812);
const ATTEMPTS = Number(process.argv[5] || 8);

const browser = await launchBrowser();
let found = 0;

for (let i = 0; i < ATTEMPTS; i += 1) {
  const ctx = await newContext(browser, { width: W, height: H });
  const page = await ctx.newPage();
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
  const resp = await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(1500);
  if (bad.length) {
    found += 1;
    console.log(`attempt ${i + 1}: doc=${resp?.status()}`);
    for (const b of bad) console.log(`   ${b}`);
  }
  await ctx.close();
}

console.log(`\n${found}/${ATTEMPTS} attempts produced a 4xx/5xx subresource`);
await browser.close();
