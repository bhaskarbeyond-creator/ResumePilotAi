import { chromium } from 'playwright';
import assert from 'assert';

(async () => {
  console.log('Testing hard reload and portfolio visibility on /blog and /...\n');
  const browser = await chromium.launch({ headless: true });

  // Create a brand new context with no cache (simulating hard reload on /blog)
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // 1. Direct navigation directly to /blog on empty cache
  console.log('1. Direct navigation to https://ai-resume-builder.local/blog (simulating fresh tab / hard reload)...');
  await page.goto('https://ai-resume-builder.local/blog', { waitUntil: 'networkidle' });
  await page.waitForSelector('.rp-public-site', { timeout: 10000 });

  // Check if CSS rules are applied (e.g. font-family, navbar styles, header background)
  const heroBg = await page.$eval('.rp-blog-hero', el => window.getComputedStyle(el).backgroundImage);
  const cardBorderRadius = await page.$eval('.rp-blog-card', el => window.getComputedStyle(el).borderRadius);
  const titleFont = await page.$eval('.rp-hero-headline', el => window.getComputedStyle(el).fontFamily);
  const navbarDisplay = await page.$eval('#rp-main-nav', el => window.getComputedStyle(el).display);

  console.log('  ✓ Hero Background Gradient:', heroBg);
  console.log('  ✓ Card Border Radius:', cardBorderRadius);
  console.log('  ✓ Title Font Family:', titleFont);
  console.log('  ✓ Navbar Display:', navbarDisplay);

  assert.ok(cardBorderRadius && cardBorderRadius !== '0px', 'Blog card must have rounded corners from CSS');
  assert.ok(heroBg.includes('gradient'), 'Hero must have radial gradient from CSS');

  // Hard reload the page (F5 / reload)
  console.log('\n2. Triggering hard reload on /blog...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.rp-blog-card');
  const reloadedCardRadius = await page.$eval('.rp-blog-card', el => window.getComputedStyle(el).borderRadius);
  console.log('  ✓ Card Border Radius after hard reload:', reloadedCardRadius);
  assert.ok(['16px', '20px'].includes(reloadedCardRadius), 'Card border radius must remain styled after hard reload');

  // 3. Test Portfolio link in dropdown and mobile drawer when portfolio is disabled in backend
  console.log('\n3. Checking Portfolio visibility in Navbar Resources dropdown...');
  
  // Hover over Resources button
  await page.hover('#rp-nav-resources-btn');
  await page.waitForTimeout(300);

  const dropdownText = await page.$eval('#rp-nav-resources-btn + .rp-dropdown-wrapper', el => el.innerText).catch(() => '');
  console.log('  Dropdown text content:', JSON.stringify(dropdownText));
  const hasPortfolioInDropdown = dropdownText.includes('Portfolio');
  console.log('  ✓ Has "Portfolio" in Resources dropdown:', hasPortfolioInDropdown ? 'FAIL (STILL VISIBLE)' : 'PASS (HIDDEN)');
  assert.ok(!hasPortfolioInDropdown, 'Portfolio must be hidden from dropdown when module is disabled');

  // Check footer
  const footerText = await page.$eval('#rp-footer-main', el => el.innerText);
  const hasPortfolioInFooter = footerText.includes('Portfolio');
  console.log('  ✓ Has "Portfolio" in Footer:', hasPortfolioInFooter ? 'FAIL (STILL VISIBLE)' : 'PASS (HIDDEN)');
  assert.ok(!hasPortfolioInFooter, 'Portfolio must be hidden from footer when module is disabled');

  // Take screenshot of verified /blog on hard reload
  await page.screenshot({ path: 'test-results/hard_reload_blog_verified.png', fullPage: true });

  console.log('\n✅ ALL HARD-RELOAD & PORTFOLIO CHECKS PASSED!');
  await browser.close();
})().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
