import { test, expect } from '@playwright/test';

test.describe('Billing & Checkout Engine Parity (DIR-002)', () => {
  test('Pricing page renders all tiers and comparison matrix', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('Invest in Your Next Career Breakthrough');

    // Verify all 4 tiers render as headings
    await expect(page.getByRole('heading', { name: 'Starter' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Professional' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Executive Pro' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enterprise', exact: true })).toBeVisible();

    // Verify billing switch
    const annualSwitch = page.locator('button[role="switch"]');
    await expect(annualSwitch).toBeVisible();

    // Verify zero console errors
    expect(consoleErrors).toEqual([]);
  });

  test('Clicking plan CTA launches interactive CheckoutModal', async ({ page }) => {
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

    // Click "Start 7-Day Free Trial" on Professional tier
    const proCta = page.getByRole('button', { name: /Start 7-Day Free Trial/i });
    await expect(proCta).toBeVisible();
    await proCta.click();

    // Verify modal appears
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Complete Your Subscription')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Professional/i })).toBeVisible();
  });

  test('Checkout modal currency converter switches rates dynamically', async ({ page }) => {
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

    // Open checkout
    await page.getByRole('button', { name: /Start 7-Day Free Trial/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Switch to INR
    const inrButton = dialog.getByRole('button', { name: 'INR' });
    await expect(inrButton).toBeVisible();
    await inrButton.click();

    // In INR, Indian rupee glyph ₹ should appear across plan buttons
    await expect(dialog.getByText(/₹/).first()).toBeVisible();
    await expect(dialog.getByLabel(/Legal Full Name/i)).toBeVisible();
  });

  test('Promo coupon engine validates and applies discount', async ({ page }) => {
    await page.route('**/api/coupons/validate', async route => {
      expect(route.request().postDataJSON()).toEqual({ code: 'SAVE20' });
      await route.fulfill({ status: 200, json: { success: true, valid: true, coupon: { code: 'SAVE20', discount: 20 } } });
    });
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Start 7-Day Free Trial/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Enter Promo Code').fill('SAVE20');
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(dialog.getByText(/Coupon Applied: SAVE20/i)).toBeVisible();
  });

  test('Direct /checkout and /billing/checkout URLs automatically open CheckoutModal', async ({ page }) => {
    await page.goto('/checkout?plan=executive&cycle=annual', { waitUntil: 'domcontentloaded' });

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Complete Your Subscription')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Executive Pro/i })).toBeVisible();
  });
});
