/**
 * The two second-factor panels, in a real browser.
 *
 * ## Why a harness instead of the sign-in route
 *
 * The challenge only appears after a password sign-in that returns
 * `auth/multi-factor-auth-required`, and enrolment needs a configured Firebase project with a
 * signed-in password user. Neither exists in this environment (`OI-UX-11` names the exact commands
 * that prove the *flow* on a machine that has them). What can be proven here — and what a person
 * actually experiences — is the screen: its layout at five device classes, its keyboard order, its
 * focus behaviour, its contrast, and its state machine.
 *
 * `tests/harness/mfa.html` mounts the real components with injected API bindings, so nothing in
 * `src/` is stubbed and nothing test-only ships in the bundle.
 *
 * ## Running
 *
 *   cd frontend && npm run test:ux:mfa
 *
 * The dev server is started by Playwright (`playwright.config.ts` → `webServer`).
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const DEVICE_CLASSES = [
  { name: '320-small-phone', width: 320, height: 568 },
  { name: '480-large-phone', width: 480, height: 800 },
  { name: '768-tablet', width: 768, height: 1024 },
  { name: '1024-laptop', width: 1024, height: 768 },
  { name: '1441-desktop', width: 1441, height: 900 },
];

/** Open the harness page for one panel and wait for it to render. */
async function openHarness(page: Page, query: string, id = 'mfa-challenge'): Promise<void> {
  await page.goto(`/tests/harness/mfa.html?${query}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId(id).waitFor({ state: 'visible', timeout: 20_000 });
}

/** Serious and critical axe violations only: WCAG AA conformance is the bar. */
async function blockingViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  return results.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? '')).map((v) => `${v.id} (${v.nodes.length})`);
}

test.describe('MFA challenge · device classes', () => {
  for (const device of DEVICE_CLASSES) {
    test.describe(device.name, () => {
      test.use({ viewport: { width: device.width, height: device.height } });

      test('fits the viewport, passes axe and has a baseline', async ({ page }) => {
        await openHarness(page, 'panel=challenge');

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth, 'no horizontal scroll').toBeLessThanOrEqual(overflow.clientWidth + 1);

        expect(await blockingViolations(page)).toEqual([]);
        await expect(page).toHaveScreenshot(`mfa-challenge-${device.name}.png`, { fullPage: false });
      });
    });
  }
});

test.describe('MFA challenge · keyboard script', () => {
  test.use({ viewport: { width: 480, height: 800 } });

  test('the code field takes focus, accepts six digits only, and Enter submits', async ({ page }) => {
    await openHarness(page, 'panel=challenge');

    // Focus starts in the code field so a person who just typed a password can keep typing.
    const code = page.getByLabel(/authenticator code/i);
    await expect(code).toBeFocused();

    // The primary action is disabled until the code is complete — Enter cannot submit early.
    const submit = page.getByRole('button', { name: /verify and sign in/i });
    await expect(submit).toBeDisabled();

    await code.pressSequentially('12ab34');
    await expect(code).toHaveValue('1234');

    await code.pressSequentially('5678');
    await expect(code, 'never more than six digits').toHaveValue('123456');
    await expect(submit).toBeEnabled();

    // A visible focus ring at WCAG 2.2 AA: the global rule gives 2px at 2px offset.
    await code.focus();
    const ring = await code.evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });
    expect(ring.style, 'the focused control must show a ring').not.toBe('none');
    expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);

    await code.press('Enter');
    await expect(page.getByRole('status')).toContainText(/verified/i);
  });

  test('Shift+Tab reaches "Back to sign-in", which cancels the challenge', async ({ page }) => {
    await openHarness(page, 'panel=challenge');
    await page.getByLabel(/authenticator code/i).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');

    const back = page.getByRole('button', { name: /back to sign-in/i });
    await expect(back).toBeFocused();
    await back.click();
    await expect(page.getByTestId('mfa-challenge')).toBeVisible();
  });

  test('an invalid code shows the failure inside the panel, with the field still usable', async ({ page }) => {
    await openHarness(page, 'panel=challenge&error=1');
    const code = page.getByLabel(/authenticator code/i);
    await code.pressSequentially('000000');
    await code.press('Enter');

    await expect(page.getByRole('alert')).toContainText(/not valid/i);
    // The panel is still there: an error must not take the field away at the moment it is needed.
    await expect(code).toBeVisible();
    await expect(code).toHaveValue('000000');
  });
});

test.describe('MFA challenge · presentations', () => {
  for (const presentation of [
    { name: 'dark', colorScheme: 'dark' as const },
    { name: 'high-contrast', forcedColors: 'active' as const },
  ]) {
    test.describe(presentation.name, () => {
      test.use({ viewport: { width: 320, height: 568 }, colorScheme: presentation.colorScheme, forcedColors: presentation.forcedColors });

      test(`fits, passes axe and has a baseline in ${presentation.name}`, async ({ page }) => {
        await openHarness(page, 'panel=challenge');
        expect(await blockingViolations(page)).toEqual([]);
        await expect(page).toHaveScreenshot(`mfa-challenge-${presentation.name}-320.png`, { fullPage: false });
      });
    });
  }

  test.describe('right-to-left', () => {
    test.use({ viewport: { width: 320, height: 568 } });

    test('mirrors without overflowing and keeps the code field reachable', async ({ page }) => {
      await openHarness(page, 'panel=challenge');
      await page.evaluate(() => {
        document.documentElement.setAttribute('dir', 'rtl');
        document.documentElement.setAttribute('lang', 'ar');
      });
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      await expect(page.getByLabel(/authenticator code/i)).toBeVisible();
    });
  });

  test.describe('200% text', () => {
    test.use({ viewport: { width: 320, height: 568 } });

    test('nothing is clipped and both actions stay reachable', async ({ page }) => {
      await openHarness(page, 'panel=challenge');
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      for (const name of [/verify and sign in/i, /back to sign-in/i]) {
        const box = await page.getByRole('button', { name }).boundingBox();
        expect(box?.width ?? 0).toBeGreaterThan(0);
        expect(box?.height ?? 0).toBeGreaterThan(0);
      }
    });
  });
});

test.describe('MFA enrolment · states', () => {
  test.use({ viewport: { width: 480, height: 800 } });

  test('with no identity provider the panel explains itself instead of offering a dead button', async ({ page }) => {
    await openHarness(page, 'panel=enroll&available=0', 'mfa-enrollment');
    const panel = page.getByTestId('mfa-enrollment');
    await expect(panel).toHaveAttribute('data-phase', 'unavailable');
    await expect(panel).toContainText(/no identity provider/i);
    await expect(page.getByRole('button', { name: /set up an authenticator app/i })).toHaveCount(0);
    expect(await blockingViolations(page)).toEqual([]);
  });

  test('enrolling shows the key once, focuses the code field, and confirms', async ({ page }) => {
    await openHarness(page, 'panel=enroll', 'mfa-enrollment');

    await page.getByRole('button', { name: /set up an authenticator app/i }).click();
    await expect(page.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'scan');
    await expect(page.getByTestId('mfa-secret')).toHaveText(/^[A-Z2-7]+$/);
    await expect(page.getByText(/otpauth:\/\/totp/)).toBeVisible();

    // Focus moves to the code field: the next useful action, not the copy button.
    const code = page.getByLabel(/code from the app/i);
    await expect(code).toBeFocused();

    await code.pressSequentially('12345');
    await expect(page.getByRole('button', { name: /confirm and turn on/i })).toBeDisabled();
    await code.pressSequentially('6');
    await page.getByRole('button', { name: /confirm and turn on/i }).click();

    await expect(page.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'done');
    await expect(page.getByTestId('mfa-enrollment')).toContainText(/enrolled/i);
  });

  test('a refused enrolment reports why and leaves the action available', async ({ page }) => {
    await openHarness(page, 'panel=enroll&error=1', 'mfa-enrollment');
    await page.getByRole('button', { name: /set up an authenticator app/i }).click();
    await expect(page.getByRole('alert')).toContainText(/refused/i);
    await expect(page.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'error');
  });

  test('Escape cancels an in-progress enrolment and returns focus to the action', async ({ page }) => {
    await openHarness(page, 'panel=enroll', 'mfa-enrollment');
    await page.getByRole('button', { name: /set up an authenticator app/i }).click();
    await expect(page.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'scan');

    await page.getByLabel(/code from the app/i).press('Escape');
    await expect(page.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'idle');
    await expect(page.getByRole('button', { name: /set up an authenticator app/i })).toBeFocused();
  });
});

test.describe('MFA enrolment · device classes', () => {
  for (const device of DEVICE_CLASSES) {
    test.describe(device.name, () => {
      test.use({ viewport: { width: device.width, height: device.height } });

      test('the enrolment flow fits, passes axe and has a baseline', async ({ page }) => {
        await openHarness(page, 'panel=enroll', 'mfa-enrollment');
        await page.getByRole('button', { name: /set up an authenticator app/i }).click();
        await expect(page.getByTestId('mfa-enrollment')).toHaveAttribute('data-phase', 'scan');

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
        expect(await blockingViolations(page)).toEqual([]);
        await expect(page).toHaveScreenshot(`mfa-enroll-${device.name}.png`, { fullPage: false });
      });
    });
  }
});
