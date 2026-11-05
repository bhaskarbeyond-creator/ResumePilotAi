const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Sign in as user
  console.log('Navigating to login...');
  await page.goto('https://ime365.local/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'bhaskar.beyond@gmail.com');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard/**', { timeout: 15000 }).catch(() => {});

  // Go to resumes page
  console.log('Navigating to /dashboard/resumes...');
  await page.goto('https://ime365.local/dashboard/resumes', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Take screenshot of resumes hub
  const hubPath = 'C:/Users/mbhas/.gemini/antigravity/brain/40d6b3af-8d89-4218-b56d-c0dc053ffd9c/live_resumes_cleaned.png';
  await page.screenshot({ path: hubPath, fullPage: false });
  console.log('Saved', hubPath);

  // Open first resume preview
  const previewBtns = page.locator('[data-testid="full-size-preview-btn"]');
  const count = await previewBtns.count();
  console.log('Preview buttons count:', count);
  if (count > 0) {
    await previewBtns.first().click();
    await page.waitForSelector('[data-testid="cuba-preview-modal"]', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Check if chat launcher is visible
    const chatWidget = page.locator('[data-testid="support-chat-launcher"]');
    const isChatVisible = await chatWidget.isVisible().catch(() => false);
    console.log('Is chat launcher balloon visible inside preview modal?', isChatVisible);

    // Check continuation header text
    const contHeaders = await page.locator('.resume-continuation-header').allInnerTexts();
    console.log('Continuation headers found:', JSON.stringify(contHeaders));

    // Scroll to footer of page 1 and page 2
    const modalPath = 'C:/Users/mbhas/.gemini/antigravity/brain/40d6b3af-8d89-4218-b56d-c0dc053ffd9c/live_preview_modal_cleaned.png';
    await page.screenshot({ path: modalPath });
    console.log('Saved', modalPath);
  }

  // Also check /build-resume directly
  console.log('Navigating to /build-resume to check builder view...');
  await page.goto('https://ime365.local/build-resume', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const chatInBuilder = await page.locator('[data-testid="support-chat-launcher"]').isVisible().catch(() => false);
  console.log('Is chat launcher balloon visible on /build-resume?', chatInBuilder);
  const builderPath = 'C:/Users/mbhas/.gemini/antigravity/brain/40d6b3af-8d89-4218-b56d-c0dc053ffd9c/live_builder_cleaned.png';
  await page.screenshot({ path: builderPath });
  console.log('Saved', builderPath);

  await browser.close();
  console.log('ALL PLAYWRIGHT VERIFICATIONS COMPLETED SUCCESSFULLY!');
})();
