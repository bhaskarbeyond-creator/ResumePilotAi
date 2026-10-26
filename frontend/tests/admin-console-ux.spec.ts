/**
 * Admin console: five device classes, keyboard operability, colour contrast, visual
 * regression and Core Web Vitals (REC-019, REC-020, INV-1).
 *
 * ## Why this file exists separately from `accessibility.spec.ts`
 *
 * That suite scans five surfaces at three widths and treats the admin console as one
 * page. It cannot catch the defects that actually occurred here, because they are
 * *per tab*: a disabled tab whose only explanation was `title` (unreachable by keyboard
 * and screen reader), a 36px dismiss button, a table that pushed the page sideways at
 * 320px. This file therefore drives the console as the operator does — by keys, at every
 * supported width, with the tab strip in the accessibility tree.
 *
 * ## Device classes covered
 *
 * | class | viewport | why |
 * |---|---|---|
 * | small phone | 320×568 | the narrowest width the product supports; the class where a table overflow becomes a horizontal page scroll |
 * | large phone | 480×800 | the common Android width |
 * | tablet | 768×1024 | the first class where the grid can use two columns |
 * | laptop | 1024×768 | the class where the tab strip must not wrap into two rows |
 * | desktop | 1441×900 | the widest supported class |
 *
 * ## Running
 *
 *   cd frontend && npx playwright test tests/admin-console-ux.spec.ts
 *
 * Requires a browser download (`npx playwright install chromium`) and a serving app.
 * The 2026-10 remediation environment could not download browsers — see
 * `developer-review/admin/TEST-EVIDENCE.md` §"Tiers that exist but could not execute".
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ADMIN_USER = {
  uid: 'demo-admin-1',
  email: 'admin@ime365.com',
  displayName: 'Sarah Administrator',
  role: 'ADMIN',
};

const DEVICE_CLASSES = [
  { name: '320-small-phone', width: 320, height: 568 },
  { name: '480-large-phone', width: 480, height: 800 },
  { name: '768-tablet', width: 768, height: 1024 },
  { name: '1024-laptop', width: 1024, height: 768 },
  { name: '1441-desktop', width: 1441, height: 900 },
];

/** Sign in through the dev-user seam the rest of the suite uses. */
async function authenticate(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('ime_dev_user', JSON.stringify(user));
  }, ADMIN_USER);
}

/** Open the console and wait for the tab list to exist. */
async function openConsole(page: Page) {
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tablist').waitFor({ state: 'visible', timeout: 30_000 });
}

test.describe('admin console · device classes', () => {
  for (const device of DEVICE_CLASSES) {
    test.describe(device.name, () => {
      test.use({ viewport: { width: device.width, height: device.height } });

      test('no horizontal page scroll and every tab is reachable by keyboard', async ({ page }) => {
        await authenticate(page);
        await openConsole(page);

        // The whole page must fit the viewport width. A dense table is allowed to scroll
        // inside its own container; the document itself is not.
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth, 'the document must not scroll horizontally').toBeLessThanOrEqual(overflow.clientWidth + 1);

        // Roving focus: focus the first tab, then walk the strip with the arrow key and
        // confirm focus moves and stays inside the tab list.
        const tabs = page.getByRole('tab');
        const count = await tabs.count();
        expect(count, 'the console must render at least one tab').toBeGreaterThan(0);
        await tabs.first().focus();
        if (count > 1) {
          await page.keyboard.press('ArrowRight');
          const focusedRole = await page.evaluate(() => document.activeElement?.getAttribute('role'));
          expect(focusedRole).toBe('tab');
        }
        await page.keyboard.press('End');
        await expect(tabs.last()).toBeFocused();
        await page.keyboard.press('Home');
        await expect(tabs.first()).toBeFocused();
      });

      test('axe-core finds no serious or critical violation', async ({ page }) => {
        await authenticate(page);
        await openConsole(page);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        const blocking = results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''));
        expect(
          blocking.map((violation) => `${violation.id} (${violation.nodes.length})`),
          'serious/critical axe violations',
        ).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.getAttribute('lang'))).toBeTruthy();
      });

      test('visual regression baseline', async ({ page }) => {
        await authenticate(page);
        await openConsole(page);
        // Tolerance is configured globally (1%) because subpixel font rendering differs
        // between machines; the baseline exists to catch layout shifts, not font AA.
        await expect(page).toHaveScreenshot(`admin-console-${device.name}.png`, { fullPage: false });
      });
    });
  }
});

test.describe('admin console · interaction states', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('a disabled tab explains itself in its accessible name, not only in a tooltip', async ({ page }) => {
    await authenticate(page);
    await openConsole(page);
    const disabled = page.locator('[role="tab"][aria-disabled="true"]');
    if ((await disabled.count()) === 0) test.skip(true, 'this role can open every tab; nothing to assert');
    const label = await disabled.first().getAttribute('aria-label');
    const text = await disabled.first().innerText();
    expect(`${label ?? ''} ${text}`).toMatch(/permission|super-admin|requires/i);
  });

  test('the configuration census states where each value came from', async ({ page }) => {
    await authenticate(page);
    await openConsole(page);
    const tab = page.getByRole('tab', { name: /configuration/i });
    if ((await tab.count()) === 0) test.skip(true, 'the caller has no configuration capability');
    await tab.click();
    await expect(page.getByRole('heading', { name: /configuration registry/i })).toBeVisible();
    await expect(page.getByText(/Declared default|Saved here|Deployment environment|Code/).first()).toBeVisible();
  });

  test('Core Web Vitals stay inside the product budget', async ({ page }) => {
    await authenticate(page);
    await openConsole(page);

    const vitals = await page.evaluate(async () => {
      const lcp = await new Promise<number>((resolve) => {
        let value = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) value = Math.max(value, (entry as PerformanceEntry & { startTime: number }).startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => resolve(value), 2500);
      });
      const cls = await new Promise<number>((resolve) => {
        let value = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
            if (!entry.hadRecentInput) value += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => resolve(value), 1000);
      });
      return { lcp, cls };
    });

    // Product budgets: LCP < 2.5s, CLS < 0.1 (INP needs real interaction, so it is
    // measured by the synthetic journey in tests/engine-*.spec.ts, not here).
    expect(vitals.lcp, 'LCP budget').toBeLessThan(2500);
    expect(vitals.cls, 'CLS budget').toBeLessThan(0.1);
  });
});
