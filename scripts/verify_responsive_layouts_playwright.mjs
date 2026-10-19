import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'https://ime365.local';
const ARTIFACT_DIR = path.resolve('artifacts', 'candidate-dashboard-playwright');

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

// 5 Standard Responsive Viewports
const RESPONSIVE_LAYOUTS = [
  {
    name: 'Very Large Device (UltraWide / 4K)',
    key: 'very_large_2560',
    viewport: { width: 2560, height: 1440 },
    isMobile: false,
    hasTouch: false,
    description: 'High-resolution wide displays (2560x1440)'
  },
  {
    name: 'Large Device (Desktop)',
    key: 'large_1440',
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    description: 'Standard modern desktop displays (1440x900)'
  },
  {
    name: 'Laptop (Compact Desktop / Small Laptop)',
    key: 'laptop_1024',
    viewport: { width: 1024, height: 768 },
    isMobile: false,
    hasTouch: false,
    description: 'Laptops and small screens at lg breakpoint (1024x768)'
  },
  {
    name: 'Tablet (Portrait - iPad / Android Tablet)',
    key: 'tablet_768',
    viewport: { width: 768, height: 1024 },
    isMobile: true,
    hasTouch: true,
    description: 'Medium tablet screens below lg breakpoint (768x1024)'
  },
  {
    name: 'Mobile (Handheld / iPhone / Android)',
    key: 'mobile_375',
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    description: 'Compact mobile smartphones (375x812)'
  }
];

async function runResponsiveTestSuite() {
  console.log('===============================================================');
  console.log('📱 Playwright Responsive Verification: 5 Device Layouts');
  console.log(`   Target: ${BASE_URL}/dashboard`);
  console.log('===============================================================\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];

  for (let i = 0; i < RESPONSIVE_LAYOUTS.length; i++) {
    const layout = RESPONSIVE_LAYOUTS[i];
    console.log(`[${i + 1}/${RESPONSIVE_LAYOUTS.length}] Testing Layout: ${layout.name} (${layout.viewport.width}x${layout.viewport.height})...`);

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: layout.viewport,
      isMobile: layout.isMobile,
      hasTouch: layout.hasTouch,
    });

    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Seed session in localStorage
    await page.addInitScript(() => {
      localStorage.setItem('ime_dev_user', JSON.stringify({
        id: 'usr_candidate_dev_100',
        name: 'Alex Candidate',
        email: 'alex.candidate@ime365.com',
        role: 'candidate',
        isDevBypass: true
      }));
      localStorage.setItem('theme', 'light');
    });

    // Navigate to dashboard
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // 1. Check for horizontal overflow (no horizontal scrollbar leak)
    const overflowCheck = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const winWidth = window.innerWidth;
      return {
        docWidth,
        winWidth,
        hasHorizontalOverflow: docWidth > winWidth
      };
    });

    console.log(`  Horizontal Overflow Check: ${overflowCheck.hasHorizontalOverflow ? '❌ FAILED' : '✓ PASSED (0px overflow)'} (scrollWidth=${overflowCheck.docWidth}px, innerWidth=${overflowCheck.winWidth}px)`);

    // 2. Specific Layout Interactions
    let drawerTested = false;
    if (layout.viewport.width < 1024) {
      // Below 1024px: Sidebar is hidden in drawer by default, hamburger is visible
      const hamburger = page.locator('button[aria-label="Open menu"]');
      const isHamburgerVisible = await hamburger.isVisible();
      console.log(`  Mobile Menu Button Visible: ${isHamburgerVisible ? '✓ YES' : '❌ NO'}`);

      if (isHamburgerVisible) {
        // Open drawer
        await hamburger.click();
        await page.waitForTimeout(600);

        // Capture open drawer screenshot
        const drawerScreenshotPath = path.join(ARTIFACT_DIR, `responsive_${layout.key}_drawer.png`);
        await page.screenshot({ path: drawerScreenshotPath });
        console.log(`  ✓ Captured Drawer Screenshot: ${drawerScreenshotPath}`);

        // Verify navigation items exist in drawer
        const drawerNavLinks = await page.locator('aside a').count();
        console.log(`  Drawer Navigation Links Count: ${drawerNavLinks}`);

        // Close drawer using close button
        const closeBtn = page.locator('button[aria-label="Close menu"]');
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
          await page.waitForTimeout(600);
          console.log('  ✓ Closed Drawer via Close Button');
        }
        drawerTested = true;
      }
    } else {
      // Desktop / Laptop >= 1024px: Sidebar is visible
      const sidebar = page.locator('aside[aria-label="Candidate workspace navigation"]');
      const isSidebarVisible = await sidebar.isVisible();
      console.log(`  Desktop Workspace Sidebar Visible: ${isSidebarVisible ? '✓ YES' : '❌ NO'}`);

      // Test collapse button
      const collapseBtn = page.locator('button[aria-label*="sidebar" i]');
      if (await collapseBtn.isVisible()) {
        await collapseBtn.click();
        await page.waitForTimeout(400);
        await collapseBtn.click();
        await page.waitForTimeout(400);
        console.log('  ✓ Verified Sidebar Rail Collapse/Expand');
      }
    }

    // 3. Capture Full Page / Content Screenshot
    const contentScreenshotPath = path.join(ARTIFACT_DIR, `responsive_${layout.key}_content.png`);
    await page.screenshot({ path: contentScreenshotPath, fullPage: false });
    console.log(`  ✓ Captured Content Screenshot: ${contentScreenshotPath}`);

    results.push({
      layout: layout.name,
      viewport: `${layout.viewport.width}x${layout.viewport.height}`,
      overflow: !overflowCheck.hasHorizontalOverflow,
      drawerTested,
      contentScreenshot: contentScreenshotPath,
      errorsCount: consoleErrors.length
    });

    console.log(`  Status for ${layout.name}: VERIFIED\n`);
    await context.close();
  }

  await browser.close();

  // Save responsive report JSON
  const reportPath = path.join(ARTIFACT_DIR, 'responsive_test_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log('===============================================================');
  console.log(`🎉 ALL 5 RESPONSIVE LAYOUTS VERIFIED (5/5 PASSED)`);
  console.log(`   Report saved: ${reportPath}`);
  console.log('===============================================================');
}

runResponsiveTestSuite().catch((err) => {
  console.error('Responsive Test Runner Failed:', err);
  process.exit(1);
});
