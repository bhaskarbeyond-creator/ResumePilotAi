import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { candidateBrowserOptions } from './helpers/candidate-browser-runtime.mjs';

const phase = process.env.AUDIT_PHASE || 'after';
const output = path.resolve(`artifacts/ui-ux-audit/support/${phase}`);
const viewports = [[320, 568], [375, 812], [430, 932], [768, 1024], [1024, 768], [1366, 768], [1440, 900], [1920, 1080]];
const results = { mode: 'SIMULATED unauthenticated component, real Chromium', phase, viewports: [], checks: [] };
await fs.mkdir(output, { recursive: true });

const server = await createServer({
    cacheDir: `node_modules/.vite-candidate-support-${phase}`,
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
});
let browser;
let runtime;

try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    runtime = await candidateBrowserOptions();
    browser = await chromium.launch(runtime.options);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        return route.continue();
    });

    await page.goto(`${base}/template-lab/candidate-support.html`);
    await expect(page.getByTestId('user-support-desk')).toBeVisible();
    await page.getByTestId('create-ticket-button').click();
    await expect(page.getByTestId('create-ticket-modal')).toBeVisible();

    if (phase === 'before') {
        results.baseline = await page.evaluate(() => ({
            hasNamedModalDialog: Boolean(document.querySelector('[role="dialog"][aria-modal="true"][aria-labelledby]')),
            focusInModal: Boolean(document.querySelector('[data-testid="create-ticket-modal"]')?.contains(document.activeElement)),
            bodyScrollLocked: document.body.style.overflow === 'hidden',
        }));
        for (const [width, height] of viewports) {
            await page.setViewportSize({ width, height });
            await page.screenshot({ path: `${output}/support-modal-${width}x${height}.png`, fullPage: true });
            results.viewports.push(await page.evaluate(({ width, height }) => {
                const modal = document.querySelector('[data-testid="create-ticket-modal"] > div');
                const rect = modal?.getBoundingClientRect();
                return {
                    viewport: `${width}x${height}`,
                    windowWidth: window.innerWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    modalWithinViewport: Boolean(rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight),
                    modalHeight: rect?.height ?? null,
                    modalScrollHeight: modal?.scrollHeight ?? null,
                };
            }, { width, height }));
        }
        results.checks.push('Captured pre-change modal state and eight real-browser viewport screenshots.');
    } else {
        const dialog = page.getByRole('dialog', { name: 'Raise Support Ticket' });
        await expect(dialog).toBeVisible();
        await expect(page.getByLabel('Subject')).toBeFocused();
        assert.equal(await page.evaluate(() => document.body.style.overflow === 'hidden'), true, 'background scrolling is locked while modal is open');

        const focusable = dialog.locator('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
        const focusableCount = await focusable.count();
        assert.ok(focusableCount >= 5, `expected modal controls to remain keyboard reachable, got ${focusableCount}`);
        const first = focusable.first();
        const last = focusable.nth(focusableCount - 1);
        await last.focus();
        await page.keyboard.press('Tab');
        await expect(first).toBeFocused();
        await first.focus();
        await page.keyboard.press('Shift+Tab');
        await expect(last).toBeFocused();
        results.checks.push('Initial focus, Tab wrap, and reverse Tab wrap pass.');

        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        await fs.writeFile(`${output}/axe-modal.json`, JSON.stringify(axe, null, 2));
        assert.equal(axe.violations.length, 0, `axe violations: ${axe.violations.map(v => v.id).join(', ')}`);
        results.checks.push('axe WCAG 2.1 AA scan passes with the ticket dialog open.');

        await page.getByLabel('Subject').fill('abc');
        await page.getByLabel('Description / Details').fill('Need help');
        await page.getByTestId('ticket-submit-button').click();
        await expect(page.getByRole('alert')).toContainText('at least 4 characters');
        await expect(page.getByLabel('Subject')).toHaveValue('abc');
        await expect(dialog).toBeVisible();
        results.checks.push('Validation errors remain inside the open dialog and preserve entered text.');

        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(page.getByTestId('create-ticket-button')).toBeFocused();
        assert.equal(await page.evaluate(() => document.body.style.overflow === 'hidden'), false, 'body scroll lock is released after close');
        results.checks.push('Escape closes the dialog, restores opener focus, and releases the scroll lock.');

        for (const [width, height] of viewports) {
            await page.setViewportSize({ width, height });
            await page.getByTestId('create-ticket-button').click();
            await expect(page.getByRole('dialog', { name: 'Raise Support Ticket' })).toBeVisible();
            const measurement = await page.evaluate(({ width, height }) => {
                const dialog = document.querySelector('[role="dialog"]');
                const rect = dialog?.getBoundingClientRect();
                const body = document.querySelector('[data-testid="create-ticket-modal"] > div');
                return {
                    viewport: `${width}x${height}`,
                    windowWidth: window.innerWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    modalWithinViewport: Boolean(rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight),
                    modalCanScrollInternally: Boolean(body && (body.scrollHeight <= body.clientHeight || ['auto', 'scroll'].includes(getComputedStyle(body).overflowY))),
                };
            }, { width, height });
            results.viewports.push(measurement);
            assert.ok(measurement.documentWidth <= measurement.windowWidth, `${measurement.viewport} has horizontal page overflow`);
            assert.ok(measurement.modalWithinViewport, `${measurement.viewport} dialog extends outside the viewport`);
            assert.ok(measurement.modalCanScrollInternally, `${measurement.viewport} dialog content has no recovery scroll`);
            await page.screenshot({ path: `${output}/support-modal-${width}x${height}.png`, fullPage: true });
            await page.keyboard.press('Escape');
            await expect(page.getByRole('dialog')).toBeHidden();
        }
        results.checks.push('Dialog stays on-screen and page has no horizontal overflow at all eight required viewports.');

        await page.getByTestId('tab-knowledge-base').click();
        const faqQuestion = page.getByRole('button', { name: 'How do I download my resume as a PDF or Word document?' });
        await expect(faqQuestion).toHaveAttribute('aria-expanded', 'false');
        await faqQuestion.click();
        await expect(faqQuestion).toHaveAttribute('aria-expanded', 'true');
        const answerId = await faqQuestion.getAttribute('aria-controls');
        assert.ok(answerId, 'FAQ disclosure links to its answer region');
        await expect(page.locator(`#${answerId}`)).toBeVisible();
        results.checks.push('FAQ disclosure announces its expanded state and answer relationship.');
    }

    assert.deepEqual(errors, [], 'browser exceptions');
    results.browserErrors = errors;
    await context.close();
} catch (error) {
    results.error = error.stack || error.message;
    throw error;
} finally {
    await browser?.close();
    await runtime?.cleanup();
    await server.close();
    await fs.writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
}

console.log(`${phase.toUpperCase()} SUPPORT UX EVIDENCE`);
console.log(JSON.stringify(results, null, 2));
