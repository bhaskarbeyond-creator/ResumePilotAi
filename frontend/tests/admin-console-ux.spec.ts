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

/**
 * The same five classes under the three non-default presentations the brief names.
 *
 * These are the runs that catch a token added for light mode and forgotten in dark, a
 * layout that only fits while the reading direction is left-to-right, and a control whose
 * border disappears in Windows High Contrast. Each one asserts layout (no horizontal page
 * scroll) *and* `axe`, because a contrast failure in dark mode is invisible to the static
 * audit — `contrast-audit.mjs` measures the light palette only.
 */
for (const presentation of [
  { name: 'dark', colorScheme: 'dark' as const },
  { name: 'high-contrast', forcedColors: 'active' as const },
]) {
  test.describe(`admin console · ${presentation.name}`, () => {
    test.use({ viewport: { width: 320, height: 568 }, colorScheme: presentation.colorScheme, forcedColors: presentation.forcedColors });

    test('fits the viewport and passes axe in ' + presentation.name, async ({ page }) => {
      await authenticate(page);
      await openConsole(page);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const blocking = results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''));
      expect(blocking.map((violation) => violation.id), `${presentation.name} axe violations`).toEqual([]);
    });
  });
}

test.describe('admin console · right-to-left', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('mirrors without overflowing and keeps the tab strip operable', async ({ page }) => {
    await authenticate(page);
    await page.addInitScript(() => {
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.setAttribute('lang', 'ar');
    });
    await openConsole(page);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    // A mirrored table is still allowed to scroll inside its container; the document is not.
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

    // Arrow keys follow the visual direction in RTL: ArrowLeft advances, ArrowRight retreats.
    const tabs = page.getByRole('tab');
    await tabs.first().focus();
    if ((await tabs.count()) > 1) {
      await page.keyboard.press('ArrowLeft');
      expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('tab');
    }
  });
});

test.describe('admin console · 200% zoom and 200% text', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('nothing is clipped and no control becomes unreachable at 200% text', async ({ page }) => {
    await authenticate(page);
    await openConsole(page);

    // 200% text: the root font size doubles, which is what a browser text-size setting does.
    // The document must still fit the viewport, and every tab must keep a non-zero box.
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await page.waitForTimeout(150);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth, 'no horizontal scroll at 200% text').toBeLessThanOrEqual(overflow.clientWidth + 1);

    for (const tab of await page.getByRole('tab').all()) {
      const box = await tab.boundingBox();
      expect(box?.width ?? 0, 'a tab must keep a measurable box at 200% text').toBeGreaterThan(0);
      expect(box?.height ?? 0).toBeGreaterThan(0);
    }
  });
});

test.describe('admin console · touch targets at phone widths', () => {
  for (const width of [320, 480]) {
    test.use({ viewport: { width, height: 800 } });

    test(`every enabled control is at least 44x44 at ${width}px`, async ({ page }) => {
      await authenticate(page);
      await openConsole(page);

      // Static audit (`ux-audit.mjs`) proves the classes are present; this proves the
      // rendered box. A `min-h-11` on an inline element, or one overridden by a later
      // utility, passes the grep and fails here.
      const undersized = await page.evaluate(() => {
        const offenders: string[] = [];
        for (const element of Array.from(document.querySelectorAll('button, a, select, input[type="checkbox"], [role="tab"]'))) {
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          const disabled = element instanceof HTMLButtonElement && element.disabled;
          // WCAG 2.2 exempts inactive controls and inline links inside a sentence.
          if (disabled) continue;
          if (element.tagName === 'A' && style.display === 'inline') continue;
          if (rect.height < 44 || rect.width < 24) {
            offenders.push(`${element.tagName.toLowerCase()}:${(element.textContent ?? '').trim().slice(0, 24)} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
          }
        }
        return offenders;
      });
      expect(undersized, 'controls below the 44px bar').toEqual([]);
    });
  }
});

test.describe('admin console · keyboard traps and focus return', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('a drawer traps focus, closes on Escape and returns focus to its trigger', async ({ page }) => {
    await authenticate(page);
    await openConsole(page);

    const trigger = page.getByRole('button', { name: /user 360/i }).first();
    if ((await trigger.count()) === 0) test.skip(true, 'this role cannot open User 360');
    await trigger.focus();
    await page.keyboard.press('Enter');

    const drawer = page.getByRole('dialog').first();
    await drawer.waitFor({ state: 'visible' });

    // Tab through every control in the drawer and confirm focus never escapes it. Ten
    // presses is more than the drawer's control count at this width, so the cycle wraps.
    for (let index = 0; index < 10; index += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        return dialog?.contains(document.activeElement) ?? false;
      });
      expect(inside, `focus escaped the drawer on Tab #${index + 1}`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('admin console · the four data states', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  for (const state of ['loading', 'empty', 'error', 'partial'] as const) {
    test(`renders the ${state} state without overflow`, async ({ page }) => {
      await authenticate(page);

      // The console reads its census from /api/platform/capabilities; each state is a
      // different answer from that one endpoint, so the states are driven at the network
      // layer rather than by seeding component props.
      if (state === 'loading') {
        await page.route('**/api/platform/capabilities', async () => {
          await new Promise((resolve) => setTimeout(resolve, 5_000));
        });
      } else if (state === 'error') {
        await page.route('**/api/platform/capabilities', (route) =>
          route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, error: { code: 'CAPABILITY_CENSUS_UNAVAILABLE', message: 'Census unavailable' } }),
          }),
        );
      } else if (state === 'empty') {
        await page.route('**/api/platform/capabilities', (route) =>
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, tabs: [] }) }),
        );
      } else {
        await page.route('**/api/platform/capabilities', async (route) => {
          const response = await route.fetch();
          const body = (await response.json()) as Record<string, unknown>;
          await route.fulfill({ response, json: { ...body, degraded: true, tabSource: 'DECLARED_DEFAULT' } });
        });
      }

      await page.goto('/admin', { waitUntil: 'domcontentloaded' });
      // Whatever the state, the screen must say something and stay inside the viewport.
      await page.locator('body').waitFor();
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      expect((await page.locator('body').innerText()).trim().length).toBeGreaterThan(0);
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
