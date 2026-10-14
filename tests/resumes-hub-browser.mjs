import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { candidateBrowserOptions } from './helpers/candidate-browser-runtime.mjs';

const output = path.resolve('artifacts/ui-ux-audit/resumes/after');
const viewports = [[320, 568], [375, 812], [430, 932], [768, 1024], [1024, 768], [1366, 768], [1440, 900], [1920, 1080]];
const results = { mode: 'SIMULATED resume APIs, real Chromium', viewports: [], checks: [] };
await fs.mkdir(output, { recursive: true });

const server = await createServer({
    cacheDir: 'node_modules/.vite-candidate-resumes',
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
});
let browser;
let runtime;
const check = (name, detail = '') => {
    results.checks.push({ name, ok: true, detail });
};

try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    runtime = await candidateBrowserOptions();
    browser = await chromium.launch(runtime.options);

    const failureContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const failurePage = await failureContext.newPage();
    const failureErrors = [];
    failurePage.on('pageerror', (error) => failureErrors.push(error.message));
    await failurePage.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        return route.continue();
    });
    await failurePage.goto(`${base}/template-lab/candidate-resumes.html?mode=error`);
    const failure = failurePage.getByRole('alert');
    await expect(failure).toContainText('Your resumes could not be loaded');
    await expect(failurePage.getByText('No resumes yet')).toHaveCount(0);
    await expect(failurePage.getByTestId('resume-count')).toHaveText('Count unavailable');
    await failurePage.evaluate(() => { window.__resumeLab.mode = 'success'; });
    await failurePage.getByRole('button', { name: 'Try again' }).click();
    await failurePage.getByRole('button', { name: 'Search and filters' }).click();
    await expect(failurePage.getByTestId('resume-result-summary')).toContainText('Showing 1–8 of 37 resumes');
    await expect(failurePage.getByTestId('resume-card')).toHaveCount(8);
    check('API failure is an error state, not a false empty workspace; retry recovers with all 37 resumes.');
    await failureContext.close();

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        return route.continue();
    });
    await page.goto(`${base}/template-lab/candidate-resumes.html`);
    await expect(page.getByTestId('dashboard-resumes-hub')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My Resumes' })).toBeVisible();
    await expect(page.getByTestId('resume-count')).toHaveText('37 resumes');
    await page.getByRole('button', { name: 'Search and filters' }).click();
    await expect(page.getByTestId('resume-result-summary')).toContainText('Showing 1–8 of 37 resumes');
    await expect(page.getByTestId('resume-card')).toHaveCount(8);
    await expect(page.getByTestId('resume-thumbnail')).toHaveCount(8);
    check('The restored gallery shows a truthful total, live document thumbnails, and only 8 cards per page.');

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    await fs.writeFile(`${output}/axe-hub.json`, JSON.stringify(axe, null, 2));
    assert.equal(axe.violations.length, 0, `axe violations: ${axe.violations.map((violation) => violation.id).join(', ')}`);
    check('axe WCAG 2.1 AA scan passes on the loaded hub.');

    const strongScore = await page.evaluate(() => window.__resumeLab.scoreById['resume-01']);
    assert.ok(strongScore >= 70, `strong fixture should exercise the high readiness filter; score=${strongScore}`);
    await page.getByTestId('resume-sort').selectOption('title-asc');
    await expect(page.getByTestId('resume-card').first().locator('article > header > h2')).toHaveText('Resume 01');
    await page.getByTestId('resume-next-page').click();
    await expect(page.getByTestId('resume-card').first()).toContainText('Resume 09');
    await page.getByLabel('Search resumes').fill('Resume 05');
    await expect(page.getByTestId('resume-result-summary')).toContainText('Showing 1–1 of 1 resumes');
    await expect(page.getByTestId('resume-card')).toHaveCount(1);
    await page.getByLabel('Search resumes').fill('no-such-resume');
    await expect(page.getByRole('heading', { name: 'No matching resumes' })).toBeVisible();
    await page.getByTestId('resume-reset-empty').click();
    await expect(page.getByTestId('resume-card')).toHaveCount(8);
    await page.getByTestId('resume-template-filter').selectOption('Cv1');
    const expectedCv1Count = await page.evaluate(() => window.__resumeLab.fixtures.filter((doc) => doc.template === 'Cv1').length);
    await expect(page.getByTestId('resume-result-summary')).toContainText(`of ${expectedCv1Count} resumes`);
    assert.equal(await page.getByTestId('resume-card').count(), Math.min(8, expectedCv1Count), 'template filter must only show matching rows');
    await page.getByTestId('resume-clear-filters').click();
    await page.getByTestId('resume-ats-filter').selectOption('ready');
    const expectedReadyCount = await page.evaluate(() => Object.values(window.__resumeLab.scoreById).filter((score) => score >= 70).length);
    await expect(page.getByTestId('resume-result-summary')).toContainText(`of ${expectedReadyCount} resumes`);
    await expect(page.getByTestId('resume-card')).toHaveCount(Math.min(8, expectedReadyCount));
    check('Search, true empty-filter state, reset, title sort, template filter, ATS filter, and paging work.');
    await page.getByTestId('resume-clear-filters').click();

    await page.getByLabel('Search resumes').fill('Resume 02');
    await expect(page.getByTestId('resume-card').first().locator('article > header > h2')).toHaveText('Resume 02');
    await page.evaluate(() => { window.__resumeLab.mode = 'save-error'; });
    await page.getByRole('button', { name: 'More actions for Resume 02' }).click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect.poll(() => page.evaluate(() => window.__resumeLab.toasts.at(-1)?.[0])).toBe('error');
    assert.equal(await page.evaluate(() => window.__resumeLab.fixtures.length), 37, 'failed duplicate must not add a row');
    await page.evaluate(() => { window.__resumeLab.mode = 'success'; });
    await page.getByRole('button', { name: 'More actions for Resume 02' }).click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect(page.getByTestId('resume-result-summary')).toContainText('Showing 1–2 of 2 resumes');
    await expect(page.getByRole('button', { name: 'More actions for Resume 02 (Copy)' })).toBeVisible();
    check('Duplicate persists through the mocked API and appears in the active search.');

    await page.evaluate(() => { window.__resumeLab.blockStorage = true; });
    await page.getByRole('button', { name: 'More actions for Resume 02 (Copy)' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete resume?' });
    await expect(dialog).toBeVisible();
    const axeDialog = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    await fs.writeFile(`${output}/axe-delete-dialog.json`, JSON.stringify(axeDialog, null, 2));
    assert.equal(axeDialog.violations.length, 0, `dialog axe violations: ${axeDialog.violations.map((violation) => violation.id).join(', ')}`);
    await page.evaluate(() => { window.__resumeLab.mode = 'delete-error'; });
    await dialog.getByRole('button', { name: 'Delete resume' }).click();
    await expect(dialog).toBeVisible();
    assert.equal(await page.evaluate(() => window.__resumeLab.fixtures.length), 38, 'failed delete must retain the resume');
    const failedDeleteToast = await page.evaluate(() => window.__resumeLab.toasts.at(-1));
    assert.equal(failedDeleteToast?.[0], 'error');
    await page.evaluate(() => { window.__resumeLab.mode = 'success'; });
    await dialog.getByRole('button', { name: 'Delete resume' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('resume-result-summary')).toContainText('Showing 1–1 of 1 resumes');
    const remainingAfterDelete = await page.evaluate(() => window.__resumeLab.fixtures.length);
    assert.equal(remainingAfterDelete, 37, 'successful deletion must remain successful when browser storage is unavailable');
    check('Delete confirmation is accessible and a storage cleanup failure cannot reverse a committed delete.');
    await page.evaluate(() => { window.__resumeLab.blockStorage = false; });

    await page.evaluate(() => { window.__resumeLab.blockStorage = true; });
    await page.getByRole('button', { name: 'Edit Resume 02' }).click();
    const blockedEditLocation = await page.evaluate(() => window.__resumeLab.location);
    assert.equal(blockedEditLocation, '/dashboard/resumes', 'failed storage write must not navigate to the wrong resume');
    const storageToast = await page.evaluate(() => window.__resumeLab.toasts.at(-1));
    assert.equal(storageToast?.[0], 'error');
    check('Resume editing refuses to navigate when the selected resume ID cannot be persisted.');

    await page.evaluate(() => { window.__resumeLab.blockStorage = false; });
    await page.getByRole('button', { name: 'Create New Resume' }).click();
    await expect.poll(() => page.evaluate(() => window.__resumeLab.location)).toBe('/build-resume/heading?new=1');
    check('Create New Resume sends the builder an explicit fresh-draft intent.');

    const emptyPage = await context.newPage();
    await emptyPage.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        return route.continue();
    });
    await emptyPage.goto(`${base}/template-lab/candidate-resumes.html?mode=empty`);
    await expect(emptyPage.getByRole('heading', { name: 'No resumes yet' })).toBeVisible();
    await expect(emptyPage.getByRole('alert')).toHaveCount(0);
    check('A genuinely empty account retains a distinct, actionable empty state.');

    await page.goto(`${base}/template-lab/candidate-resumes.html`);
    await expect(page.getByTestId('resume-card')).toHaveCount(8);
    for (const [width, height] of viewports) {
        await page.setViewportSize({ width, height });
        const measurement = await page.evaluate(({ width, height }) => {
            const list = document.querySelector('[data-testid="resume-list"]');
            const bounds = list?.getBoundingClientRect();
            return {
                viewport: `${width}x${height}`,
                documentWidth: document.documentElement.scrollWidth,
                windowWidth: window.innerWidth,
                visibleResumeCards: document.querySelectorAll('[data-testid="resume-card"]').length,
                columns: list ? getComputedStyle(list).gridTemplateColumns.split(' ').length : 0,
                thumbnailHeight: document.querySelector('[data-testid="resume-thumbnail"]')?.getBoundingClientRect().height ?? 0,
                listWidth: bounds?.width ?? 0,
            };
        }, { width, height });
        results.viewports.push(measurement);
        assert.ok(measurement.documentWidth <= measurement.windowWidth, `${measurement.viewport} has horizontal overflow`);
        assert.equal(measurement.visibleResumeCards, 8, `${measurement.viewport} should keep the page bounded`);
        const expectedColumns = width >= 1280 ? 4 : width >= 768 ? 2 : 1;
        assert.equal(measurement.columns, expectedColumns, `${measurement.viewport} should use ${expectedColumns} gallery columns`);
        assert.ok(measurement.thumbnailHeight >= 280, `${measurement.viewport} should keep the resume preview visible`);
        await page.screenshot({ path: `${output}/resumes-${width}x${height}.png`, fullPage: true });
    }
    check('Eight responsive gallery checks pass from 320px mobile through 1920px desktop with visible previews and bounded list rendering.');
    assert.deepEqual(pageErrors, [], 'browser exceptions');
    results.browserErrors = pageErrors;
    await context.close();
    await emptyPage.close();
} catch (error) {
    results.error = error.stack || error.message;
    throw error;
} finally {
    await browser?.close();
    await runtime?.cleanup();
    await server.close();
    const passed = results.checks.filter((entry) => entry.ok).length;
    results.summary = { total: results.checks.length, passed, failed: results.checks.length - passed };
    await fs.writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
}

console.log('RESUMES HUB UX EVIDENCE');
console.log(JSON.stringify(results, null, 2));
