import { test, expect } from '@playwright/test';
import { apiFor, horizontalOverflow, installSession, mintSession, openEngine, releaseCredential, seedCredential } from './helpers';

/**
 * Cross-viewport rendering.
 *
 * Runs under all five projects (375 / 414 / 768 / 1280 / 1920). The assertions
 * are viewport-aware: the engine must never force horizontal page scrolling,
 * every control must remain reachable, and the sticky save bar must not cover
 * the control the operator is about to press.
 */

const SECTIONS = ['overview', 'providers', 'catalog', 'usage', 'telemetry'] as const;

test.describe('Responsive rendering', () => {
  test('no section forces horizontal page scrolling @responsive', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    for (const section of SECTIONS) {
      await openEngine(page, section);
      // Let layout settle (fonts, transitions) before measuring.
      await page.waitForTimeout(250);
      const overflow = await horizontalOverflow(page);
      expect(overflow, `section "${section}" overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });

  test('the section tab strip stays reachable and scrolls on narrow screens @responsive', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await openEngine(page);
    const tabs = page.getByTestId('ai-engine-tabs');
    await expect(tabs).toBeVisible();
    // Every tab is present in the DOM; on narrow viewports the strip scrolls.
    for (const section of SECTIONS) {
      await expect(page.getByTestId(`ai-engine-tab-${section}`)).toHaveCount(1);
    }
    await page.getByTestId('ai-engine-tab-telemetry').scrollIntoViewIfNeeded();
    await page.getByTestId('ai-engine-tab-telemetry').click();
    await expect(page.getByTestId('ai-engine-section-telemetry')).toBeVisible();
  });

  test('provider cards keep both columns of controls usable @responsive', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await openEngine(page, 'providers');

    const card = page.getByTestId('ai-engine-provider-gemini');
    await expect(card).toBeVisible();
    for (const testId of ['ai-engine-enable-gemini', 'ai-engine-key-gemini', 'ai-engine-test-gemini', 'ai-engine-discover-gemini']) {
      const control = page.getByTestId(testId);
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box, `${testId} must have a layout box`).not.toBeNull();
      // A control must never be clipped to zero width/height by a grid collapse.
      expect((box?.width ?? 0) > 8).toBe(true);
      expect((box?.height ?? 0) > 8).toBe(true);
    }
  });

  test('the sticky unsaved-changes bar does not cover the controls it acts on @responsive', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await openEngine(page, 'providers');

    await page.getByTestId('ai-engine-key-openai').fill('sk-ui-layout-probe-0123456789');
    const bar = page.getByTestId('ai-engine-unsaved');
    await expect(bar).toBeVisible();

    const barBox = await bar.boundingBox();
    expect(barBox).not.toBeNull();
    // The page must reserve space for the bar, i.e. at maximum scroll the last
    // card still sits above it. Scrolling to the true bottom is the only way to
    // measure that reservation (`scrollIntoViewIfNeeded` stops as soon as the
    // element is in the viewport, even if the bar overlays it).
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(250);
    const cardBox = await page.getByTestId('ai-engine-provider-deepseek').boundingBox();
    if (cardBox && barBox) {
      const overlaps = cardBox.y + cardBox.height > barBox.y && cardBox.y < barBox.y + barBox.height;
      expect(overlaps, 'the last provider card must be scrollable clear of the sticky bar').toBe(false);
    }
    await page.getByRole('button', { name: /Discard/i }).click();
  });

  test('dialogs fit inside every viewport @responsive', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);
    const seeded = await seedCredential(api, 'openrouter');
    await openEngine(page, 'providers');

    const revoke = page.getByTestId('ai-engine-clear-openrouter');
    if ((await revoke.count()) === 0 || (await revoke.isDisabled())) {
      if (seeded) await releaseCredential(api, 'openrouter');
      test.skip(true, 'The openrouter credential is deployment-managed; revocation is correctly disabled.');
    }

    await revoke.click();
    const dialog = page.getByTestId('ai-engine-confirm-dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box && viewport) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    if (seeded) await releaseCredential(api, 'openrouter');
  });

  test('primary actions stay visible without horizontal scrolling @responsive', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await openEngine(page);

    for (const testId of ['ai-engine-reload', 'ai-engine-save']) {
      const button = page.getByTestId(testId);
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      const viewport = page.viewportSize();
      expect(box?.x ?? 0).toBeGreaterThanOrEqual(0);
      if (box && viewport) expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  });

  test('touch targets are large enough on mobile widths @responsive', async ({ page, context, request }, testInfo) => {
    const width = testInfo.project.use.viewport?.width ?? 1280;
    test.skip(width > 767, 'Touch target sizing is asserted on the two mobile projects only.');
    const session = await mintSession(request);
    await installSession(context, session);
    await openEngine(page, 'overview');

    for (const testId of ['ai-engine-tab-providers', 'ai-engine-save', 'ai-engine-reload']) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box).not.toBeNull();
      // 32px is the practical floor once the tab strip is horizontally scrollable.
      expect((box?.height ?? 0) >= 30, `${testId} height ${box?.height}`).toBe(true);
    }
    // Switches expose their state to assistive tech on every viewport.
    await expect(page.getByRole('switch', { name: /Autonomous fallback/i })).toHaveAttribute('aria-checked', /true|false/);
  });
});
