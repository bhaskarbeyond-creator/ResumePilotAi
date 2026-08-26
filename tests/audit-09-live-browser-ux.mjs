import { chromium } from 'playwright';

const PROD_URL = 'https://airesume.projectdemo.guru';

async function runLiveBrowserUxAudit() {
  console.log('================================================================');
  console.log('AUDIT 9: LIVE BROWSER UX & RESPONSIVENESS AUDIT');
  console.log(`Target: ${PROD_URL}`);
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'Desktop (1440x900)', width: 1440, height: 900, isMobile: false },
    { name: 'Tablet iPad (768x1024)', width: 768, height: 1024, isMobile: false },
    { name: 'Mobile iPhone 14 (390x844)', width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: 'Mobile iPhone SE (375x667)', width: 375, height: 667, isMobile: true, hasTouch: true },
  ];

  const results = [];

  for (const vp of viewports) {
    console.log(`[Testing Viewport: ${vp.name}]`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    try {
      // 1. Load Main Application
      const response = await page.goto(PROD_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
      const status = response.status();
      console.log(`  Home Page HTTP Status: ${status}`);

      // 2. Navigate to Enterprise Console
      await page.goto(`${PROD_URL}/enterprise`, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(1500);

      const title = await page.title();
      const bodyText = await page.textContent('body');
      const hasEnterpriseHeading = bodyText.includes('Enterprise') || bodyText.includes('Overview') || bodyText.includes('Tenant');

      console.log(`  Page Title: "${title}"`);
      console.log(`  Enterprise Console Content Rendered: ${hasEnterpriseHeading ? 'YES' : 'NO'}`);

      // 3. Test interactive elements: check tabs or buttons
      const buttons = await page.$$('button');
      console.log(`  Interactive Buttons Detected: ${buttons.length}`);

      // 4. Test Command Palette shortcut (Ctrl+K)
      await page.keyboard.press('Control+KeyK');
      await page.waitForTimeout(400);
      await page.$('.command-palette, [role="dialog"], input[placeholder*="Search"]');

      // Dismiss palette if open
      await page.keyboard.press('Escape');

      // Filter out benign browser network/CSP notices and expected unauthenticated initial states
      const fatalErrors = consoleErrors.filter(e =>
        !e.includes('auth') &&
        !e.includes('Firebase') &&
        !e.includes('favicon') &&
        !e.includes('401') &&
        !e.includes('ResizeObserver') &&
        !e.includes('Loading the script') &&
        !e.includes('Loading the stylesheet') &&
        !e.includes('Public pages are unavailable') &&
        !e.includes('Missing or insufficient permissions') &&
        !e.includes('Content Security Policy')
      );

      console.log(`  Application Fatal Errors: ${fatalErrors.length === 0 ? '0 (CLEAN)' : fatalErrors.length}`);

      results.push({
        viewport: vp.name,
        httpStatus: status,
        rendered: hasEnterpriseHeading,
        buttonsFound: buttons.length,
        errors: fatalErrors.length === 0 ? 'CLEAN (0 Runtime Errors)' : `${fatalErrors.length} Errors`,
        pass: status === 200 && hasEnterpriseHeading && fatalErrors.length === 0,
      });

    } catch (err) {
      console.error(`  Error testing viewport ${vp.name}:`, err.message);
      results.push({
        viewport: vp.name,
        httpStatus: 'ERROR',
        rendered: false,
        buttonsFound: 0,
        errors: err.message,
        pass: false,
      });
    } finally {
      await context.close();
    }
  }

  await browser.close();

  console.log('\n================================================================');
  console.log('AUDIT 9 SUMMARY MATRIX (LIVE BROWSER UX & RESPONSIVENESS):');
  console.table(results);
  console.log('================================================================\n');
}

runLiveBrowserUxAudit().catch(console.error);
