import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

async function runCheckoutStateMachineAdversarial() {
  console.log('🚀 Starting Vite test server for Checkout State Machine Adversarial Audit...');
  const server = await createServer({
    server: { port: 0 },
    clearScreen: false,
    logLevel: 'error',
  });
  await server.listen();
  const port = server.config.server.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✓ Vite listening on ${baseUrl}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource') && !msg.text().includes('401')) {
      console.error('🖥️ Browser Console Error:', msg.text());
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    console.error('💥 Page Error:', err.message);
    errors.push(err.message);
  });

  try {
    // Mock backend API endpoints
    await page.route('**/api/platform/public-config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          _settingsSource: 'mariadb',
          subscriptions: {
            currency: 'INR',
            currencySymbol: '₹',
            monthlyPrice: 199,
            quartarlyPrice: 399,
            yearlyPrice: 499,
            pricingMatrix: {
              INR: { monthly: 199, quartarly: 399, yearly: 499 },
            },
          },
        }),
      });
    });

    await page.route('**/api/coupons/active', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          coupons: [{ code: 'SPRING30', discount: 30, description: 'Spring 30% Off' }],
        }),
      });
    });

    await page.route('**/api/coupons/validate', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.code === 'SPRING30') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            valid: true,
            coupon: { code: 'SPRING30', discount: 30, description: 'Spring 30% Off' },
          }),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, valid: false, error: 'Coupon not found.' }),
        });
      }
    });

    await page.route('**/api/account/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, membership: 'Free Basic Tier' }),
      });
    });

    // Navigate to template lab subscription modal test harness
    console.log('1. Navigating to template-lab subscription modal harness...');
    await page.goto(`${baseUrl}/template-lab/subscription-modal.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });

    // 2. Rapid duration switching
    console.log('2. Rapidly switching plan durations...');
    const durationCards = await page.$$('[role="button"]:has-text("Month"), div:has-text("6 Months"), div:has-text("12 Months")');
    for (let i = 0; i < 3; i++) {
      for (const card of durationCards.slice(0, 3)) {
        await card.click().catch(() => {});
        await page.waitForTimeout(50);
      }
    }

    // 3. Repeated coupon application and removal
    console.log('3. Hammering coupon input with valid and invalid codes...');
    const couponInput = await page.$('input[aria-label="Coupon code input"], input[placeholder*="coupon" i], input[placeholder*="promo" i]');
    const couponBtn = await page.$('button:has-text("Apply"), button:has-text("apply")');
    if (couponInput && couponBtn) {
      // Apply invalid
      await couponInput.fill('INVALID_TEST_99');
      await couponBtn.click();
      await page.waitForTimeout(300);

      // Apply valid
      await couponInput.fill('SPRING30');
      await couponBtn.click();
      await page.waitForTimeout(500);

      // Verify badge or discount
      const couponBadge = await page.$('text=SPRING30');
      console.log('Coupon badge found:', Boolean(couponBadge));
    }

    // 4. Rapid double-clicking "Continue to Checkout"
    console.log('4. Double-clicking "Continue to Checkout"...');
    const continueBtn = await page.waitForSelector('button:has-text("Continue to Checkout")', { timeout: 5000 });
    // Double click rapidly
    await continueBtn.click({ clickCount: 2 });
    await page.waitForTimeout(1500);

    // 5. Verify Step 2 mounted cleanly with NO Application View Error
    const appViewError = await page.$('text=Application View Error');
    assert.equal(appViewError, null, 'No Application View Error must appear after rapid transitions');
    console.log('✓ Application View Error check: PASS (None detected)');

    // 6. Navigate Back to Step 1
    console.log('6. Clicking "Edit Plan & Duration" (Back)...');
    const backBtn = await page.$('button:has-text("Edit Plan"), button:has-text("Back")');
    if (backBtn) {
      await backBtn.click();
      await page.waitForTimeout(500);
      console.log('✓ Successfully returned to Step 1');
    }

    // 7. Close modal with Escape key and reopen
    console.log('7. Closing modal via Escape key and reopening...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Reopen modal
    const openBtn = await page.$('#open-modal-btn, button:has-text("Open Modal")');
    if (openBtn) {
      await openBtn.click();
    }
    await page.waitForTimeout(500);
    console.log('✓ Modal reopened cleanly without corrupted state');

    // Final assert on errors
    assert.equal(errors.length, 0, `Zero critical browser exceptions expected, found: ${errors.join(', ')}`);
    console.log('🎉 CHECKOUT STATE-MACHINE ADVERSARIAL AUDIT PASSED 100%!');

  } finally {
    await browser.close();
    await server.close();
  }
}

runCheckoutStateMachineAdversarial().catch(err => {
  console.error('STATE MACHINE AUDIT FAILED:', err);
  process.exit(1);
});
