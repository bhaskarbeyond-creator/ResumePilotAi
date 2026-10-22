import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
// This suite is explicitly opt-in outside hosted CI. Never silently certify an absent reference.
if (process.env.CI && !process.env.LEGACY_FRONTEND_DIR) throw new Error('Hosted comparison requires the prepared immutable historical frontend');
if (process.env.LEGACY_FRONTEND_DIR) {
  for (const [width, height] of [[320,568],[390,844],[430,932],[768,1024],[1366,768],[1440,900],[1920,1080]]) {
    test(`historical/current matched route and screenshot ${width}x${height}`, async ({ page, request }) => {
      const response = await request.post('/api/auth/preview-login', { data: { email: 'superadmin@resumepilot.test', password: 'ephemeral-e2e-only' } });
      expect(response.ok()).toBe(true);
      const session = await response.json();
      const profile = await request.get('/api/users-data/profile', { headers: { Authorization: `Bearer ${session.token}` } });
      expect(profile.ok()).toBe(true);
      await page.addInitScript(value => localStorage.setItem('ime_dev_user', JSON.stringify(value)), session);
      await page.setViewportSize({ width, height });
      const observations = [];
      for (const [name, origin] of [['historical', 'http://127.0.0.1:4001'], ['current', 'http://127.0.0.1:4000']]) {
        await page.goto(`${origin}/admin?tab=ai-settings&subtab=providers`);
        await expect(page.getByRole('button', { name: 'Save All Changes', exact: true })).toBeVisible();
        const headers = { Authorization: `Bearer ${session.token}` };
        const before = await (await request.get('/api/admin/ai-settings', { headers })).json();
        const saved = page.waitForResponse(response => response.url().endsWith('/admin/ai-settings') && response.request().method() === 'POST');
        await page.getByRole('button', { name: 'Save All Changes', exact: true }).click();
        expect((await saved).ok()).toBe(true);
        const after = await (await request.get('/api/admin/ai-settings', { headers })).json();
        expect(after.revision).toBeGreaterThan(before.revision);
        for (const field of ['provider', 'temperature', 'maxTokens']) expect(after.settings[field]).toEqual(before.settings[field]);
        await page.reload();
        await expect(page.getByRole('button', { name: 'Save All Changes', exact: true })).toBeVisible();
        await page.screenshot({ path: test.info().outputPath(`${name}-${width}x${height}.png`), fullPage: true });
        await page.getByRole('button', { name: 'Configure Provider', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
        await page.screenshot({ path: test.info().outputPath(`${name}-configure-${width}x${height}.png`), fullPage: true });
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        observations.push({ persistenceVerified: true, configureDialogVerified: true, source: name, width, height, documentWidth: await page.evaluate(() => document.documentElement.scrollWidth), viewportWidth: width, saveControlVisible: true });
        await page.goto(`${origin}/adm?tab=ai-settings&subtab=metrics`);
        await expect(page).toHaveURL(/\/admin\?tab=ai-settings&subtab=metrics/);
        await page.goBack();
        await expect(page).toHaveURL(/subtab=providers/);
        await page.goForward();
        await expect(page).toHaveURL(/subtab=metrics/);
      }
      console.log(`::notice title=Historical UI comparison::${JSON.stringify({ width, height, observations, pixelEqualityAsserted: false })}`);
      await writeFile(test.info().outputPath('comparison.json'), JSON.stringify({ historicalCommit: '2abbbe4401efd1945e2749127605bb7f80afe941', backend: 'shared current disposable MariaDB/backend and signed test identity', dependencies: 'shared current locked frontend dependencies', pixelEqualityAsserted: false, observations }, null, 2));
    });
  }
}
