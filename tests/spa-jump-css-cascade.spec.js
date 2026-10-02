// @ts-check
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import {
    installAuthenticatedSession,
    seedEnterpriseState,
    viteFixtureDefines,
} from './helpers/enterprise-fixture.mjs';
import { installApiFixture, watchForDefects, isUnexpectedJsError } from './four-portal-fixture.mjs';

test.describe.configure({ mode: 'serial' });

/** @type {import('vite').ViteDevServer} */
let vite;
let base = '';

test.beforeAll(async () => {
    vite = await createServer({
        server: { port: 0, host: '127.0.0.1', strictPort: false },
        logLevel: 'error',
        define: viteFixtureDefines(),
    });
    const server = await vite.listen();
    base = `http://127.0.0.1:${server.config.server.port}`;
});

test.afterAll(async () => {
    await vite?.close();
});

test.describe('SPA Client Navigation CSS Cascade Integrity', () => {
    test('jumping from homepage to builder via "Open Studio" renders Cuba sidebar and Guide without reload', async ({ page }) => {
        // Set desktop viewport so responsive lg:flex / lg:block rules apply
        await page.setViewportSize({ width: 1440, height: 900 });

        const defects = watchForDefects(page);
        const state = seedEnterpriseState();
        await installAuthenticatedSession(page, {
            claims: { role: 'USER' },
        });
        await installApiFixture(page, state);

        // Ensure Cuba candidate shell is active
        await page.addInitScript(() => {
            localStorage.setItem('ime365_cuba_shell_v2', 'true');
        });

        // 1. Land on the homepage (which imports Welcome -> Action -> LanguagePicker)
        await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(new RegExp(`^${base}/?$`));

        // 2. Click "Open Studio" on the navbar
        const openStudioBtn = page.locator('#rp-nav-getstarted-btn');
        await expect(openStudioBtn).toBeVisible({ timeout: 15_000 });
        await openStudioBtn.click();

        // 3. Verify client-side SPA navigation landed on /build-resume/heading
        await expect(page).toHaveURL(/\/build-resume\/heading/, { timeout: 15_000 });

        // 4. Verify Cuba sidebar is visible with display: flex
        const sidebar = page.locator('aside[data-testid="cuba-sidebar"]');
        await expect(sidebar).toBeVisible({ timeout: 15_000 });
        const sidebarDisplay = await sidebar.evaluate((el) => window.getComputedStyle(el).display);
        expect(sidebarDisplay).toBe('flex');

        // 5. Verify Section Guide card is visible with display: block
        const guide = page.locator('aside[aria-label="Section guide"]');
        await expect(guide).toBeVisible({ timeout: 15_000 });
        const guideDisplay = await guide.evaluate((el) => window.getComputedStyle(el).display);
        expect(guideDisplay).toBe('block');

        // 6. Verify Cuba Header search button is visible
        const searchBtn = page.getByRole('button', { name: /search/i }).first();
        await expect(searchBtn).toBeVisible();

        // 7. Verify no unexpected JS crash defects occurred
        expect(isUnexpectedJsError(defects.pageErrors)).toEqual([]);
    });
});
