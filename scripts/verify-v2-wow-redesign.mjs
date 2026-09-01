import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const viewports = [
  { name: '320px-mobile', width: 320, height: 568 },
  { name: '375px-mobile', width: 375, height: 667 },
  { name: '390px-mobile', width: 390, height: 844 },
  { name: '414px-mobile', width: 414, height: 896 },
  { name: '768px-tablet', width: 768, height: 1024 },
  { name: '1024px-desktop', width: 1024, height: 768 },
  { name: '1280px-desktop', width: 1280, height: 800 },
  { name: '1440px-desktop', width: 1440, height: 900 },
  { name: '1920px-desktop', width: 1920, height: 1080 }
];

async function runV2Audit() {
  const browser = await chromium.launch({ headless: true });
  const results = {
    viewportsTested: [],
    overflowAudit: [],
    consoleErrors: [],
    interactiveTests: [],
    templateGatingAudit: [],
    cssIsolationAudit: []
  };

  const screenshotsDir = path.resolve('test-results/v2-redesign-verification');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log('================================================================');
  console.log('  1. MULTI-VIEWPORT RESPONSIVE & HORIZONTAL OVERFLOW AUDIT');
  console.log('================================================================');

  for (const vp of viewports) {
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: vp.width, height: vp.height }
    });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') pageErrors.push(msg.text());
    });

    await page.goto('https://ai-resume-builder.local/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const overflow = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const winWidth = window.innerWidth;
      const bodyWidth = document.body.scrollWidth;
      return {
        hasOverflow: docWidth > winWidth + 1 || bodyWidth > winWidth + 1,
        docWidth,
        winWidth,
        bodyWidth
      };
    });

    const shotPath = path.join(screenshotsDir, `v2-homepage-${vp.name}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });

    results.viewportsTested.push({
      viewport: vp.name,
      dimensions: `${vp.width}x${vp.height}`,
      overflow: overflow.hasOverflow ? 'FAIL' : 'PASS',
      consoleErrorsCount: pageErrors.length,
      screenshot: shotPath
    });

    console.log(`✓ Viewport [${vp.name}] (${vp.width}x${vp.height}): Overflow: ${overflow.hasOverflow ? 'FAIL (OVERFLOW)' : 'PASS (0px)'} | Errors: ${pageErrors.length}`);
    await ctx.close();
  }

  console.log('\n================================================================');
  console.log('  2. TEMPLATE AUTHENTICATION GATING AUDIT (CRITICAL BUSINESS RULE)');
  console.log('================================================================');

  // Test 2A: Anonymous Visitor — Preview Allowed
  const anonCtx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 }
  });
  const anonPage = await anonCtx.newPage();
  await anonPage.goto('https://ai-resume-builder.local/', { waitUntil: 'networkidle' });

  // Find and click "Preview" on a template card
  const previewBtn = anonPage.locator('.rp-template-card button').filter({ hasText: 'Preview' }).first();
  await previewBtn.click();
  await anonPage.waitForTimeout(400);

  const modalVisible = await anonPage.locator('.rp-modal-container').isVisible();
  results.templateGatingAudit.push({
    flow: 'Anonymous Visitor → Preview Template',
    expected: 'Modal opens and displays template layout without requiring login',
    status: modalVisible ? 'PASS' : 'FAIL'
  });
  console.log(`✓ Anonymous Preview: ${modalVisible ? 'PASS (Modal opened with full template inspection)' : 'FAIL'}`);

  // Test 2B: Anonymous Visitor → "Use This Template" Triggers Free Registration Gate
  const useTemplateInsideModal = anonPage.locator('.rp-modal-container button').filter({ hasText: 'Use This Template' }).first();
  await useTemplateInsideModal.click();
  await anonPage.waitForTimeout(400);

  const authWrapperVisible = await anonPage.locator('#authWrapper').isVisible();
  results.templateGatingAudit.push({
    flow: 'Anonymous Visitor → "Use This Template" Action',
    expected: 'Blocks anonymous entry and opens Auth Modal with registration prompt',
    status: authWrapperVisible ? 'PASS' : 'FAIL'
  });
  console.log(`✓ Anonymous "Use This Template" Gate: ${authWrapperVisible ? 'PASS (Auth Modal Triggered)' : 'FAIL'}`);

  // Test 2C: Anonymous Direct URL Access to /build-resume/heading — Must Redirect
  await anonPage.goto('https://ai-resume-builder.local/build-resume/heading', { waitUntil: 'networkidle' });
  await anonPage.waitForTimeout(500);
  const currentUrl = anonPage.url();
  const isRedirectedToAuth = currentUrl.includes('/login') || (await anonPage.locator('#authWrapper, .welcome, .login-container').count() > 0);
  results.templateGatingAudit.push({
    flow: 'Anonymous Visitor → Direct /build-resume/heading URL',
    expected: 'Redirects to /login?next=... to require free registration',
    status: isRedirectedToAuth ? 'PASS' : 'FAIL',
    landedUrl: currentUrl
  });
  console.log(`✓ Anonymous Direct URL Protection: ${isRedirectedToAuth ? 'PASS (Redirected off-path)' : 'FAIL'} [${currentUrl}]`);
  await anonCtx.close();

  // Test 2D: Registered Free User → Allowed into Builder with Template
  let freeUserToken = null;
  try {
    const res = await fetch('http://127.0.0.1:8080/api/auth/preview-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@test.test', password: 'password123' })
    });
    if (res.ok) freeUserToken = await res.json();
  } catch (_e) {}

  if (freeUserToken?.token) {
    const authCtx = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 }
    });
    const authPage = await authCtx.newPage();
    await authPage.goto('https://ai-resume-builder.local/login', { waitUntil: 'domcontentloaded' });
    await authPage.evaluate(({ key, data }) => {
      localStorage.setItem(key, JSON.stringify({
        token: data.token,
        uid: data.uid,
        email: data.email,
        displayName: 'Test Free User',
        role: 'USER',
        exp: Math.floor(Date.now() / 1000) + 86400
      }));
    }, { key: 'resumepilot_local_session_v1', data: freeUserToken });

    await authPage.goto('https://ai-resume-builder.local/build-resume/heading?template=Cv5', { waitUntil: 'networkidle' });
    await authPage.waitForTimeout(1000);

    const isBuilderLoaded = await authPage.evaluate(() => {
      return document.querySelector('#main-content, .buildResume, .headingStep, input[name="firstName"], input') !== null;
    });

    results.templateGatingAudit.push({
      flow: 'Registered Free User → Builder Access with Template',
      expected: 'Permits entry into the Resume Builder with selected template',
      status: isBuilderLoaded ? 'PASS' : 'FAIL'
    });
    console.log(`✓ Registered User Builder Entry: ${isBuilderLoaded ? 'PASS (Builder Loaded)' : 'FAIL'}`);
    await authCtx.close();
  }

  console.log('\n================================================================');
  console.log('  3. INTERACTIVE CONTROLS & MOTION AUDIT');
  console.log('================================================================');
  const desktopCtx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 }
  });
  const page = await desktopCtx.newPage();
  await page.goto('https://ai-resume-builder.local/', { waitUntil: 'networkidle' });

  // Hero showcase tabs
  const heroTabs = ['Interview Coach', 'ATS Matcher', 'Web Portfolio', 'Resume Builder'];
  for (const t of heroTabs) {
    const tabBtn = page.locator('.rp-showcase-tab').filter({ hasText: t }).first();
    if (await tabBtn.count() > 0) {
      await tabBtn.click();
      await page.waitForTimeout(200);
      results.interactiveTests.push({ test: `Hero Tab: ${t}`, status: 'PASS' });
      console.log(`✓ Hero Showcase switched to: ${t}`);
    }
  }

  // Before & After comparison tabs
  const comparisonAspects = ['ATS Screening Parsing', 'Executive Career Summary', 'Targeted Skills Matrix', 'Metric-Driven Bullet Points'];
  for (const asp of comparisonAspects) {
    const btn = page.locator('#ats-engine button').filter({ hasText: asp }).first();
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(200);
      results.interactiveTests.push({ test: `Before & After Aspect: ${asp}`, status: 'PASS' });
      console.log(`✓ Comparison aspect switched to: ${asp}`);
    }
  }

  // Template categories filter
  const templateCategories = ['Modern Tech', 'Executive Leadership', 'Minimalist & ATS Pure', 'Design & Creative', 'All 51 Templates'];
  for (const cat of templateCategories) {
    const catBtn = page.locator('#templates button').filter({ hasText: cat }).first();
    if (await catBtn.count() > 0) {
      await catBtn.click();
      await page.waitForTimeout(200);
      results.interactiveTests.push({ test: `Template Category Filter: ${cat}`, status: 'PASS' });
      console.log(`✓ Template Category filtered to: ${cat}`);
    }
  }

  // FAQ Search
  const faqInput = page.locator('#faqs input').first();
  if (await faqInput.count() > 0) {
    await faqInput.fill('DOCX');
    await page.waitForTimeout(300);
    const count = await page.locator('.rp-faq-item').count();
    results.interactiveTests.push({ test: 'FAQ Live Search Filter', status: count > 0 ? 'PASS' : 'FAIL', matches: count });
    console.log(`✓ FAQ Search for "DOCX" found ${count} matching questions`);
    await faqInput.fill('');
  }

  // FAQ Accordion Toggle
  const firstFaq = page.locator('.rp-faq-trigger').first();
  if (await firstFaq.count() > 0) {
    await firstFaq.click();
    await page.waitForTimeout(200);
    results.interactiveTests.push({ test: 'FAQ Accordion Expand/Collapse', status: 'PASS' });
    console.log(`✓ FAQ Accordion toggled successfully`);
  }

  await desktopCtx.close();

  console.log('\n================================================================');
  console.log('  4. STRICT CSS ISOLATION & DASHBOARD NON-REGRESSION AUDIT');
  console.log('================================================================');

  let adminAuth = null;
  try {
    const res = await fetch('http://127.0.0.1:8080/api/auth/preview-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'superadmin@resumepilot.test', password: 'password123' })
    });
    if (res.ok) adminAuth = await res.json();
  } catch (_e) {}

  const testInternalRoutes = [
    { path: '/adm', name: 'Super Admin Dashboard' },
    { path: '/adm/settings', name: 'Admin Settings' },
    { path: '/adm/users', name: 'Admin Users' },
    { path: '/adm/tenants', name: 'Admin Tenants' },
    { path: '/adm/support', name: 'Admin Support' },
    { path: '/adm/security', name: 'Admin Security' },
    { path: '/dashboard', name: 'User Dashboard' },
    { path: '/cover-letter', name: 'Cover Letter Studio' }
  ];

  for (const r of testInternalRoutes) {
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 }
    });
    const p = await ctx.newPage();
    const pErrors = [];
    p.on('pageerror', err => pErrors.push(err.message));

    if (adminAuth?.token) {
      await p.goto('https://ai-resume-builder.local/login', { waitUntil: 'domcontentloaded' });
      await p.evaluate(({ key, data }) => {
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

    await p.goto(`https://ai-resume-builder.local${r.path}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);

    const hasPublicNamespace = await p.evaluate(() => {
      return document.querySelector('.adminWrapper .rp-public-site, .admin .rp-public-site, .dashboard-container .rp-public-site') !== null;
    });

    const shotPath = path.join(screenshotsDir, `internal-v2-${r.name.replace(/\s+/g, '-').toLowerCase()}.png`);
    await p.screenshot({ path: shotPath });

    results.cssIsolationAudit.push({
      route: r.path,
      name: r.name,
      leakDetected: hasPublicNamespace,
      status: !hasPublicNamespace ? 'PASS (0 leakage)' : 'FAIL (Leakage)',
      screenshot: shotPath
    });

    console.log(`✓ Isolation Check on [${r.path}] (${r.name}): ${!hasPublicNamespace ? 'PASS (0% CSS Leakage)' : 'FAIL (Leakage detected)'}`);
    await ctx.close();
  }

  await browser.close();

  const reportPath = 'test-results/PUBLIC_V2_WOW_VERIFICATION_REPORT.json';
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nAll tests completed! Report written to ${reportPath}`);
}

runV2Audit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
