import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

async function runTransitionRegressionTest() {
  console.log('🚀 Starting Vite dev server for Preview -> Upgrade transition test...');
  const viteServer = await createServer({
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'error',
  });
  await viteServer.listen();
  const port = viteServer.config.server.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✓ Vite listening on ${baseUrl}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let capturedPageError = null;
  page.on('pageerror', (err) => {
    console.error('🔥 CAPTURED PAGE ERROR:', err.message);
    capturedPageError = err;
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('🖥️ BROWSER CONSOLE ERROR:', msg.text());
    }
  });

  try {
    console.log('1. Navigating to preview-upgrade-transition harness...');
    await page.goto(`${baseUrl}/template-lab/preview-upgrade-transition.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#resume-preview-title', { timeout: 10000 });

    // Step 1: Verify Initial Resume Preview modal
    console.log('2. Verifying Resume Preview is initially mounted and active...');
    const previewTitle = await page.locator('#resume-preview-title').textContent();
    assert.ok(previewTitle, 'Resume preview title must be present');
    console.log(`   ✓ Resume preview title: "${previewTitle}"`);

    const docxBtn = page.locator('button:has-text("Download Word (DOCX)"), button:has-text("Word")');
    assert.equal(await docxBtn.isVisible(), true, 'Word DOCX download button must be visible in preview');

    const pdfBtn = page.locator('button:has-text("Download PDF"), button:has-text("PDF")');
    assert.equal(await pdfBtn.isVisible(), true, 'PDF download button must be visible in preview');

    // Step 2: Trigger gated DOCX download
    console.log('3. Clicking "Download Word (DOCX)" from inside Resume Preview...');
    await docxBtn.first().click();

    // Give state machine a tick to unmount Preview and mount Upgrade popup
    await page.waitForTimeout(400);

    // Step 3: CRITICAL ASSERTION — Resume Preview must be COMPLETELY unmounted from DOM
    console.log('4. Verifying Resume Preview is completely closed and unmounted...');
    const previewTitleCount = await page.locator('#resume-preview-title').count();
    assert.equal(previewTitleCount, 0, 'CRITICAL: Resume Preview modal MUST be completely unmounted from DOM');

    const previewModalBackdropCount = await page.locator('.fixed.inset-0.z-\\[9999\\]').count();
    assert.equal(previewModalBackdropCount, 0, 'CRITICAL: Resume Preview overlay/backdrop must NOT remain in DOM');

    // Step 4: PRO CAREER PASS Upgrade popup must be topmost and visible
    console.log('5. Verifying PRO CAREER PASS upgrade popup is visible in foreground...');
    const upgradeTitle = page.locator('#upgrade-modal-title');
    assert.equal(await upgradeTitle.isVisible(), true, 'PRO CAREER PASS upgrade modal must be visible');
    const upgradeTitleText = await upgradeTitle.textContent();
    assert.ok(upgradeTitleText.includes('Your Resume Is Ready'), 'Upgrade modal title text matches expected');

    const marketingBadge = await page.locator('text=PRO CAREER PASS').first().isVisible();
    assert.equal(marketingBadge, true, 'PRO CAREER PASS marketing badge must be visible');

    // Verify feature title specifies Microsoft Word (.docx)
    const modalDesc = await page.locator('text=Microsoft Word (.docx)').first().isVisible();
    assert.equal(modalDesc, true, 'Upgrade modal correctly identified gated export type as Word (.docx)');

    // Step 5: Test interactivity of PRO CAREER PASS popup
    console.log('6. Verifying PRO CAREER PASS buttons are interactive and not covered by any overlay...');
    const upgradeCtaBtn = page.locator('button:has-text("Upgrade & Download")');
    assert.equal(await upgradeCtaBtn.isVisible(), true, 'Upgrade & Download CTA button must be visible');
    assert.equal(await upgradeCtaBtn.isEnabled(), true, 'Upgrade & Download CTA button must be enabled and clickable');

    // Click "Upgrade & Download" to transition to SubscriptionModal & Checkout
    console.log('7. Clicking "Upgrade & Download" to transition to Checkout...');
    await upgradeCtaBtn.click();
    await page.waitForTimeout(400);

    // Step 6: Verify PRO CAREER PASS closes and SubscriptionModal opens
    const upgradeModalCount = await page.locator('#upgrade-modal-title').count();
    assert.equal(upgradeModalCount, 0, 'Upgrade modal must close upon clicking upgrade CTA');

    const subModalTitle = page.locator('#subscription-modal-title');
    assert.equal(await subModalTitle.isVisible(), true, 'SubscriptionModal must be open in foreground');

    // Step 7: Transition to Step 2: "Continue to Checkout"
    console.log('8. Clicking "Continue to Checkout"...');
    const continueBtn = page.locator('button:has-text("Continue to Checkout")');
    assert.equal(await continueBtn.isVisible(), true, 'Continue to Checkout button must be visible');
    await continueBtn.click();
    await page.waitForTimeout(500);

    // Step 8: Verify Checkout mounts cleanly with zero Application View Error
    const appViewError = await page.locator('text=Application View Error').isVisible().catch(() => false);
    assert.equal(appViewError, false, 'Zero Application View Error must occur');

    const editPlanBtn = await page.locator('button:has-text("Edit Plan & Duration")').isVisible().catch(() => false);
    assert.equal(editPlanBtn, true, 'Checkout Step 2 mounted cleanly with Edit Plan button');
    console.log('   ✓ Checkout Step 2 mounted successfully!');

    // Step 9: Test Escape key dismiss behavior
    console.log('9. Testing Escape key dismiss behavior...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const subModalCount = await page.locator('#subscription-modal-title').count();
    assert.equal(subModalCount, 0, 'Modal dismissed cleanly via Escape key');

    // Step 10: Reopen Preview and test PDF gated download flow
    console.log('10. Testing reopening Resume Preview from editor button...');
    const reopenBtn = page.locator('#reopen-preview-btn');
    await reopenBtn.click();
    await page.waitForSelector('#resume-preview-title', { timeout: 5000 });
    assert.equal(await page.locator('#resume-preview-title').isVisible(), true, 'Resume Preview reopened cleanly');

    console.log('11. Clicking "Download PDF" from reopened Resume Preview...');
    const pdfBtnReopened = page.locator('button:has-text("Download PDF"), button:has-text("PDF")').first();
    await pdfBtnReopened.click();
    await page.waitForTimeout(400);

    // Assert: Preview unmounted, Upgrade modal opened for PDF
    assert.equal(await page.locator('#resume-preview-title').count(), 0, 'Resume preview unmounted on PDF gated click');
    assert.equal(await page.locator('#upgrade-modal-title').isVisible(), true, 'Upgrade modal opened for PDF gated click');
    const pdfFeatureMention = await page.locator('text=High-Quality Vector PDF').first().isVisible();
    assert.equal(pdfFeatureMention, true, 'Upgrade modal correctly reflects PDF download intent');

    // Dismiss with "Maybe Later"
    console.log('12. Clicking "Maybe Later" to dismiss upgrade popup...');
    await page.locator('button:has-text("Maybe Later")').click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#upgrade-modal-title').count(), 0, 'Upgrade modal closed cleanly via Maybe Later');

    if (capturedPageError) {
      throw new Error(`CRITICAL RUNTIME ERROR: ${capturedPageError.message}`);
    }

    console.log('🎉 REGRESSION TEST PASSED 100%: Resume Preview cleanly unmounts, PRO CAREER PASS opens top-level without competing overlays, and Checkout proceeds seamlessly!');
  } finally {
    await browser.close();
    await viteServer.close();
  }
}

runTransitionRegressionTest().catch((err) => {
  console.error('❌ REGRESSION TEST FAILED:', err);
  process.exit(1);
});
