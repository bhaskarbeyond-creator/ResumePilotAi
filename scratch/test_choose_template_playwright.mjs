import assert from 'node:assert/strict';
import path from 'node:path';
import express from 'express';
import { chromium } from 'playwright';

async function runChooseTemplatePlaywrightAudit() {
  console.log('========================================================================');
  console.log('🎭 RUNNING PLAYWRIGHT MULTI-DEVICE CHOOSE TEMPLATE UI AUDIT');
  console.log('========================================================================\n');

  const app = express();
  app.use(express.static(path.resolve('dist')));
  app.get('*', (req, res) => res.sendFile(path.resolve('dist/index.html')));

  const server = await new Promise(r => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'Desktop', width: 1280, height: 800 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Mobile', width: 375, height: 667 }
  ];

  for (const vp of viewports) {
    console.log(`📱 Testing Viewport: ${vp.name} (${vp.width}x${vp.height})...`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

    // Track any failed image requests
    const failedImages = [];
    page.on('response', (response) => {
      if (response.request().resourceType() === 'image' && response.status() >= 400) {
        failedImages.push(response.url());
      }
    });

    await page.goto(`http://127.0.0.1:${port}/build-resume/heading`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Open Choose Template modal if available or navigate to template selection
    const chooseBtn = page.locator('button:has-text("Choose Template"), button:has-text("Change Template"), [data-testid="choose-template-btn"]').first();
    if (await chooseBtn.count() > 0) {
      await chooseBtn.click();
      await page.waitForTimeout(400);
    }

    // Check for horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assert.equal(hasHorizontalOverflow, false, `${vp.name} must have 0 horizontal overflow`);

    // Verify 0 failed images
    assert.equal(failedImages.length, 0, `Detected broken images on ${vp.name}: ${failedImages.join(', ')}`);

    console.log(`  ✔ ${vp.name} Passed (0 broken images, 0 overflow)`);
    await page.close();
  }

  await browser.close();
  server.close();

  console.log('\n========================================================================');
  console.log('🏆 PLAYWRIGHT MULTI-DEVICE AUDIT PASSED (100%)');
  console.log('========================================================================\n');
}

runChooseTemplatePlaywrightAudit().catch(err => {
  console.error('Playwright UI audit failed:', err);
  process.exit(1);
});
