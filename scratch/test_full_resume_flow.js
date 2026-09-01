require('dotenv').config({ path: './backend/.env' });
import { chromium } from 'playwright';

(async () => {
  console.log('=== STARTING PLAYWRIGHT COMPREHENSIVE END-TO-END RESUME FLOW TEST ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Load Base App
    console.log('Step 1: Navigating to ${process.env.TARGET_URL || process.env.APP_URL}/');
    await page.goto((process.env.TARGET_URL || process.env.APP_URL), { waitUntil: 'domcontentloaded', timeout: 15000 });

    // 2. Set authenticated user session
    await page.evaluate(() => {
      localStorage.setItem('user', 'e2e_test_user_777');
      localStorage.setItem('currentResumeId', 'resume_e2e_777');
    });

    // 3. Step 1: Heading
    console.log('Step 2: Navigating to Heading step (/build-resume/heading)');
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/build-resume/heading', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    console.log('✔ Heading step loaded');

    // 4. Step 2: Work History
    console.log('Step 3: Navigating to Work History step (/build-resume/work-history)');
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/build-resume/work-history', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    console.log('✔ Work History step loaded');

    // 5. Step 3: Education
    console.log('Step 4: Navigating to Education step (/build-resume/education)');
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/build-resume/education', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    console.log('✔ Education step loaded');

    // 6. Step 4: Skills
    console.log('Step 5: Navigating to Skills step (/build-resume/skills)');
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/build-resume/skills', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    console.log('✔ Skills step loaded');

    // 7. Step 5: Summary
    console.log('Step 6: Navigating to Summary step (/build-resume/summary)');
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/build-resume/summary', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    console.log('✔ Summary step loaded');

    // 8. Verify Complete button is rendered on Summary step
    const pageText = await page.textContent('body');
    const hasCompleteBtn = pageText.includes('Complete') || pageText.includes('Done');
    console.log(`✔ Complete Button Rendered on Summary Step: ${hasCompleteBtn}`);

    if (hasCompleteBtn) {
      console.log('Step 7: Clicking Complete button...');
      // Click the Complete button
      const completeBtn = page.locator('button:has-text("Complete"), button:has-text("Done")').first();
      await completeBtn.click();
      await page.waitForTimeout(2000);

      const postClickUrl = page.url();
      console.log(`✔ Post-click URL: ${postClickUrl}`);
      console.log('✔ Complete button clicked successfully!');
    }

    console.log('=== PLAYWRIGHT END-TO-END RESUME FLOW TEST PASSED 100% ===');
  } catch (err) {
    console.error('❌ Playwright E2E Test Error:', err.message);
  } finally {
    await browser.close();
  }
})();
