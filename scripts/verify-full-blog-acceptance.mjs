import { chromium } from 'playwright';
import assert from 'assert';
import fs from 'fs';

const BASE_URL = 'https://ai-resume-builder.local';

const VIEWPORTS = [
  { name: 'Desktop QHD', width: 1440, height: 900 },
  { name: 'Desktop HD', width: 1280, height: 800 },
  { name: 'Tablet Landscape', width: 1024, height: 768 },
  { name: 'Tablet Portrait', width: 768, height: 1024 },
  { name: 'Mobile iPhone 14', width: 390, height: 844 },
  { name: 'Mobile iPhone SE', width: 375, height: 812 }
];

async function runComprehensiveBlogAudit() {
  console.log('================================================================');
  console.log('  RESUMEPILOT AI — COMPREHENSIVE BLOG & ARTICLE AUDIT');
  console.log('  LOCAL DEVELOPMENT ONLY — STRICT PRODUCTION FREEZE');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const networkErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(`PAGE_ERROR: ${err.message}`));
  page.on('requestfailed', req => {
    networkErrors.push({ url: req.url(), failure: req.failure() });
  });

  // 1. OPEN /blog
  console.log('1. NAVIGATING TO /blog...');
  const res = await page.goto(`${BASE_URL}/blog`, { waitUntil: 'networkidle' });
  assert.equal(res.status(), 200, 'HTTP status must be 200');
  await page.waitForSelector('.rp-public-site', { timeout: 10000 });

  // Verify .rp-public-site shell is present
  const hasPublicSiteShell = await page.$eval('.rp-public-site', el => !!el).catch(() => false);
  console.log('  ✓ Public Site Shell (.rp-public-site):', hasPublicSiteShell ? 'PASS' : 'FAIL');
  assert.ok(hasPublicSiteShell, 'Page must be wrapped in .rp-public-site');

  // Verify Navbar & Footer
  const hasNavbar = await page.$eval('#rp-main-nav', el => !!el).catch(() => false);
  const hasFooter = await page.$eval('#rp-footer-main', el => !!el).catch(() => false);
  console.log('  ✓ Shared Public Navbar (#rp-main-nav):', hasNavbar ? 'PASS' : 'FAIL');
  console.log('  ✓ Shared Public Footer (#rp-footer-main):', hasFooter ? 'PASS' : 'FAIL');
  assert.ok(hasNavbar && hasFooter, 'Header and Footer must be present');

  // Verify Cover Letter Studio is NOT in footer
  const footerText = await page.$eval('#rp-footer-main', el => el.innerText);
  const hasCoverLetterStudio = footerText.includes('Cover Letter Studio');
  console.log('  ✓ Cover Letter Studio Removed from Footer:', !hasCoverLetterStudio ? 'PASS (REMOVED)' : 'FAIL (STILL PRESENT)');
  assert.ok(!hasCoverLetterStudio, 'Cover Letter Studio must not be present in footer');

  // Verify Rendered Articles Count
  const articleCards = await page.$$('.rp-blog-card');
  console.log(`  ✓ Rendered Article Cards: ${articleCards.length} (Expected 3 from DB)`);
  assert.equal(articleCards.length, 3, 'Must render all 3 articles from DB');

  // 2. TEST SEARCH FILTER
  console.log('\n2. TESTING INSTANT SEARCH FILTER...');
  const searchInput = page.locator('#rp-blog-search-input');
  await searchInput.fill('Google');
  await page.waitForTimeout(300);
  const searchCards = await page.$$('.rp-blog-card');
  console.log(`  ✓ Search for "Google" -> Matched Cards: ${searchCards.length} (Expected 1)`);
  assert.equal(searchCards.length, 1, 'Search must filter to matching article');

  // Clear search
  await page.locator('.rp-blog-search-clear').click();
  await page.waitForTimeout(300);
  const clearedCards = await page.$$('.rp-blog-card');
  console.log(`  ✓ Clear Search -> Matched Cards: ${clearedCards.length} (Expected 3)`);
  assert.equal(clearedCards.length, 3, 'Clearing search must restore all articles');

  // 3. TEST CATEGORY PILLS
  console.log('\n3. TESTING CATEGORY PILLS...');
  const resumePill = page.locator('.rp-blog-pill:has-text("Resume Writing")');
  await resumePill.click();
  await page.waitForTimeout(300);
  const resumeCards = await page.$$('.rp-blog-card');
  console.log(`  ✓ Filter "Resume Writing" -> Matched Cards: ${resumeCards.length}`);
  assert.equal(resumeCards.length, 1, 'Category filter must filter to matching article');

  // Back to All Articles
  const allPill = page.locator('.rp-blog-pill:has-text("All Articles")');
  await allPill.click();
  await page.waitForTimeout(300);
  const allCards = await page.$$('.rp-blog-card');
  console.log(`  ✓ Filter "All Articles" -> Restored Cards: ${allCards.length}`);
  assert.equal(allCards.length, 3, 'Must restore all 3 articles');

  // 4. TEST VIEW MODE TOGGLE (Grid -> List -> Grid)
  console.log('\n4. TESTING VIEW MODE TOGGLE...');
  const listBtn = page.locator('.rp-blog-view-btn[title="List View"]');
  await listBtn.click();
  await page.waitForTimeout(200);
  const hasListView = await page.$eval('.rp-blog-list-view', el => !!el).catch(() => false);
  console.log('  ✓ List View Activated:', hasListView ? 'PASS' : 'FAIL');
  assert.ok(hasListView, 'Must switch to list view');

  const gridBtn = page.locator('.rp-blog-view-btn[title="Grid View"]');
  await gridBtn.click();
  await page.waitForTimeout(200);
  const hasGridView = await page.$eval('.rp-blog-grid', el => !!el).catch(() => false);
  console.log('  ✓ Grid View Restored:', hasGridView ? 'PASS' : 'FAIL');
  assert.ok(hasGridView, 'Must restore grid view');

  // 5. TEST ARTICLE DIRECT ACCESS, REFRESH, BACK/FORWARD
  console.log('\n5. TESTING DYNAMIC ARTICLE ROUTES...');
  const discoveredSlugs = await page.$$eval('.rp-blog-card a', anchors => 
    anchors.map(a => a.getAttribute('href')).filter(h => h && h.startsWith('/blog/'))
  );
  const slugs = Array.from(new Set(discoveredSlugs));
  console.log(`  Discovered ${slugs.length} real article slugs:`, slugs);
  assert.ok(slugs.length > 0, 'Must discover at least 1 article slug from /blog');

  for (const slug of slugs) {
    console.log(`  Testing route: ${slug}...`);
    const artRes = await page.goto(`${BASE_URL}${slug}`, { waitUntil: 'networkidle' });
    assert.equal(artRes.status(), 200, `${slug} must return 200`);

    const title = await page.$eval('.rp-article-title', el => el.innerText);
    const contentLen = await page.$eval('.rp-article-content', el => el.innerText.length);
    const navOk = await page.$eval('#rp-main-nav', el => !!el);
    const footerOk = await page.$eval('#rp-footer-main', el => !!el);

    console.log(`    ✓ Title: "${title.slice(0, 50)}..."`);
    console.log(`    ✓ Content Length: ${contentLen} chars`);
    console.log(`    ✓ Layout: Navbar ${navOk ? 'PASS' : 'FAIL'}, Footer ${footerOk ? 'PASS' : 'FAIL'}`);

    assert.ok(title && contentLen > 100 && navOk && footerOk, `Article ${slug} must be complete`);

    // Test Refresh
    await page.reload({ waitUntil: 'networkidle' });
    const reloadTitle = await page.$eval('.rp-article-title', el => el.innerText);
    assert.equal(title, reloadTitle, 'Title after reload must match');
  }

  // Test Back/Forward Navigation
  console.log('\n6. TESTING BROWSER BACK / FORWARD NAVIGATION...');
  await page.goto(`${BASE_URL}/blog`, { waitUntil: 'networkidle' });
  await page.click('text=How to Beat Applicant Tracking Systems');
  await page.waitForSelector('.rp-article-title');
  console.log('  ✓ Clicked article card -> Navigated to:', page.url());

  await page.goBack({ waitUntil: 'networkidle' });
  console.log('  ✓ Browser Back -> Current URL:', page.url());
  assert.ok(page.url().endsWith('/blog'), 'Browser back must return to /blog');

  await page.goForward({ waitUntil: 'networkidle' });
  console.log('  ✓ Browser Forward -> Current URL:', page.url());
  assert.ok(page.url().includes('/blog/how-to-beat-ats'), 'Browser forward must return to article');

  // 7. RESPONSIVE VIEWPORT AUDIT
  console.log('\n7. TESTING RESPONSIVE VIEWPORTS (HORIZONTAL OVERFLOW & DRAWER)...');
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${BASE_URL}/blog`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`  ✓ ${vp.name.padEnd(24)} (${vp.width}x${vp.height}): Horizontal Overflow: ${overflow ? 'FAIL' : '0px PASS'}`);
    assert.ok(!overflow, `No horizontal overflow allowed on ${vp.name}`);
  }

  // 8. FINAL CONSOLE / NETWORK ASSERTIONS
  console.log('\n8. CONSOLE & NETWORK AUDIT RESULTS:');
  console.log(`  Console Errors count: ${consoleErrors.length}`);
  console.log(`  Network Errors count: ${networkErrors.length}`);
  assert.equal(consoleErrors.length, 0, 'Must have zero uncaught console errors');
  assert.equal(networkErrors.length, 0, 'Must have zero failed network requests');

  console.log('\n================================================================');
  console.log('  FULL BLOG & ARTICLE AUDIT: 100% PASSED');
  console.log('================================================================\n');

  await browser.close();
}

runComprehensiveBlogAudit().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err);
  process.exit(1);
});
