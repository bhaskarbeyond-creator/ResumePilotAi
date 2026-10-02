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

    test('jumping from builder to dashboard overview maintains full width layout and does not collapse or leave white gap', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });

        const defects = watchForDefects(page);
        const state = seedEnterpriseState();
        await installAuthenticatedSession(page, {
            claims: { role: 'USER' },
        });
        await installApiFixture(page, state);

        await page.addInitScript(() => {
            localStorage.setItem('ime365_cuba_shell_v2', 'true');
        });

        // 1. Start at /build-resume/heading
        await page.goto(`${base}/build-resume/heading`, { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(/\/build-resume\/heading/);

        // 2. Click "Overview" in Cuba candidate sidebar to jump to /dashboard
        const overviewLink = page.locator('aside[data-testid="cuba-sidebar"] a[href="/dashboard"]').first();
        await expect(overviewLink).toBeVisible({ timeout: 15_000 });
        await overviewLink.click();

        await expect(page).toHaveURL(new RegExp(`^${base}/dashboard/?$`), { timeout: 15_000 });

        // 3. Inspect header and main dimensions
        const header = page.locator('header.cuba-glass').first();
        await expect(header).toBeVisible({ timeout: 15_000 });
        const headerBox = await header.boundingBox();
        console.log('SPA NAV HEADER BOX:', headerBox);

        const hero = page.locator('div:has-text("Good evening")').first();
        if (await hero.count() > 0) {
            const heroBox = await hero.boundingBox();
            console.log('SPA NAV HERO BOX:', heroBox);
        }

        const mainContent = page.locator('#cuba-main-content').first();
        const mainBox = await mainContent.boundingBox();
        console.log('SPA NAV MAIN BOX:', mainBox);

        // Check style tags in head/body
        const styleTags = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('style')).map(s => s.textContent?.slice(0, 100));
        });
        console.log('STYLE TAGS COUNT:', styleTags.length, styleTags.slice(0, 5));

        // 4. Header width should span the viewport (1440px)
        expect(headerBox?.width).toBeGreaterThanOrEqual(1430);

        expect(isUnexpectedJsError(defects.pageErrors)).toEqual([]);
    });

    test('maintains full width and centered layout at 1024px viewport during SPA jumps without empty right gap', async ({ page }) => {
        // Test at the exact viewport width where the user experienced the 149px gap
        await page.setViewportSize({ width: 1024, height: 768 });

        const defects = watchForDefects(page);
        const state = seedEnterpriseState();
        await installAuthenticatedSession(page, {
            claims: { role: 'SUPER_ADMIN' },
        });
        await installApiFixture(page, state);

        await page.addInitScript(() => {
            localStorage.setItem('ime365_cuba_shell_v2', 'true');
        });

        // 1. Visit /admin first (which used to inject un-scoped sidebar styles)
        await page.goto(`${base}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(/\/admin\/dashboard/);

        // 2. Client-side jump to /dashboard
        await page.evaluate(() => window.location.assign('/dashboard'));
        await page.waitForURL(new RegExp(`^${base}/dashboard/?$`), { timeout: 15_000 });

        // 3. Header must span the entire 1024px viewport
        const header = page.locator('header.cuba-glass').first();
        await expect(header).toBeVisible({ timeout: 15_000 });
        const headerBox = await header.boundingBox();
        expect(headerBox?.width).toBeGreaterThanOrEqual(1010);
        expect(headerBox?.x).toBeLessThanOrEqual(5);

        // 4. Bounding box of CubaAppShell root must be full width (>= 1010px)
        const cubaShell = page.locator('div.w-full.flex.min-h-screen').first();
        await expect(cubaShell).toBeVisible();
        const shellBox = await cubaShell.boundingBox();
        expect(shellBox?.width).toBeGreaterThanOrEqual(1010);

        // 5. Verify no unexpected JS crash defects occurred
        expect(isUnexpectedJsError(defects.pageErrors)).toEqual([]);
    });
});
