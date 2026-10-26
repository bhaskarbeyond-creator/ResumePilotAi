/**
 * Session lifecycle in a real browser: expiry, recovery, and sign-out confirmation.
 *
 * ## Why these two surfaces and not more
 *
 * The brief lists six auth screens. Three of them are the sign-in screen's own modes
 * (`login`, `register`, `reset`) and are covered by `auth-screens-ux.spec.ts`. Two are the
 * lifecycle surfaces here — an expired session and a deliberate sign-out — and one is the MFA
 * challenge, which cannot be reached without a configured Firebase project (`OI-UX-11` carries
 * the exact command).
 *
 * Both surfaces in this file were **missing** before this round:
 *
 *  - a 401 rendered as a broken panel, with no path back to sign-in;
 *  - "Sign Out" fired on a single menu activation, destroying the preview session and any
 *    unsaved draft.
 *
 * ## Keyboard contract asserted here
 *
 * | Surface | Keys | Expected |
 * |---|---|---|
 * | Session-expired dialog | on open | focus is inside the dialog, on a button |
 * | | `Tab` ×4 | focus never leaves the dialog |
 * | | `Escape` | dialog closes, page unchanged |
 * | Sign-out confirmation | on open | focus is inside, and **not** on the destructive action |
 * | | `Tab` ×3 | focus never leaves the dialog |
 * | | `Escape` | dialog closes and focus returns to the trigger |
 *
 * ## Running
 *
 *   cd frontend && npm run test:ux:session
 *
 * No backend: the API is answered at the network layer, and the identity is a preview-session
 * token with the shape the client requires (`tests/support/admin-console-backend.ts`).
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { previewToken } from './support/admin-console-backend';

/** A candidate identity: the shell that renders the account menu and the sign-out control. */
const CANDIDATE = { uid: 'fixture-candidate', email: 'candidate@ime365.com', displayName: 'Priya Candidate', role: 'USER' as const };

/** Seed the preview session the client accepts, without a Firebase provider. */
async function signIn(page: Page): Promise<void> {
  const token = previewToken({ ...CANDIDATE });
  await page.addInitScript(
    ([stored, user]) => localStorage.setItem(stored as string, JSON.stringify(user)),
    ['ime_dev_user', { ...CANDIDATE, token }] as const,
  );
}

/** Answer everything the dashboard asks for: 200 for the profile probe, 401 for the rest. */
async function makeSessionExpired(page: Page): Promise<void> {
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'The sign-in is no longer valid.' } }),
    }),
  );
  // The preview-session probe answers 200 while the data routes answer 401, which is exactly the
  // situation the dialog exists for: the browser believes it is signed in, the server disagrees.
  await page.route('**/api/users-data/profile', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) }),
  );
}

/** Focus stays inside the element marked as a dialog. */
async function focusIsInsideDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return dialog ? dialog.contains(document.activeElement) : false;
  });
}

test.describe('session expired', () => {
  test.use({ viewport: { width: 480, height: 800 } });

  test('a 401 raises a recoverable dialog, and Escape dismisses it without navigating', async ({ page }) => {
    await signIn(page);
    await makeSessionExpired(page);
    await page.goto('/dashboard/resumes', { waitUntil: 'domcontentloaded' });

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 20_000 });
    await expect(dialog).toContainText(/your session ended/i);

    // Focus is inside the dialog and not on the document body — a screen-reader user is told
    // what happened rather than being left on a panel that silently failed.
    expect(await focusIsInsideDialog(page)).toBe(true);

    for (let index = 0; index < 4; index += 1) {
      await page.keyboard.press('Tab');
      expect(await focusIsInsideDialog(page), `focus escaped the dialog on Tab #${index + 1}`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(new URL(page.url()).pathname, 'dismissing must not navigate').toBe('/dashboard/resumes');

    // The dialog carries a heading, a description and two named buttons.
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? '')).map((v) => v.id)).toEqual([]);
  });

  test('"Sign in again" returns to the sign-in screen and explains why', async ({ page }) => {
    await signIn(page);
    await makeSessionExpired(page);
    await page.goto('/dashboard/resumes', { waitUntil: 'domcontentloaded' });

    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: /sign in again/i }).click();

    await page.waitForURL('**/login?reason=session_expired');
    await expect(page.getByTestId('session-expired-notice')).toBeVisible();
    await expect(page.getByTestId('session-expired-notice')).toContainText(/session ended/i);
    // The stored session is gone: the token that caused the 401 cannot be retried.
    expect(await page.evaluate(() => localStorage.getItem('ime_dev_user'))).toBeNull();

    await page.screenshot({ path: 'test-results/session-expired-login-480.png', fullPage: false });
  });

  test('the dialog is usable at 320 px and survives 200 % text without clipping', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await signIn(page);
    await makeSessionExpired(page);
    await page.goto('/dashboard/resumes', { waitUntil: 'domcontentloaded' });

    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 20_000 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth, 'no horizontal scroll at 320 px / 200 % text').toBeLessThanOrEqual(overflow.clientWidth + 1);

    // Both actions keep a measurable, reachable box.
    for (const name of [/stay on this page/i, /sign in again/i]) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(0);
      expect(box?.height ?? 0).toBeGreaterThan(0);
    }
  });
});

