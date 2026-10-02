/** Diagnose why a single route reported issues. */
import { DEFAULT_BASE, launchBrowser, newContext, instrument, resetCollectors, settle } from './crawler-harness.mjs';

const BASE = process.env.CRAWL_BASE_URL || DEFAULT_BASE;
const ROUTE = process.argv[2] || '/blog-editor';

const browser = await launchBrowser();
const ctx = await newContext(browser, { width: 1920, height: 1080 });
const page = await ctx.newPage();
const rec = instrument(page);
resetCollectors(rec);

const resp = await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 45000 });
await settle(page);

console.log(`route=${ROUTE}`);
console.log(`document status=${resp?.status()}`);
console.log(`final url=${page.url()}`);
console.log(`\n--- responses >=400 (${rec.responses.filter((r) => r.status >= 400).length}) ---`);
for (const r of rec.responses.filter((x) => x.status >= 400)) console.log(`  ${r.status} ${r.method} ${r.url}`);

console.log(`\n--- requestfailed (${rec.failedRequests.length}) ---`);
for (const f of rec.failedRequests) console.log(`  ${f.method} ${f.url} ${f.error}`);

console.log(`\n--- pageerror (${rec.pageErrors.length}) ---`);
for (const e of rec.pageErrors) console.log(`  ${e}`);

console.log(`\n--- console errors (${rec.consoleErrors.length}) ---`);
for (const c of rec.consoleErrors) console.log(`  ${c.slice(0, 300)}`);

const dom = await page.evaluate(() => ({
  textLength: document.body.innerText.length,
  hasMain: !!document.querySelector('main, [role="main"]'),
  textSample: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
}));
console.log('\n--- dom ---');
console.log(JSON.stringify(dom, null, 2));

await browser.close();
