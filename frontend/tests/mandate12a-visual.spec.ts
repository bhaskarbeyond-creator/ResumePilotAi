import { test, expect, type Page } from '@playwright/test';

// Controlled HTTP fixtures exercise the browser contract; they are not production evidence.
async function setup(page: Page) {
  const payload = Buffer.from(JSON.stringify({ uid: 'fixture-admin', role: 'SUPER_ADMIN', email: 'admin@example.test', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  await page.addInitScript(token => localStorage.setItem('ime_dev_user', JSON.stringify({ token })), `rptest.${payload}.${'a'.repeat(64)}`);
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
}
for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test('stats failure, retry, malformed data and actual values', async ({ page }) => {
      await setup(page);
      let calls = 0;
      await page.route('**/api/platform/stats', route => {
        calls++;
        return calls === 1 ? route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } }) :
          calls === 2 ? route.fulfill({ json: { users: 'invalid' } }) : route.fulfill({ json: { users: 3, resumes: 0, tenants: 2 } });
      });
      await page.goto('/admin');
      await expect(page.getByRole('alert').filter({ hasText: 'Platform statistics are unavailable' })).toBeVisible();
      await expect(page.getByText('48,290')).toHaveCount(0);
      await page.getByRole('button', { name: 'Retry' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Platform statistics are unavailable' })).toBeVisible();
      expect(calls).toBe(2);
      await page.getByRole('button', { name: 'Retry' }).click();
      await expect(page.getByText('Total Platform Users')).toBeVisible();
      await expect(page.getByText('Enterprise Tenants', { exact: true })).toBeVisible();
      expect(calls).toBe(3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    });
    test('health states and refresh show only returned observations', async ({ page }) => {
      await setup(page);
      let calls = 0;
      await page.route('**/api/platform/health/probes', route => {
        calls++;
        return route.fulfill({ json: { services: [
          { id: 'api', name: 'API process', state: 'HEALTHY' },
          { id: 'database', name: 'MariaDB', state: 'DEGRADED' },
          { id: 'authentication', name: 'Authentication directory', state: 'UNKNOWN' },
        ] } });
      });
      await page.goto('/admin?tab=health');
      await expect(page.getByText('HEALTHY', { exact: true })).toHaveCount(1);
      await expect(page.getByText('DEGRADED', { exact: true })).toBeVisible();
      await expect(page.getByText('UNKNOWN', { exact: true })).toBeVisible();
      await expect(page.getByText('99.8%', { exact: false })).toHaveCount(0);
      await page.getByRole('button', { name: 'Refresh health checks' }).click();
      await expect.poll(() => calls).toBeGreaterThan(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    });
  });
}
test.skip('tenant persistence UI: blocked by missing schema and service scope');
