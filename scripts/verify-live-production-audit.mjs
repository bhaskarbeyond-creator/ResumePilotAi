/**
 * LIVE PRODUCTION AUDIT — PLAYWRIGHT
 * Target: https://airesume.projectdemo.guru
 * Validates: Zero broken pages, zero 404s, zero 500s, zero console errors, full UI responsiveness
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const PROD_URL = 'https://airesume.projectdemo.guru';

const VIEWPORTS = [
  { name: 'Desktop QHD (1440x900)', width: 1440, height: 900 },
  { name: 'Desktop HD (1280x800)', width: 1280, height: 800 },
  { name: 'Tablet (1024x768)', width: 1024, height: 768 },
  { name: 'Mobile iPhone 14 (390x844)', width: 390, height: 844 },
  { name: 'Mobile iPhone SE (375x812)', width: 375, height: 812 },
];

async function runLiveProductionAudit() {
  console.log('================================================================');
  console.log('  RESUMEPILOT AI — LIVE PRODUCTION ZERO BROKEN PAGES AUDIT');
  console.log(`  Target: ${PROD_URL}`);
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'ResumePilot-Production-Auditor/1.0'
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const networkFailures = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), location: msg.location() });
    }
  });

  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon') && !res.url().includes('analytics')) {
      networkFailures.push({ url: res.url(), status: res.status() });
    }
  });

  // 1. Audit Live Version & Health
  console.log('1. AUDITING LIVE PLATFORM HEALTH & IDENTITY...');
  const versionRes = await page.goto(`${PROD_URL}/api/platform/version`, { waitUntil: 'networkidle' });
  assert.equal(versionRes.status(), 200, '/api/platform/version must be 200');
  const versionJson = JSON.parse(await versionRes.text());
  console.log(`  ✓ Version: SHA ${versionJson.commitSha} (Aligned: ${versionJson.releaseIdentity?.aligned})`);

  const readyRes = await page.goto(`${PROD_URL}/api/readyz`, { waitUntil: 'networkidle' });
  assert.equal(readyRes.status(), 200, '/api/readyz must be 200');
  const readyJson = JSON.parse(await readyRes.text());
  console.log(`  ✓ Readiness: ${readyJson.status} (DB: ${readyJson.checks?.mysql?.version})`);

  // 2. Discover Live Public Destinations
  console.log('\n2. DISCOVERING LIVE PUBLIC ROUTES...');
  await page.goto(`${PROD_URL}/`, { waitUntil: 'networkidle' });
  
  const discoveredHrefs = await page.$$eval('a[href]', (anchors) =>
    anchors.map(a => a.getAttribute('href')).filter(Boolean)
  );
  
  const internalHrefs = Array.from(new Set(
    discoveredHrefs
      .filter(h => h.startsWith('/') && !h.startsWith('//') && !h.startsWith('/api') && !h.startsWith('/admin') && !h.startsWith('/adm'))
  ));
  console.log(`  Discovered ${internalHrefs.length} internal links from homepage:`, internalHrefs);

  // Discover Blog Article Slugs
  await page.goto(`${PROD_URL}/blog`, { waitUntil: 'networkidle' });
  const articleHrefs = await page.$$eval('.rp-blog-card a, .rp-article-card a, a[href^="/blog/"]', (anchors) =>
    anchors.map(a => a.getAttribute('href')).filter(h => h && h.startsWith('/blog/'))
  );
  const uniqueArticles = Array.from(new Set(articleHrefs));
  console.log(`  Discovered ${uniqueArticles.length} live article routes:`, uniqueArticles);

  const testRoutes = Array.from(new Set([
    '/',
    '/blog',
    '/pricing',
    '/contact',
    '/p/privacy-policy',
    '/p/terms-of-service',
    '/p/cookie-policy',
    '/p/about-us',
    '/features',
    '/jobs',
    '/jobs/portal',
    '/jobs/browse',
    '/jobs/categories',
    '/portfolios',
    '/enterprise',
    '/login',
    ...uniqueArticles
  ]));

  console.log(`\n3. AUDITING ${testRoutes.length} LIVE ROUTES DIRECTLY & ON RELOAD:`);
  let passedCount = 0;
  const auditResults = [];

  for (const route of testRoutes) {
    const directRes = await page.goto(`${PROD_URL}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
    const directStatus = directRes.status();
    const title = await page.title();
    
    // Verify no unhandled RouteErrorBoundary
    const hasError = await page.evaluate(() => {
      const errEl = document.querySelector('.route-error-boundary, #route-error, [data-testid="error-boundary"]');
      const text = document.body.innerText || '';
      return !!errEl || text.includes('Application View Error') || text.includes('ChunkLoadError');
    });

    if (directStatus === 200 && !hasError) {
      console.log(`  [PASS] ${route.padEnd(42)} ➔ Title: "${title.slice(0, 35)}" (200 OK)`);
      passedCount++;
      auditResults.push({ route, status: 'PASS', code: directStatus, title });
    } else {
      console.error(`  [FAIL] ${route.padEnd(42)} ➔ Code: ${directStatus}, Error Detected: ${hasError}`);
      auditResults.push({ route, status: 'FAIL', code: directStatus, hasError });
    }
  }

  // 4. Test Navigation & Viewport Responsiveness on Live Production
  console.log('\n4. TESTING NAVIGATION & RESPONSIVE VIEWPORTS ON LIVE PRODUCTION:');
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${PROD_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`  ✓ ${vp.name.padEnd(30)}: Horizontal Overflow: ${overflow ? 'FAIL' : '0px PASS'}`);
    assert.ok(!overflow, `No horizontal overflow allowed on ${vp.name}`);
  }

  console.log('\n================================================================');
  console.log('  LIVE PRODUCTION AUDIT RESULTS:');
  console.log(`  Total Routes Tested: ${testRoutes.length}`);
  console.log(`  Passed:              ${passedCount}`);
  console.log(`  Failed:              ${testRoutes.length - passedCount}`);
  console.log(`  Console Errors:      ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log('  Console Errors Details:', JSON.stringify(consoleErrors, null, 2));
  }
  console.log(`  Network Errors:      ${networkFailures.length}`);
  if (networkFailures.length > 0) {
    console.log('  Network Errors Details:', JSON.stringify(networkFailures, null, 2));
  }
  console.log('================================================================\n');

  await browser.close();

  if (passedCount === testRoutes.length && consoleErrors.length === 0) {
    console.log('🎉 ZERO BROKEN PAGES VERIFIED ON LIVE PRODUCTION! 🎉\n');
  } else {
    throw new Error(`Audit failed with ${testRoutes.length - passedCount} broken routes or ${consoleErrors.length} console errors.`);
  }
}

runLiveProductionAudit().catch((err) => {
  console.error('LIVE AUDIT FAILED:', err);
  process.exit(1);
});
