import { chromium } from 'playwright';
import path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  
  console.log('Navigating to https://ai-resume-builder.local/...');
  await page.goto('https://ai-resume-builder.local/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.rp-public-site', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const shotPath = path.resolve('test-results/current-homepage-full.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log('Saved full-page screenshot to:', shotPath);

  // Capture individual section screenshots for visual audit
  const sections = [
    { name: 'hero', selector: 'header, nav, section:first-of-type' },
    { name: 'trusted-ats', selector: '#ats-engine, section:nth-of-type(2)' },
    { name: 'comparison', selector: '#ats-engine' },
    { name: 'how-it-works', selector: '#how-it-works' },
    { name: 'templates', selector: '#templates' },
    { name: 'pricing', selector: '#pricing' },
    { name: 'faqs', selector: '#faqs' },
    { name: 'footer', selector: 'footer' }
  ];

  for (const s of sections) {
    const el = page.locator(s.selector).first();
    if (await el.count() > 0) {
      const p = path.resolve(`test-results/section-${s.name}.png`);
      await el.screenshot({ path: p });
      console.log(`Saved ${s.name} section to ${p}`);
    }
  }

  await browser.close();
})().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
