/**
 * Authentication session hardening (C1 cross-cutting X-1 / X-2), verified in
 * the browser against the real backend.
 */
import { randomUUID } from 'node:crypto';
import { test, expect, ACCOUNTS } from './fixtures';

const ANONYMOUS = { cookies: [], origins: [] };

test.describe('stored sessions are never trusted without the backend', () => {
  test.use({ storageState: ANONYMOUS });

  test('a forged session without a token does not authenticate', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ime_dev_user', JSON.stringify({ uid: 'forged', email: 'forged@example.test', role: 'ADMIN' }));
    });
    await page.goto('/dashboard/cover-letters');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fcover-letters/);
    await expect(page.getByRole('button', { name: /^Account menu for/ })).toHaveCount(0);
  });

  test('a well-formed but unsigned token is rejected by the backend and cleared', async ({ page, guard }) => {
    guard.expectApiStatuses(401);
    const forgedPayload = Buffer.from(JSON.stringify({ uid: 'forged-admin', email: 'forged@example.test', role: 'SUPER_ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const forgedToken = `rptest.${forgedPayload}.${'0'.repeat(64)}`;
    await page.addInitScript((token) => {
      if (!sessionStorage.getItem('forged-once')) {
        sessionStorage.setItem('forged-once', '1');
        localStorage.setItem('ime_dev_user', JSON.stringify({ token, uid: 'forged-admin', role: 'SUPER_ADMIN' }));
      }
    }, forgedToken);
    const verification = page.waitForResponse((response) => response.url().endsWith('/api/users-data/profile'));
    await page.goto('/dashboard');
    expect((await verification).status()).toBe(401);
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
    expect(await page.evaluate(() => localStorage.getItem('ime_dev_user'))).toBeNull();
  });

  test('an absolute ?next= URL cannot redirect off-site after sign-in', async ({ page, baseURL }) => {
    await page.goto('/login?next=https%3A%2F%2Fevil.example%2Fsteal');
    await page.getByLabel('Email address').fill(ACCOUNTS.a.email);
    await page.locator('#password').fill(`e2e-${randomUUID()}`);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/dashboard');
    const landed = new URL(page.url());
    expect(landed.origin).toBe(new URL(baseURL ?? page.url()).origin);
    expect(landed.pathname).toBe('/dashboard');
  });
});

test('a real session renders the dashboard and sign-out clears every session key', async ({ page }) => {
  await page.goto('/dashboard');
  const accountMenu = page.getByRole('button', { name: /^Account menu for/ });
  await expect(accountMenu).toBeVisible();
  // Sign out after the dashboard finished loading, as a person would. (Signing
  // out mid-load lets the overview's remaining sequential requests go out
  // unauthenticated: recorded as audit finding OV-2, not masked here.)
  await page.waitForLoadState('networkidle');
  await accountMenu.click();
  await page.getByRole('menuitem', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/login/);
  const leftovers = await page.evaluate(() => ['ime_dev_user', 'token', 'auth_token'].filter((key) => localStorage.getItem(key) !== null));
  expect(leftovers).toEqual([]);
  await page.goto('/dashboard/cover-letters');
  await expect(page).toHaveURL(/\/login\?next=/);
});
