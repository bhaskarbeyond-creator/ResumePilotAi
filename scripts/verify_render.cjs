const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1800 } });

  console.log('Navigating to login...');
  await page.goto('https://ime365.local/login', { waitUntil: 'networkidle' });

  console.log('Clicking Candidate Demo...');
  await page.click('button:has-text("Candidate Demo")');
  await page.waitForTimeout(2000);

  console.log('Navigating to /export/Cv34/res_1792228937289/en ...');
  await page.goto('https://ime365.local/export/Cv34/res_1792228937289/en', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);

  const exportPath = 'C:/Users/mbhas/.gemini/antigravity-ide/brain/ecd8f8c1-83e8-4c24-8fb3-9ac4a3e782ad/cv34_export_authenticated.png';
  await page.screenshot({ path: exportPath, fullPage: true });
  console.log('Export screenshot saved to:', exportPath);

  console.log('Navigating to /dashboard/resumes ...');
  await page.goto('https://ime365.local/dashboard/resumes', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const previewBtn = page.locator('button:has-text("Preview")').first();
  if (await previewBtn.isVisible()) {
    console.log('Opening preview modal...');
    await previewBtn.click();
    await page.waitForTimeout(2500);

    const modalPath = 'C:/Users/mbhas/.gemini/antigravity-ide/brain/ecd8f8c1-83e8-4c24-8fb3-9ac4a3e782ad/resumes_preview_modal.png';
    await page.screenshot({ path: modalPath });
    console.log('Preview modal screenshot saved to:', modalPath);
  } else {
    console.log('Preview button not found on /dashboard/resumes');
  }

  await browser.close();
  console.log('Done verification!');
})().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
