// @ts-check
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';

let viteServer;
let baseUrl = '';

test.beforeAll(async () => {
    viteServer = await createServer({
        server: { port: 54950, host: '127.0.0.1' },
        logLevel: 'error',
    });
    await viteServer.listen();
    baseUrl = 'http://127.0.0.1:54950';
});

test.afterAll(async () => {
    if (viteServer) {
        await viteServer.close();
    }
});

test.describe('Real-Browser Zero-FOUC & Pre-Paint Validation', () => {
    test('Dark theme pre-paint: html and body render dark #0d0f16 at domcontentloaded without white flash', async ({ page }) => {
        // Prime localStorage with dark theme before navigation
        await page.addInitScript(() => {
            localStorage.setItem('cuba_theme', 'dark');
        });

        // Navigate and wait ONLY for domcontentloaded (before React finishes hydration)
        await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });

        // Verify document attributes attached synchronously before React
        const dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(dataTheme).toBe('dark');
        expect(hasDarkClass).toBe(true);

        // Verify computed background colors on html and body are the dark canvas (#0d0f16 -> rgb(13, 15, 22))
        const htmlBg = await page.evaluate(() => window.getComputedStyle(document.documentElement).backgroundColor);
        const bodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);

        expect(htmlBg).toBe('rgb(13, 15, 22)');
        expect(bodyBg).toBe('rgb(13, 15, 22)');

        // Verify it is NOT the blinding white default
        expect(htmlBg).not.toBe('rgb(255, 255, 255)');
        expect(bodyBg).not.toBe('rgb(255, 255, 255)');
    });

    test('Light theme pre-paint: html and body render Cuba light canvas #f4f5f9 at domcontentloaded', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem('cuba_theme', 'light');
        });

        await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });

        const dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(dataTheme).toBe('light');
        expect(hasDarkClass).toBe(false);

        const htmlBg = await page.evaluate(() => window.getComputedStyle(document.documentElement).backgroundColor);
        const bodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);

        expect(htmlBg).toBe('rgb(244, 245, 249)');
        expect(bodyBg).toBe('rgb(244, 245, 249)');
    });

    test('OS dark mode preference pre-paint: renders #0d0f16 with zero saved preference', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.addInitScript(() => {
            localStorage.clear();
        });

        await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });

        const dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        expect(dataTheme).toBe('dark');

        const htmlBg = await page.evaluate(() => window.getComputedStyle(document.documentElement).backgroundColor);
        expect(htmlBg).toBe('rgb(13, 15, 22)');
    });

    test('Skip-link pre-paint discipline: never flashes inside visible viewport', async ({ page }) => {
        await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });

        const skipLinkBox = await page.evaluate(() => {
            const el = document.querySelector('.skip-link');
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, height: rect.height };
        });

        expect(skipLinkBox).not.toBeNull();
        // Skip-link must be positioned off-screen (negative top) before user focuses it
        expect(skipLinkBox.top).toBeLessThan(0);
    });
});
