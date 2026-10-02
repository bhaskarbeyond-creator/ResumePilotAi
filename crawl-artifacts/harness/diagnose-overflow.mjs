/** Identify which elements cause horizontal overflow at a given viewport. */
import { DEFAULT_BASE, launchBrowser, newContext } from './crawler-harness.mjs';

const BASE = process.env.CRAWL_BASE_URL || DEFAULT_BASE;
const ROUTE = process.argv[2] || '/features';
const W = Number(process.argv[3] || 430);
const H = Number(process.argv[4] || 932);

const browser = await launchBrowser();
const ctx = await newContext(browser, { width: W, height: H });
const page = await ctx.newPage();
await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 45000 });
await page.waitForTimeout(2500);

const report = await page.evaluate(() => {
  const docW = document.documentElement.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > docW + 1 || r.left < -1) {
      const cs = getComputedStyle(el);
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 90),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        overflowX: cs.overflowX,
        minWidth: cs.minWidth,
        whiteSpace: cs.whiteSpace,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      });
    }
  }
  return {
    clientWidth: docW,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    offenders: offenders.slice(0, 25),
    totalOffenders: offenders.length,
  };
});

console.log(`${ROUTE} @ ${W}x${H}`);
console.log(`clientWidth=${report.clientWidth} scrollWidth=${report.scrollWidth} bodyScrollWidth=${report.bodyScrollWidth}`);
console.log(`offenders=${report.totalOffenders}`);
for (const o of report.offenders) {
  console.log(`  <${o.tag}> left=${o.left} right=${o.right} w=${o.width} overflowX=${o.overflowX} minWidth=${o.minWidth} ws=${o.whiteSpace}`);
  console.log(`      class="${o.cls}"`);
  console.log(`      text="${o.text}"`);
}

await browser.close();
