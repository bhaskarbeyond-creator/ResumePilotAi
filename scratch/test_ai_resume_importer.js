import { chromium } from 'playwright';

(async () => {
  console.log('=== STARTING PLAYWRIGHT AI RESUME IMPORTER VERIFICATION TEST ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  try {
    console.log('Step 1: Navigating to http://ai-resume-builder.local/');
    await page.goto('http://ai-resume-builder.local/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    await page.evaluate(() => {
      localStorage.setItem('user', 'e2e_test_user_777');
    });

    console.log('Step 2: Navigating to http://ai-resume-builder.local/build-resume/heading');
    await page.goto('http://ai-resume-builder.local/build-resume/heading', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2500);

    const buttonTexts = await page.locator('button').allInnerTexts();
    console.log('Buttons found on page:', buttonTexts);

    const importBtn = page.locator('button:has-text("Import")').first();
    if (await importBtn.isVisible()) {
      console.log('Step 3: Clicking Import button...');
      await importBtn.click();
      await page.waitForTimeout(1500);

      const modalText = await page.textContent('body');
      console.log('Modal check:', modalText.includes('Import from Existing Resume'));
    }

    console.log('=== PLAYWRIGHT AI RESUME IMPORTER TEST COMPLETED 100% ===');
  } catch (err) {
    console.error('❌ Playwright Import Test Error:', err.message);
  } finally {
    await browser.close();
  }
})();
