import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'desktop-1280x800', width: 1280, height: 800 },
    { name: 'desktop-1440x900', width: 1440, height: 900 },
    { name: 'desktop-1920x1080', width: 1920, height: 1080 },
    { name: 'mobile-390x844', width: 390, height: 844 },
    { name: 'mobile-414x896', width: 414, height: 896 }
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, ignoreHTTPSErrors: true });
    await page.goto('https://ai-resume-builder.local/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.rp-public-site', { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `test-results/audit-capture-${vp.name}.png`, fullPage: true });
    await page.close();
  }

  console.log('All 5 multi-resolution audit captures successfully saved!');
  await browser.close();
})().catch(console.error);
