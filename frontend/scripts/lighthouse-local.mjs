import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { writeFileSync } from 'node:fs';

const chrome = await chromeLauncher.launch({
  chromePath: '/tmp/chromium',
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--single-process'],
});
try {
  const result = await lighthouse(process.env.LH_URL || 'http://127.0.0.1:4000/login', {
    port: chrome.port,
    output: ['json'],
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    formFactor: 'mobile',
    screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
    throttling: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4, requestLatencyMs: 562.5, downloadThroughputKbps: 1474.56, uploadThroughputKbps: 675 },
  });
  const raw = Array.isArray(result.report) ? result.report[0] : result.report;
  const report = JSON.parse(raw);
  const { categories, audits } = report;
  const scores = Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v.score]));
  console.log(JSON.stringify({
    scores,
    lcp: audits['largest-contentful-paint']?.numericValue,
    cls: audits['cumulative-layout-shift']?.numericValue,
    tbt: audits['total-blocking-time']?.numericValue,
    bytes: audits['total-byte-weight']?.numericValue,
    a11yFailing: Object.values(audits).filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary').map((a) => a.id),
  }, null, 2));
  writeFileSync('developer-review-artefacts/lighthouse-login-mobile-4g.json', raw);
} finally {
  await chrome.kill();
}