test.describe('sign-out confirmation', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('signing out asks first, traps focus, and Escape returns focus to the trigger', async ({ page }) => {
    await signIn(page);
    // The dashboard's own reads fail; that is fine, the shell still renders.
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], items: [] }) }),
    );
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const trigger = page.getByRole('button', { name: 'Sign out' }).first();
    await trigger.waitFor({ state: 'visible', timeout: 20_000 });
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    await expect(dialog).toContainText(/sign out of ime365\?/i);

    // The destructive action must not be the initial focus, or Enter would sign someone out.
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    expect(focused).not.toMatch(/^sign out$/i);

    for (let index = 0; index < 3; index += 1) {
      await page.keyboard.press('Tab');
      expect(await focusIsInsideDialog(page), `focus escaped the dialog on Tab #${index + 1}`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(new URL(page.url()).pathname, 'cancelling must not sign out').toBe('/dashboard');

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? '')).map((v) => v.id)).toEqual([]);
  });

  test('confirming signs out and lands on the sign-in screen', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], items: [] }) }),
    );
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Sign out' }).first().click();
    await page.getByRole('dialog').waitFor({ state: 'visible' });
    await page.getByTestId('logout-confirm').click();

    await page.waitForURL('**/login');
    expect(await page.evaluate(() => localStorage.getItem('ime_dev_user'))).toBeNull();
  });
});

/**
 * Visual baselines for both dialogs at the five device classes.
 *
 * The dialogs are the only surfaces a person sees when something has already gone wrong, so a
 * layout that overflows at 320 px is exactly the case least likely to be noticed in review. The
 * baseline is the whole viewport (`fullPage: false`) because the dimmed page behind the dialog is
 * part of what the eye judges.
 */
for (const device of [
  { name: '320-small-phone', width: 320, height: 568 },
  { name: '480-large-phone', width: 480, height: 800 },
  { name: '768-tablet', width: 768, height: 1024 },
  { name: '1024-laptop', width: 1024, height: 768 },
  { name: '1441-desktop', width: 1441, height: 900 },
]) {
  test.describe(`lifecycle baselines · ${device.name}`, () => {
    test.use({ viewport: { width: device.width, height: device.height } });

    test('session-expired dialog', async ({ page }) => {
      await signIn(page);
      await makeSessionExpired(page);
      await page.goto('/dashboard/resumes', { waitUntil: 'domcontentloaded' });
      await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 20_000 });
      await expect(page).toHaveScreenshot(`session-expired-${device.name}.png`, { fullPage: false });
    });

    test('sign-out confirmation', async ({ page }) => {
      await signIn(page);
      await page.route('**/api/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], items: [] }) }),
      );
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      // The account menu is the one sign-out entry point that exists at every width; the sidebar
      // footer control is inside the drawer below 768 px and is deliberately not reachable until
      // the drawer is open.
      await page.getByRole('button', { name: /account menu/i }).click();
      await page.getByRole('menuitem', { name: /sign out/i }).click();
      await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 20_000 });
      await expect(page).toHaveScreenshot(`logout-confirm-${device.name}.png`, { fullPage: false });
    });
  });
}

test.describe('lifecycle baselines · dark', () => {
  test.use({ viewport: { width: 320, height: 568 }, colorScheme: 'dark' });

  test('session-expired dialog in dark mode', async ({ page }) => {
    await signIn(page);
    await makeSessionExpired(page);
    await page.goto('/dashboard/resumes', { waitUntil: 'domcontentloaded' });
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 20_000 });
    await expect(page).toHaveScreenshot('session-expired-dark-320.png', { fullPage: false });
  });
});
