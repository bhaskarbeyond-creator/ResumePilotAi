import { chromium } from 'playwright';
import assert from 'assert';

(async () => {
  console.log('Testing cross-page hash navigation from /blog to /#pricing, /#templates, etc...\n');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });

  // 1. Go to /blog
  console.log('1. Navigating to /blog...');
  await page.goto('https://ai-resume-builder.local/blog', { waitUntil: 'networkidle' });
  await page.waitForSelector('.rp-public-site');

  // 2. Click "Pricing" in the top navbar while on /blog
  console.log('2. Clicking "Pricing" navbar link from /blog...');
  await page.click('a.rp-nav-item:has-text("Pricing")');
  await page.waitForTimeout(500);

  const currentUrl = page.url();
  console.log('  Current URL after clicking Pricing:', currentUrl);
  assert.ok(currentUrl.includes('/#pricing') || currentUrl.endsWith('/#pricing'), 'URL must navigate to /#pricing');

  // Verify that the pricing section is in view on the homepage
  const hasPricingSection = await page.$eval('#pricing', el => !!el).catch(() => false);
  console.log('  ✓ #pricing section present on landed page:', hasPricingSection);
  assert.ok(hasPricingSection, '#pricing section must exist on landed page');

  // 3. Go back to /blog and click "Resume Templates"
  console.log('\n3. Navigating back to /blog and clicking "Resume Templates"...');
  await page.goto('https://ai-resume-builder.local/blog', { waitUntil: 'networkidle' });
  await page.waitForSelector('.rp-public-site');

  await page.click('a.rp-nav-item:has-text("Resume Templates")');
  await page.waitForTimeout(500);

  const templatesUrl = page.url();
  console.log('  Current URL after clicking Templates:', templatesUrl);
  assert.ok(templatesUrl.includes('/#templates'), 'URL must navigate to /#templates');

  const hasTemplatesSection = await page.$eval('#templates', el => !!el).catch(() => false);
  console.log('  ✓ #templates section present on landed page:', hasTemplatesSection);
  assert.ok(hasTemplatesSection, '#templates section must exist on landed page');

  // 4. Test clicking from within an article page (/blog/:slug) to #resume-builder
  console.log('\n4. Navigating to article page /blog/how-to-beat-ats-screening-2026 and clicking Product -> Resume Builder...');
  await page.goto('https://ai-resume-builder.local/blog/how-to-beat-ats-screening-2026', { waitUntil: 'networkidle' });
  await page.waitForSelector('.rp-article-wrap');

  await page.hover('#rp-nav-product-btn');
  await page.waitForTimeout(200);
  await page.click('a:has-text("Resume Builder")');
  await page.waitForTimeout(500);

  const builderUrl = page.url();
  console.log('  Current URL after clicking Resume Builder:', builderUrl);
  assert.ok(builderUrl.includes('/#resume-builder'), 'URL must navigate to /#resume-builder');

  console.log('\n✅ ALL CROSS-PAGE HASH NAVIGATION CHECKS PASSED!');
  await browser.close();
})().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
