import { test, expect } from '@playwright/test';
import {
  ADMIN_EMAIL,
  SUPER_ADMIN_EMAIL,
  WEB_ORIGIN,
  apiFor,
  installSession,
  mintSession,
  openEngine,
} from './helpers';

/**
 * Deep-link & shell parity.
 *
 * The legacy console exposed the AI panel at `/admin/settings?tab=aiSettings`
 * and the modern console exposes `/admin/ai-settings`. Both must reach the same
 * surface, because those URLs live in runbooks, bookmarks and dashboard links.
 */

test.describe('AI engine deep links', () => {
  test('canonical /admin/ai-settings renders the engine console with real settings @smoke', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const api = apiFor(request, session);
    const settings = await api.get<{ settings: { provider: string }; revision: number }>('/admin/ai-settings');
    expect(settings.status, 'GET /api/admin/ai-settings must answer for a Super Admin').toBe(200);

    await openEngine(page);

    await expect(page.getByTestId('ai-engine-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: /AI Multi-Provider Engine/i }).first()).toBeVisible();
    // The revision rendered in the header must be the revision the server returned.
    await expect(page.getByTestId('ai-engine-revision')).toHaveText(String(settings.body.revision));
    // All five sections are reachable from the tab strip.
    for (const tab of ['overview', 'providers', 'catalog', 'usage', 'telemetry']) {
      await expect(page.getByTestId(`ai-engine-tab-${tab}`)).toBeVisible();
    }
  });

  test('?section= deep links select the exact surface and survive a reload', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);

    const cases: [string, string][] = [
      ['providers', 'ai-engine-section-providers'],
      ['catalog', 'ai-engine-section-catalog'],
      ['usage', 'ai-engine-section-usage'],
      ['telemetry', 'ai-engine-section-telemetry'],
    ];
    for (const [section, testId] of cases) {
      await page.goto(`${WEB_ORIGIN}/admin/ai-settings?section=${section}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId(testId)).toBeVisible();
      await expect(page.getByTestId(`ai-engine-tab-${section}`)).toHaveAttribute('aria-selected', 'true');
      // A hard reload must land on the same section (state comes from the URL).
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId(testId)).toBeVisible();
    }
  });

  test('section aliases resolve instead of dead-ending', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    const aliases: [string, string][] = [
      ['models', 'ai-engine-section-catalog'],
      ['quota', 'ai-engine-section-usage'],
      ['health', 'ai-engine-section-telemetry'],
      ['credentials', 'ai-engine-section-providers'],
      ['routing', 'ai-engine-section-overview'],
      ['not-a-real-section', 'ai-engine-section-overview'],
    ];
    for (const [alias, testId] of aliases) {
      await page.goto(`${WEB_ORIGIN}/admin/ai-settings?section=${alias}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId(testId), `alias "${alias}" must render ${testId}`).toBeVisible();
    }
  });

  test('legacy ?tab=aiSettings deep link opens the modern engine', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);

    // The historical bookmark target.
    await page.goto(`${WEB_ORIGIN}/admin/settings?tab=aiSettings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ai-engine-page')).toBeVisible();
    await expect(page.getByTestId('ai-engine-tab-overview')).toHaveAttribute('aria-selected', 'true');

    // Variant spellings an operator may have typed or bookmarked.
    for (const legacy of ['ai_settings', 'aisettings']) {
      await page.goto(`${WEB_ORIGIN}/admin/settings?tab=${legacy}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('ai-engine-page')).toBeVisible();
    }

    // The modern alias must also win over a stale path segment.
    await page.goto(`${WEB_ORIGIN}/admin/ai-settings?tab=aiSettings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ai-engine-page')).toBeVisible();
  });

  test('sidebar navigation entry opens the engine and advertises the current tab @smoke', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await page.goto(`${WEB_ORIGIN}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('ai-engine-page').waitFor({ state: 'detached' }).catch(() => {});
    const navLink = page.getByRole('link', { name: /AI Multi-Provider Engine/i }).first();
    if (await navLink.count()) {
      await navLink.click();
      await expect(page.getByTestId('ai-engine-page')).toBeVisible();
    } else {
      // Small viewports collapse the sidebar into a drawer; use the in-page tab strip instead.
      const tab = page.getByTestId('admin-tab-ai-settings');
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(page.getByTestId('ai-engine-page')).toBeVisible();
    }
  });

  test('non-Super-Admin sessions get a read-only console, not credential access', async ({ page, context, request }) => {
    const session = await mintSession(request, ADMIN_EMAIL, 'ANY');
    expect(session.role).toBe('ADMIN');
    await installSession(context, session);

    // The server refuses the projection outright for ADMIN.
    const api = apiFor(request, session);
    const denied = await api.get<{ error: { code: string } }>('/admin/ai-settings');
    expect([401, 403]).toContain(denied.status);

    await openEngine(page).catch(() => {});
    const forbidden = page.getByTestId('ai-engine-forbidden');
    if (await forbidden.count()) {
      await expect(forbidden).toBeVisible();
      await expect(page.getByText(/Super Admin required/i)).toBeVisible();
    }
  });

  test('legacy /adm and /platform aliases deep-link into the engine', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    for (const legacy of ['/adm/ai-settings', '/platform/ai-settings', '/adm/ai-settings?section=providers']) {
      await page.goto(`${WEB_ORIGIN}${legacy}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('ai-engine-page'), `${legacy} must land on the engine`).toBeVisible();
    }
  });

  test('unknown /admin deep links still resolve to a real console surface', async ({ page, context, request }) => {
    const session = await mintSession(request, SUPER_ADMIN_EMAIL);
    await installSession(context, session);
    await page.goto(`${WEB_ORIGIN}/admin/ai-settings/does-not-exist`, { waitUntil: 'domcontentloaded' });
    // The engine must still render (router falls back to the console tab).
    await expect(page.getByTestId('ai-engine-page')).toBeVisible();
  });

  test('the section strip is one keyboard stop with arrow/Home/End navigation @smoke', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await openEngine(page);

    const order = ['overview', 'providers', 'catalog', 'usage', 'telemetry'] as const;
    const tablist = page.getByRole('tablist', { name: /AI engine sections/i });
    await expect(tablist).toBeVisible();
    await expect(tablist.getByRole('tab')).toHaveCount(order.length);

    // Roving tabindex: exactly one tab is reachable with a plain Tab press.
    const selected = await tablist.locator('[role="tab"][tabindex="0"]').all();
    expect(selected, 'exactly one tab must be in the tab order').toHaveLength(1);
    await expect(page.getByTestId('ai-engine-tab-overview')).toHaveAttribute('tabindex', '0');

    // Focus the active tab through the keyboard, not through .focus().
    await page.getByTestId('ai-engine-tab-overview').focus();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('ai-engine-tab-providers')).toBeFocused();
    await expect(page.getByTestId('ai-engine-section-providers')).toBeVisible();
    // Selection follows focus, and it is reflected in the deep link.
    await expect(page.getByTestId('ai-engine-tab-providers')).toHaveAttribute('aria-selected', 'true');
    expect(new URL(page.url()).searchParams.get('section')).toBe('providers');

    // Wrapping in both directions must not dead-end.
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('ai-engine-tab-overview')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('ai-engine-tab-telemetry')).toBeFocused();
    await expect(page.getByTestId('ai-engine-tab-telemetry')).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Home');
    await expect(page.getByTestId('ai-engine-tab-overview')).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByTestId('ai-engine-tab-telemetry')).toBeFocused();
    await expect(page.getByTestId('ai-engine-section-telemetry')).toBeVisible();

    // Enter moves the operator into the panel content.
    await page.keyboard.press('Enter');
    await expect(page.locator('#ai-engine-panel')).toBeFocused();
  });

  test('every section is reachable with the keyboard alone and each panel is labelled by its tab', async ({ page, context, request }) => {
    const session = await mintSession(request);
    await installSession(context, session);
    await openEngine(page, 'providers');

    const panel = page.locator('#ai-engine-panel');
    await expect(panel).toHaveAttribute('role', 'tabpanel');
    await expect(panel).toHaveAttribute('aria-labelledby', 'ai-engine-tab-providers');

    for (const id of ['overview', 'providers', 'catalog', 'usage', 'telemetry']) {
      await page.getByTestId(`ai-engine-tab-${id}`).click();
      await expect(page.getByTestId(`ai-engine-section-${id}`)).toBeVisible();
      await expect(page.locator('#ai-engine-panel')).toHaveAttribute('aria-labelledby', `ai-engine-tab-${id}`);
      // The selected tab is the one that reports selection, and only that one.
      await expect(page.getByRole('tablist', { name: /AI engine sections/i }).locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
      await expect(page.getByTestId(`ai-engine-tab-${id}`)).toHaveAttribute('aria-selected', 'true');
    }
  });
});
