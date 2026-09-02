import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';

function checkHttp(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 304);
    }).on('error', () => resolve(false));
  });
}

test('CROSS-APPLICATION DOWNLOAD + SHARE FLOW AUDIT (End-to-End)', async (t) => {
  const PORT = 5176;
  const baseUrl = `http://localhost:${PORT}/template-lab/cross-app-audit.html`;

  let viteServer = null;
  const isUp = await checkHttp(baseUrl);
  if (!isUp) {
    viteServer = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', String(PORT)], {
      cwd: process.cwd(),
      stdio: 'pipe',
      shell: true,
    });

    let ready = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await checkHttp(baseUrl)) {
        ready = true;
        break;
      }
    }
    assert.ok(ready, 'Vite dev server must be available');
  }

  const browser = await chromium.launch({ headless: true });

  t.after(async () => {
    await browser.close();
    if (viteServer) {
      viteServer.kill();
    }
  });

  const viewports = [
    { name: 'Desktop Large', width: 1440, height: 900 },
    { name: 'Tablet iPad', width: 768, height: 1024 },
    { name: 'Mobile iPhone', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    await t.test(`Audit on Viewport: ${vp.name} (${vp.width}x${vp.height})`, async (sub) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      const page = await context.newPage();

      // Intercept subscription status for reliable deterministic testing
      await page.route('**/api/subscription-status', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            currency: 'USD',
            currencySymbol: '$',
            monthlyPrice: 19.99,
            yearlyPrice: 99.99,
            marketingBadge: 'PRO CAREER PASS'
          })
        });
      });

      // Collect console errors
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-lab-state="ready"]', { timeout: 10000 });

      // TEST A: Free user -> Card & Dropdown -> Download DOCX visible, clicking opens PRO CAREER PASS
      await sub.test('TEST A: Free user -> Card & Dropdown -> DOCX visible, clicking opens PRO CAREER PASS', async () => {
        await page.click('#role-free-btn');
        await page.waitForTimeout(50);

        // Verify DOCX button IS rendered on the card for Free user (reverted visibility)
        const cardDocxCount = await page.locator('#card-download-docx-btn').count();
        assert.equal(cardDocxCount, 1, 'Free user must see the DOCX download option on the card');

        // Verify DOCX option IS in dropdown menu for Free user
        await page.click('#card-dropdown-btn');
        await page.waitForTimeout(100);
        const dropdownDocxCount = await page.locator('#card-dropdown-menu button:has-text("DOCX")').count();
        assert.equal(dropdownDocxCount, 1, 'Free user must see DOCX option in dropdown menu');
        await page.click('#card-dropdown-btn'); // close dropdown
        await page.waitForTimeout(100);

        // Click Download Word (DOCX) directly on the card
        await page.click('#card-download-docx-btn');
        await page.waitForTimeout(250);

        // Verify PRO CAREER PASS opens visibly in foreground (zero file download)
        const upgradeTitle = page.locator('#upgrade-modal-title');
        assert.equal(await upgradeTitle.isVisible(), true, 'Upgrade modal title must be visible');
        const badgeVisible = await page.locator('text=PRO CAREER PASS').first().isVisible();
        assert.equal(badgeVisible, true, 'PRO CAREER PASS marketing badge must be visible');

        // Verify downloadType is docx
        const exportType = await page.textContent('#state-downloadType');
        assert.equal(exportType, 'docx');

        // Dismiss modal via Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      });

      // TEST B: Free user -> My Resumes Card -> click Download PDF -> PRO CAREER PASS opens visibly
      await sub.test('TEST B: Free user -> Card -> Download PDF -> PRO CAREER PASS opens', async () => {
        await page.click('#role-free-btn');
        await page.click('#card-download-pdf-btn');
        await page.waitForTimeout(250);

        const upgradeTitle = page.locator('#upgrade-modal-title');
        assert.equal(await upgradeTitle.isVisible(), true, 'PRO CAREER PASS modal must open for PDF');

        // Verify downloadType in state debugger is pdf
        const exportType = await page.textContent('#state-downloadType');
        assert.equal(exportType, 'pdf');

        // Close modal via close button
        await page.click('button[aria-label="Close modal"]');
        await page.waitForTimeout(150);

        const closed = !(await upgradeTitle.isVisible());
        assert.equal(closed, true, 'Upgrade modal must dismiss on Close button');
      });

      // TEST C: Premium user -> My Resumes Card -> DOCX button visible -> authorized download proceeds
      await sub.test('TEST C: Premium user -> Card -> Download DOCX visible & authorized without upgrade modal', async () => {
        await page.click('#role-premium-btn');
        await page.waitForTimeout(50);

        // Verify DOCX button IS rendered for Premium user
        const cardDocxCount = await page.locator('#card-download-docx-btn').count();
        assert.equal(cardDocxCount, 1, 'Premium user MUST have option to download DOCX on the card');

        const initialSuccess = Number(await page.textContent('#state-downloadSuccess'));
        await page.click('#card-download-docx-btn');
        await page.waitForTimeout(100);

        const nextSuccess = Number(await page.textContent('#state-downloadSuccess'));
        assert.equal(nextSuccess, initialSuccess + 1, 'Download success count must increment');

        const upgradeModalVisible = await page.locator('#upgrade-modal-title').isVisible().catch(() => false);
        assert.equal(upgradeModalVisible, false, 'Upgrade modal must NOT appear for Premium user');
      });

      // TEST D: Free user -> Full Size Preview -> Share, DOCX & PDF all visible; clicking opens upgrade modal
      await sub.test('TEST D: Free user -> Resume Preview -> Share, DOCX, PDF visible & click opens upgrade modal', async () => {
        await page.click('#role-free-btn');

        // Open full size preview via dropdown menu
        await page.click('#card-dropdown-btn');
        await page.waitForTimeout(100);
        await page.click('text=Full Size Preview');
        
        // Verify all 3 action buttons are visible inside PreviewModal header
        const previewDocx = page.locator('[aria-labelledby="resume-preview-title"] button:has-text("Word"), [aria-labelledby="resume-preview-title"] button:has-text("DOCX")').first();
        await previewDocx.waitFor({ state: 'visible', timeout: 5000 });
        assert.equal(await previewDocx.isVisible(), true, 'DOCX button must be visible in PreviewModal');

        const previewShare = page.locator('[aria-labelledby="resume-preview-title"] button:has-text("Share")').first();
        assert.equal(await previewShare.isVisible(), true, 'Share button must be visible in PreviewModal');

        const previewPdf = page.locator('[aria-labelledby="resume-preview-title"] button:has-text("PDF")').first();
        assert.equal(await previewPdf.isVisible(), true, 'PDF button must be visible in PreviewModal');

        // Clicking DOCX download inside preview modal opens upgrade modal
        await previewDocx.click();
        await page.waitForTimeout(250);

        // Preview modal must be unmounted
        const previewStillVisible = await page.locator('#resume-preview-title').isVisible().catch(() => false);
        assert.equal(previewStillVisible, false, 'Preview modal must unmount');

        // Upgrade modal must be open and in foreground
        const upgradeVisible = await page.locator('#upgrade-modal-title').isVisible();
        assert.equal(upgradeVisible, true, 'Upgrade modal must be visible in foreground');

        // Dismiss modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      });

      // TEST E1: Free user -> Share Resume -> PRO CAREER PASS opens, NO share link or share modal
      await sub.test('TEST E1: Free user -> Share Resume -> PRO CAREER PASS opens, NO share link', async () => {
        await page.click('#role-free-btn');
        await page.click('#card-share-btn');
        await page.waitForTimeout(250);

        // Verify PRO CAREER PASS opens
        const upgradeTitle = page.locator('#upgrade-modal-title');
        assert.equal(await upgradeTitle.isVisible(), true, 'PRO CAREER PASS must open when Free user clicks Share');

        // Verify downloadType is share
        const exportType = await page.textContent('#state-downloadType');
        assert.equal(exportType, 'share');

        // Verify ShareModal did NOT open
        const shareModalCount = await page.locator('#share-modal-title').count();
        assert.equal(shareModalCount, 0, 'Share modal must NOT open for free user');

        // Close modal via Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      });

      // TEST E2: Premium user -> Share Resume -> ShareModal opens with canonical /shared/ URL
      await sub.test('TEST E2: Premium user -> Share Resume -> ShareModal opens with canonical /shared/ URL', async () => {
        await page.click('#role-premium-btn');
        await page.click('#card-share-btn');
        await page.waitForTimeout(300);

        // Share modal should be visible
        const shareTitle = await page.locator('#share-modal-title').isVisible();
        assert.equal(shareTitle, true, 'Share modal must open for premium user');

        // Click Link tab
        await page.click('button:has-text("Link")');
        await page.waitForTimeout(100);

        // Check shareable URL input
        const shareUrlInput = page.locator('input[aria-label="Shareable resume link"]');
        const shareUrlValue = await shareUrlInput.inputValue();
        assert.match(shareUrlValue, /\/shared\/resume-audit-101$/, 'Share URL must use canonical /shared/:id format');

        // Verify Copy button exists and works
        const copyBtn = page.locator('button.copy-button');
        assert.equal(await copyBtn.isVisible(), true);
        await copyBtn.click();
        await page.waitForTimeout(150);
        const isCopied = await page.locator('button.copy-button.copied').isVisible();
        assert.equal(isCopied, true, 'Copy button must provide copied feedback');

        // Verify Open button exists with link to canonical URL
        const openBtn = page.locator('a[title="Open public resume in a new tab"]');
        assert.equal(await openBtn.isVisible(), true);
        const href = await openBtn.getAttribute('href');
        assert.equal(href, shareUrlValue);

        // Close share modal via ESC key
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);

        const shareModalClosed = !(await page.locator('#share-modal-title').isVisible().catch(() => false));
        assert.equal(shareModalClosed, true, 'Share modal must close on Escape');
      });

      // TEST G1: Free user with allowFreePdfDownload toggle -> PDF download authorized
      await sub.test('TEST G1: Free user with allowFreePdfDownload ON -> PDF authorized, OFF -> PRO CAREER PASS', async () => {
        await page.click('#role-free-btn');
        const initialSuccess = parseInt(await page.textContent('#state-downloadSuccess'), 10);

        // 1. When toggle is ON
        await page.check('#toggle-free-pdf');
        await page.waitForTimeout(50);
        await page.click('#card-download-pdf-btn');
        await page.waitForTimeout(100);

        // Success count increments without opening upgrade modal
        const afterOnSuccess = parseInt(await page.textContent('#state-downloadSuccess'), 10);
        assert.equal(afterOnSuccess, initialSuccess + 1, 'PDF download must succeed when allowFreePdfDownload is ON');
        assert.equal(await page.locator('#upgrade-modal-title').isVisible().catch(() => false), false, 'PRO CAREER PASS must NOT open when allowFreePdfDownload is ON');

        // 2. When toggle is turned back OFF
        await page.uncheck('#toggle-free-pdf');
        await page.waitForTimeout(50);
        await page.click('#card-download-pdf-btn');
        await page.waitForTimeout(200);

        // Upgrade modal opens
        assert.equal(await page.locator('#upgrade-modal-title').isVisible(), true, 'PRO CAREER PASS must open when allowFreePdfDownload is OFF');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      });

      // TEST G2: Free user with allowFreeDocxDownload toggle -> DOCX download authorized
      await sub.test('TEST G2: Free user with allowFreeDocxDownload ON -> DOCX authorized, OFF -> PRO CAREER PASS', async () => {
        await page.click('#role-free-btn');
        const initialSuccess = parseInt(await page.textContent('#state-downloadSuccess'), 10);

        // 1. When toggle is ON
        await page.check('#toggle-free-docx');
        await page.waitForTimeout(50);
        await page.click('#card-download-docx-btn');
        await page.waitForTimeout(100);

        // Success count increments without opening upgrade modal
        const afterOnSuccess = parseInt(await page.textContent('#state-downloadSuccess'), 10);
        assert.equal(afterOnSuccess, initialSuccess + 1, 'DOCX download must succeed when allowFreeDocxDownload is ON');
        assert.equal(await page.locator('#upgrade-modal-title').isVisible().catch(() => false), false, 'PRO CAREER PASS must NOT open when allowFreeDocxDownload is ON');

        // 2. When toggle is turned back OFF
        await page.uncheck('#toggle-free-docx');
        await page.waitForTimeout(50);
        await page.click('#card-download-docx-btn');
        await page.waitForTimeout(200);

        // Upgrade modal opens
        assert.equal(await page.locator('#upgrade-modal-title').isVisible(), true, 'PRO CAREER PASS must open when allowFreeDocxDownload is OFF');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      });

      // TEST G3: Free user with allowFreeShareLink toggle -> Share authorized
      await sub.test('TEST G3: Free user with allowFreeShareLink ON -> Share authorized, OFF -> PRO CAREER PASS', async () => {
        await page.click('#role-free-btn');

        // 1. When toggle is ON
        await page.check('#toggle-free-share');
        await page.waitForTimeout(50);
        await page.click('#card-share-btn');
        await page.waitForTimeout(250);

        // Share modal opens
        assert.equal(await page.locator('#share-modal-title').isVisible(), true, 'Share modal must open when allowFreeShareLink is ON');
        assert.equal(await page.locator('#upgrade-modal-title').isVisible().catch(() => false), false, 'PRO CAREER PASS must NOT open when allowFreeShareLink is ON');

        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);

        // 2. When toggle is turned back OFF
        await page.uncheck('#toggle-free-share');
        await page.waitForTimeout(50);
        await page.click('#card-share-btn');
        await page.waitForTimeout(200);

        // Upgrade modal opens
        assert.equal(await page.locator('#upgrade-modal-title').isVisible(), true, 'PRO CAREER PASS must open when allowFreeShareLink is OFF');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      });

      // TEST H: Rapid double-clicks do not create duplicate modals or broken state
      await sub.test('TEST H: Rapid double-clicks on download/share preserve stable state', async () => {
        await page.click('#role-free-btn');

        // Rapidly click Download PDF 3 times
        await page.click('#card-download-pdf-btn');
        await page.click('#card-download-pdf-btn', { timeout: 50 }).catch(() => {});
        await page.click('#card-download-pdf-btn', { timeout: 50 }).catch(() => {});
        await page.waitForTimeout(250);

        // Only ONE upgrade modal dialog must exist
        const upgradeModals = await page.locator('#upgrade-modal-title').count();
        assert.equal(upgradeModals, 1, 'Exactly one upgrade modal must be mounted');

        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      });

      // TEST I: Modal dismissal via ESC / Backdrop restores expected page state
      await sub.test('TEST I: Backdrop dismissal restores clean page state with zero residue', async () => {
        await page.click('#role-premium-btn');
        await page.click('#card-share-btn');
        await page.waitForTimeout(250);
        assert.equal(await page.locator('#share-modal-title').isVisible(), true);

        // Click outside on the modal overlay backdrop
        await page.click('.share-modal-overlay', { position: { x: 10, y: 10 } });
        await page.waitForTimeout(150);

        const shareOpen = await page.locator('#share-modal-title').isVisible().catch(() => false);
        assert.equal(shareOpen, false, 'Share modal must close when clicking backdrop');

        const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
        assert.equal(bodyOverflow, 'unset', 'Body overflow must be restored to unset');
      });

      // TEST J: Zero "Application View Error" across all audited flows
      await sub.test('TEST J: Zero "Application View Error" detected', async () => {
        const appViewError = await page.locator('text=Application View Error').isVisible().catch(() => false);
        assert.equal(appViewError, false, 'Zero Application View Error must occur across all viewports and flows');
      });

      await context.close();
    });
  }
});
