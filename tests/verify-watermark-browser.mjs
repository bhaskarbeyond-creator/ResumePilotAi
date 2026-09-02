import { chromium } from 'playwright';

async function testWatermark() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
  console.log('Navigating to https://ai-resume-builder.local/shared/res_1788362641034 ...');
  await page.goto('https://ai-resume-builder.local/shared/res_1788362641034', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const watermarkLocator = page.locator('[data-testid="resume-watermark-overlay"]');
  const count = await watermarkLocator.count();
  console.log('Watermark elements count:', count);
  if (count > 0) {
    const isVisible = await watermarkLocator.first().isVisible();
    const text = await watermarkLocator.first().innerText();
    console.log('Watermark visible:', isVisible);
    console.log('Watermark text:', text);
  } else {
    console.log('Watermark not found!');
  }

  await page.screenshot({ path: 'test-results/browser-verification/user-shared-resume-watermarked.png', fullPage: true });
  console.log('Screenshot saved to test-results/browser-verification/user-shared-resume-watermarked.png');
  await browser.close();
}

testWatermark().catch(err => {
  console.error(err);
  process.exit(1);
});
