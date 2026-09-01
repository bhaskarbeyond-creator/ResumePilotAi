import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  
  page.on('response', res => {
    if (res.status() >= 400) {
      console.log(`[HTTP ERROR ${res.status()}]:`, res.url());
    }
  });

  await page.goto('https://ai-resume-builder.local/blog', { waitUntil: 'networkidle' });
  await page.waitForSelector('.rp-public-site', { timeout: 10000 });

  await browser.close();
})().catch(console.error);
