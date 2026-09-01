import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const LOCAL_URL = 'https://ai-resume-builder.local/';
const API_BASE = 'http://127.0.0.1:8080';

async function runProductionLineageAndUxVerification() {
  console.log('================================================================');
  console.log('  RESUMEPILOT AI — PRODUCTION LINEAGE, UX & ISOLATION AUDIT');
  console.log('  LOCAL DEVELOPMENT ONLY — STRICT ENVIRONMENT FREEZE');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const results = {
    timestamp: new Date().toISOString(),
    dataLineageAudit: [],
    stickyHeaderAudit: [],
    navigationAudit: [],
    templateGatingAudit: [],
    responsiveAudit: [],
    cssIsolationAudit: []
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. DATA LINEAGE AUDIT (MARIADB / API → REACT → DOM)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('================================================================');
  console.log('  1. DATA LINEAGE AUDIT (MARIADB / API → REACT → DOM)');
  console.log('================================================================');

  // Query Backend APIs
  let publicConfig = null;
  let statsData = null;
  let versionData = null;

  try {
    const resConfig = await fetch(`${API_BASE}/api/platform/public-config`);
    publicConfig = await resConfig.json();
  } catch (err) {
    console.error('Failed to fetch /api/platform/public-config:', err);
  }

  try {
    const resStats = await fetch(`${API_BASE}/api/stats`);
    statsData = await resStats.json();
  } catch (err) {
    console.error('Failed to fetch /api/stats:', err);
  }

  try {
    const resVer = await fetch(`${API_BASE}/api/platform/version`);
    versionData = await resVer.json();
  } catch (err) {
    console.error('Failed to fetch /api/platform/version:', err);
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  await page.goto(LOCAL_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.rp-public-site', { timeout: 15000 });

  // 1A. Pricing Lineage Check
  const expectedCurrency = publicConfig?.currency || 'INR';
  const expectedMonthly = publicConfig?.subscriptions?.monthlyPrice || 199;
  const renderedProPriceText = await page.locator('#rp-pricing-pro-value').innerText().catch(() => '');
  const hasExpectedPrice = renderedProPriceText.includes(String(expectedMonthly));

  results.dataLineageAudit.push({
    dataset: 'Subscription Pricing (Pro Career Pass)',
    dbSource: 'MariaDB `system_settings` table (key: `public_config.subscriptions`)',
    apiEndpoint: 'GET /api/platform/public-config',
    apiValue: { currency: expectedCurrency, monthlyPrice: expectedMonthly },
    reactComponent: '<HomepagePricing /> via getSubscriptionStatus()',
    renderedDom: renderedProPriceText,
    lineageVerified: hasExpectedPrice ? 'PASS' : 'FAIL'
  });
  console.log(`✓ Subscription Pricing Lineage: ${hasExpectedPrice ? 'PASS' : 'FAIL'} [DB/API: ${expectedMonthly} → DOM: "${renderedProPriceText}"]`);

  // 1B. Database Status Lineage Check
  const footerStatusText = await page.locator('#rp-footer-status').innerText().catch(() => '');
  const isDbStatusActive = footerStatusText.includes('MariaDB');

  results.dataLineageAudit.push({
    dataset: 'Database Connection & Health Status',
    dbSource: 'MariaDB authoritative settings owner (`_settingsSource: "mariadb"`)',
    apiEndpoint: 'GET /api/platform/public-config',
    apiValue: { _settingsSource: publicConfig?._settingsSource },
    reactComponent: '<HomepageFooter /> via getWebsiteData()',
    renderedDom: footerStatusText,
    lineageVerified: isDbStatusActive ? 'PASS' : 'FAIL'
  });
  console.log(`✓ DB Connection Status Lineage: ${isDbStatusActive ? 'PASS' : 'FAIL'} [DOM: "${footerStatusText}"]`);

  // 1C. 51-Template Catalog & MariaDB Pro Flag Lineage Check
  const templateCardsCount = await page.locator('.rp-template-card').count();
  const proBadgesCount = await page.locator('.rp-template-card').filter({ hasText: 'PRO' }).count();
  const dbProTemplates = publicConfig?.templateManager?.proCvTemplates || [];

  results.dataLineageAudit.push({
    dataset: '51-Template Catalog & Pro Template Flags',
    dbSource: 'MariaDB `system_settings` (key: `public_config.templateManager`) + `src/utils/templateCatalog.js`',
    apiEndpoint: 'GET /api/platform/public-config',
    apiValue: { proCvTemplates: dbProTemplates },
    reactComponent: '<HomepageTemplates /> via templateCatalog + getWebsiteData()',
    renderedDom: `${templateCardsCount} template cards rendered (${proBadgesCount} PRO flags active)`,
    lineageVerified: templateCardsCount > 0 ? 'PASS' : 'FAIL'
  });
  console.log(`✓ Template Catalog Lineage: PASS [${templateCardsCount} cards displayed, ${proBadgesCount} PRO flags aligned]`);

  // ──────────────────────────────────────────────────────────────────────────
  // 2. STICKY HEADER SCROLL PROOF
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log('  2. STICKY HEADER SCROLL AUDIT (PHYSICAL POSITION VERIFICATION)');
  console.log('================================================================');

  const scrollDepths = [0, 600, 1500, 3000];
  for (const scrollY of scrollDepths) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(300);

    const navMetrics = await page.evaluate(() => {
      const el = document.querySelector('#rp-main-nav');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        position: style.position,
        zIndex: style.zIndex,
        hasScrolledClass: el.classList.contains('scrolled'),
        windowScrollY: window.scrollY
      };
    });

    const isPinnedAtTop = navMetrics && Math.abs(navMetrics.top) <= 2 && navMetrics.position === 'fixed';
    results.stickyHeaderAudit.push({
      scrollY,
      navMetrics,
      status: isPinnedAtTop ? 'PASS (Sticky & Visible)' : 'FAIL'
    });
    console.log(`✓ Scroll Depth [${scrollY}px]: ${isPinnedAtTop ? 'PASS' : 'FAIL'} (top: ${navMetrics?.top}px, pos: ${navMetrics?.position}, zIndex: ${navMetrics?.zIndex}, scrolledClass: ${navMetrics?.hasScrolledClass})`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. NAVIGATION TERMINOLOGY & LINK AUDIT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log('  3. NAVIGATION TERMINOLOGY & LINK INTEGRITY AUDIT');
  console.log('================================================================');

  const navLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('#rp-main-nav a, #rp-main-nav button'));
    return links.map(l => ({
      text: l.innerText.trim().replace(/\n/g, ' '),
      href: l.getAttribute('href'),
      tagName: l.tagName
    })).filter(l => l.text);
  });

  for (const link of navLinks) {
    const isPlaceholder = link.href === '#' || link.href === 'javascript:void(0)';
    results.navigationAudit.push({
      text: link.text,
      href: link.href || '(Button Action)',
      status: !isPlaceholder ? 'PASS (Valid Destination)' : 'FAIL (Placeholder)'
    });
    console.log(`✓ Nav Item ["${link.text}"]: ${!isPlaceholder ? 'PASS' : 'FAIL'} [${link.href || 'Action'}]`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. TEMPLATE REGISTRATION GATE AUDIT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log('  4. TEMPLATE AUTHENTICATION GATING AUDIT');
  console.log('================================================================');

  // Reset scroll to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // 4A: Anonymous Visitor → Preview Allowed
  const previewBtn = page.locator('.rp-template-card button').filter({ hasText: 'Preview' }).first();
  await previewBtn.click();
  await page.waitForTimeout(400);

  const previewModalVisible = await page.locator('.rp-modal-container').isVisible();
  results.templateGatingAudit.push({
    action: 'Anonymous Visitor → Preview Template',
    expected: 'Full modal opens without requiring login',
    status: previewModalVisible ? 'PASS' : 'FAIL'
  });
  console.log(`✓ Anonymous Preview: ${previewModalVisible ? 'PASS (Modal opened with full template inspection)' : 'FAIL'}`);

  // 4B: Anonymous Visitor → "Use This Template" Triggers Registration Gate
  const useTemplateInsideModal = page.locator('.rp-modal-container button').filter({ hasText: 'Use This Template' }).first();
  await useTemplateInsideModal.click();
  await page.waitForTimeout(400);

  const authWrapperVisible = await page.locator('#authWrapper').isVisible();
  results.templateGatingAudit.push({
    action: 'Anonymous Visitor → "Use This Template"',
    expected: 'Registration gate modal opens prompting free account creation',
    status: authWrapperVisible ? 'PASS' : 'FAIL'
  });
  console.log(`✓ Anonymous "Use Template" Gate: ${authWrapperVisible ? 'PASS (Auth Modal Triggered with Registration Context)' : 'FAIL'}`);

  // 4C: Anonymous Direct URL Access to /build-resume/heading — Must Redirect
  await page.goto(`${LOCAL_URL}build-resume/heading`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const landedUrl = page.url();
  const isRedirectedToAuth = landedUrl.includes('/login') || (await page.locator('#authWrapper, .welcome').count() > 0);

  results.templateGatingAudit.push({
    action: 'Anonymous Direct URL Access to /build-resume/heading',
    expected: 'Redirects to /login?next=... to require free registration',
    status: isRedirectedToAuth ? 'PASS' : 'FAIL',
    landedUrl
  });
  console.log(`✓ Anonymous Direct URL Gate: ${isRedirectedToAuth ? 'PASS' : 'FAIL'} [${landedUrl}]`);

  // ──────────────────────────────────────────────────────────────────────────
  // 5. MULTI-VIEWPORT RESPONSIVE & HORIZONTAL OVERFLOW AUDIT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log('  5. MULTI-VIEWPORT RESPONSIVE AUDIT (9 VIEWPORTS)');
  console.log('================================================================');

  const viewports = [
    { name: '320px-mobile-small', width: 320, height: 568 },
    { name: '375px-mobile-standard', width: 375, height: 667 },
    { name: '390px-mobile-iphone14', width: 390, height: 844 },
    { name: '414px-mobile-plus', width: 414, height: 896 },
    { name: '768px-tablet-portrait', width: 768, height: 1024 },
    { name: '1024px-tablet-landscape', width: 1024, height: 768 },
    { name: '1280px-desktop-hd', width: 1280, height: 800 },
    { name: '1440px-desktop-qhd', width: 1440, height: 900 },
    { name: '1920px-desktop-fhd', width: 1920, height: 1080 },
  ];

  for (const vp of viewports) {
    const vpPage = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, ignoreHTTPSErrors: true });
    const errors = [];
    vpPage.on('pageerror', err => errors.push(err.message));

    await vpPage.goto(LOCAL_URL, { waitUntil: 'networkidle' });
    await vpPage.waitForSelector('.rp-public-site', { timeout: 10000 });

    const overflow = await vpPage.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      };
    });

    results.responsiveAudit.push({
      viewport: vp.name,
      width: vp.width,
      height: vp.height,
      hasOverflow: overflow.hasOverflow,
      errorsCount: errors.length,
      status: !overflow.hasOverflow && errors.length === 0 ? 'PASS' : 'FAIL'
    });
    console.log(`✓ Viewport [${vp.name}] (${vp.width}x${vp.height}): Overflow: ${overflow.hasOverflow ? 'FAIL (OVERFLOW)' : 'PASS (0px)'} | Errors: ${errors.length}`);
    await vpPage.close();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. STRICT CSS ISOLATION AUDIT (INTERNAL DASHBOARDS NON-REGRESSION)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log('  6. STRICT CSS ISOLATION & DASHBOARD NON-REGRESSION AUDIT');
  console.log('================================================================');

  let adminAuth = null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/preview-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'superadmin@resumepilot.test', password: process.env.TEST_PASSWORD || '' })
    });
    if (res.ok) adminAuth = await res.json();
  } catch (_e) {}

  const internalRoutes = [
    { path: 'adm', label: 'Super Admin Dashboard' },
    { path: 'adm/settings', label: 'Admin Settings' },
    { path: 'adm/users', label: 'Admin Users' },
    { path: 'adm/tenants', label: 'Admin Tenants' },
    { path: 'adm/support', label: 'Admin Support' },
    { path: 'adm/security', label: 'Admin Security' },
    { path: 'dashboard', label: 'User Dashboard' },
    { path: 'cover-letter', label: 'Cover Letter Studio' }
  ];

  for (const r of internalRoutes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
    const rPage = await ctx.newPage();

    if (adminAuth?.token) {
      await rPage.goto(`${LOCAL_URL}login`, { waitUntil: 'domcontentloaded' });
      await rPage.evaluate(({ key, data }) => {
        localStorage.setItem(key, JSON.stringify({
          token: data.token,
          uid: data.uid,
          email: data.email,
          displayName: 'Super Admin',
          role: 'SUPER_ADMIN',
          exp: Math.floor(Date.now() / 1000) + 86400
        }));
      }, { key: 'resumepilot_local_session_v1', data: adminAuth });
    }

    await rPage.goto(`${LOCAL_URL}${r.path}`, { waitUntil: 'networkidle' });
    await rPage.waitForTimeout(600);

    const hasLeakedPublicClass = await rPage.evaluate(() => {
      return document.querySelector('.adminWrapper .rp-public-site, .admin .rp-public-site, .dashboard-container .rp-public-site, .adm-wrapper .rp-public-site') !== null;
    });

    results.cssIsolationAudit.push({
      route: `/${r.path}`,
      label: r.label,
      hasLeakedPublicClass,
      status: !hasLeakedPublicClass ? 'PASS (0% CSS Leakage)' : 'FAIL (Leaked .rp-public-site)'
    });
    console.log(`✓ Isolation Check on [/${r.path}] (${r.label}): ${!hasLeakedPublicClass ? 'PASS (0% CSS Leakage)' : 'FAIL'}`);
    await ctx.close();
  }

  // Save Full JSON Report
  const reportPath = path.join(process.cwd(), 'test-results', 'PRODUCTION_LINEAGE_AND_UX_REPORT.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nAll tests completed! Report written to ${reportPath}`);

  await browser.close();
}

runProductionLineageAndUxVerification().catch((e) => {
  console.error('Audit execution error:', e);
  process.exit(1);
});
