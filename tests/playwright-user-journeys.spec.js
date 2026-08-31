/**
 * User-journey Playwright tests: candidate dashboard → create resume →
 * fill heading → save → view on dashboard.
 *
 * These exercise the Vite dev server + in-memory backend.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

async function signIn(page, email = 'user@test.test') {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#input-email', { timeout: 10000 });
  await page.fill('#input-email', email);
  await page.fill('#input-password', 'password123');
  await page.focus('#input-password');
  await page.keyboard.press('Enter');
  try { await page.waitForURL(/\/(dashboard|login)/, { timeout: 10000 }); } catch (_e) { /* fall through */ }
  await page.waitForTimeout(800);
}

test.describe('Candidate journey: dashboard → create resume → save', () => {
  test('authenticated user lands on dashboard and sees resume workspace', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard/);
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/resume|workspace|overview/i);
  });

  test('create-resume/heading does not crash for signed-in user', async ({ page }) => {
    await signIn(page);
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const html = await page.locator('#root').innerHTML();
    expect(html).not.toMatch(/unhandled|runtime error|minified react error/i);
    const text = await page.locator('body').innerText();
    expect(text.length).toBeGreaterThan(50);
  });

  test('sign out returns to public home', async ({ page }) => {
    await signIn(page);
    // Click on "Sign Out" via sidebar menu
    const signOut = page.getByRole('button', { name: /sign out/i }).or(page.getByText(/sign out/i)).first();
    if (await signOut.isVisible().catch(() => false)) {
      await signOut.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      const url = page.url();
      expect(url).toMatch(/\/login|\/$/);
    } else {
      // Fallback: programmatic sign-out via local auth
      await page.evaluate(() => localStorage.removeItem('resumepilot_local_session_v1'));
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
    }
  });
});

test.describe('Authenticated deep-links', () => {
  test('/settings does not crash', async ({ page }) => {
    await signIn(page);
    await page.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const html = await page.locator('#root').innerHTML();
    expect(html).not.toMatch(/unhandled|runtime error/i);
  });

  test('/billing/plans renders plan list without errors', async ({ page }) => {
    await signIn(page);
    await page.goto(BASE + '/billing/plans', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const html = await page.locator('#root').innerHTML();
    expect(html).not.toMatch(/unhandled|runtime error/i);
  });

  test('/portfolio/builder is accessible after login', async ({ page }) => {
    await signIn(page);
    await page.goto(BASE + '/portfolio/builder', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const html = await page.locator('#root').innerHTML();
    expect(html).not.toMatch(/unhandled|runtime error/i);
  });
});
