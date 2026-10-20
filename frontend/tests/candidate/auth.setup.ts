/**
 * Sign the two test identities in through the REAL registration form.
 *
 * With no Firebase configuration the form authenticates against
 * POST /api/auth/preview-login (non-production verifier) and then saves the
 * typed names through POST /api/users-data/profile. Both are asserted here, so a
 * broken auth or profile path fails the whole suite instead of being masked.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { test as setup, expect } from '@playwright/test';
import { ACCOUNTS, AUTH_DIR, storageStatePath, tokenFor, type AccountKey } from './fixtures';

fs.mkdirSync(AUTH_DIR, { recursive: true });

for (const key of Object.keys(ACCOUNTS) as AccountKey[]) {
  const account = ACCOUNTS[key];
  setup(`register and sign in through the form as ${account.email}`, async ({ page, request }) => {
    const [firstName, lastName] = account.name.split(' ');
    await page.goto('/login?next=%2Fdashboard');
    await page.getByRole('button', { name: 'Sign up free' }).click();
    await page.getByLabel('First name').fill(firstName ?? '');
    await page.getByLabel('Last name').fill(lastName ?? '');
    await page.getByLabel('Email').fill(account.email);
    // Preview identities perform no password check; a throw-away value is typed.
    await page.locator('#password').fill(`e2e-${randomUUID()}`);
    await page.getByRole('button', { name: 'Create account' }).click();

    await page.waitForURL('**/dashboard');
    await expect(page.locator('#main-content, main').first()).toBeVisible();
    await page.context().storageState({ path: storageStatePath(key) });

    // The registration names reached MariaDB through the real profile contract.
    const profile = await request.get('/api/users-data/profile', { headers: { Authorization: `Bearer ${tokenFor(key)}` } });
    expect(profile.status()).toBe(200);
    const body = (await profile.json()) as { user?: { firstname?: string; lastname?: string; email?: string } };
    expect(body.user?.email).toBe(account.email);
    expect(body.user?.firstname).toBe(firstName);
    expect(body.user?.lastname).toBe(lastName);
  });
}
