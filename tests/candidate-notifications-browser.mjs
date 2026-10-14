import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';
import { candidateBrowserOptions } from './helpers/candidate-browser-runtime.mjs';
import AxeBuilder from '@axe-core/playwright';

const phase = process.env.AUDIT_PHASE || 'after';
const output = `artifacts/candidate-audit-20261014/${phase}`;
await fs.mkdir(output, { recursive: true });
const results = [];
const server = await createServer({ cacheDir: 'node_modules/.vite-candidate-notifications', server: { host: '0.0.0.0', port: 0 }, logLevel: 'error' });
let browser;
let runtime;
const fixture = () => [
    { id: 'n1', type: 'system', title: 'Application update — José', message: 'Your application has an update.', read: false, createdAt: '2026-10-13T10:00:00Z' },
    { id: 'n2', type: 'system', title: 'Security notice', message: 'Review account activity.', read: false, createdAt: '2026-10-12T10:00:00Z' },
];
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    runtime = await candidateBrowserOptions();
    browser = await chromium.launch(runtime.options);
    async function scenario(name, run, options = {}) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let rows = fixture();
        const requests = [];
        const gates = [];
        const state = { fail: null, hold: null, malformed: false, getCount: 0 };
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.origin !== base) return route.abort();
            if (!url.pathname.startsWith('/api/notifications-data')) return route.continue();
            const method = route.request().method();
            requests.push({ method, path: url.pathname });
            if (method === 'GET') state.getCount++;
            const fail = state.fail;
            if (state.hold?.method === method) {
                const gate = state.hold.gate;
                gates.push(gate);
                await gate.promise;
            }
            if (fail?.method === method) return route.fulfill({ status: fail.status, json: { error: 'SIMULATED dependency failure' } });
            if (method === 'GET') return route.fulfill({ json: state.malformed ? { success: true } : { success: true, notifications: rows } });
            if (method === 'PATCH') {
                const id = url.pathname.split('/').pop();
                const patch = route.request().postDataJSON();
                rows = rows.map(row => row.id === id ? { ...row, read: patch.read } : row);
            } else rows = rows.map(row => ({ ...row, read: true }));
            return route.fulfill({ json: { success: true } });
        });
        const go = async (strict = false) => {
            await page.goto(`${base}/template-lab/candidate-notifications.html${strict ? '?strict' : ''}`);
            await expect(page.getByTestId('dashboard-notifications')).toBeVisible();
        };
        try {
            await run({ page, state, requests, go, setRows: value => { rows = value; } });
            assert.deepEqual(errors, [], 'browser exceptions');
            results.push({ name, status: 'PASS', ...options });
        } catch (error) {
            results.push({ name, status: 'FAIL', error: error.message, ...options });
            await page.screenshot({ path: `${output}/${name.replace(/[^a-z0-9-]/gi, '-')}-failure.png`, fullPage: true });
        } finally {
            gates.forEach(gate => gate.resolve());
            await context.tracing.stop({ path: `${output}/${name.replace(/[^a-z0-9-]/gi, '-')}.zip` });
            await context.close();
        }
    }
    await scenario('strict-mode-load', async ({ page, go }) => {
        await go(true);
        await expect(page.getByTestId('notifications-row')).toHaveCount(2, { timeout: 6000 });
    });
    await scenario('row-write-blocks-bulk-and-deduplicates', async ({ page, state, requests, go }) => {
        await go();
        const toggle = page.getByTestId('notifications-toggle').first();
        await expect(toggle).toBeVisible();
        const gate = deferred(); state.hold = { method: 'PATCH', gate };
        await toggle.evaluate(button => { button.click(); button.click(); });
        await expect(toggle).toBeDisabled();
        await expect(page.getByTestId('notifications-mark-all')).toBeDisabled();
        gate.resolve();
        await expect(toggle).toBeEnabled();
        assert.equal(requests.filter(r => r.method === 'PATCH').length, 1);
    });
    await scenario('bulk-write-blocks-row-and-toast-contract', async ({ page, state, requests, go }) => {
        await go(); await expect(page.getByTestId('notifications-row')).toHaveCount(2);
        const gate = deferred(); state.hold = { method: 'POST', gate };
        await page.getByTestId('notifications-mark-all').evaluate(button => { button.click(); button.click(); });
        await expect(page.getByTestId('notifications-toggle').first()).toBeDisabled();
        gate.resolve();
        await expect(page.getByTestId('notifications-toggle').first()).toBeEnabled();
        assert.equal(requests.filter(r => r.method === 'POST').length, 1);
        assert.deepEqual(await page.evaluate(() => window.notificationToasts), [['success', 'Notifications', 'All notifications marked as read.']]);
        await page.reload();
        await expect(page.getByTestId('notifications-toggle').first()).toHaveAttribute('aria-pressed', 'true');
    });
    await scenario('unmounted-bulk-does-not-toast', async ({ page, state, go }) => {
        await go(); await expect(page.getByTestId('notifications-row')).toHaveCount(2);
        const gate = deferred(); state.hold = { method: 'POST', gate };
        const response = page.waitForResponse(r => r.request().method() === 'POST');
        await page.getByTestId('notifications-mark-all').click();
        await page.getByRole('button', { name: 'Toggle test mount' }).click();
        gate.resolve(); await response;
        await page.getByRole('button', { name: 'Toggle test mount' }).click();
        await expect(page.getByTestId('notifications-row')).toHaveCount(2);
        assert.deepEqual(await page.evaluate(() => window.notificationToasts), []);
    });
    for (const status of [401, 403, 429, 500]) {
        await scenario(`row-${status}-rollback-retry`, async ({ page, state, go }) => {
            state.fail = { method: 'PATCH', status };
            await go(); const toggle = page.getByTestId('notifications-toggle').first();
            await toggle.click();
            await expect(page.getByTestId('notifications-error')).toContainText('SIMULATED');
            await expect(toggle).toHaveAttribute('aria-pressed', 'false');
            state.fail = null;
            await toggle.click();
            await expect(toggle).toBeEnabled();
            await expect(toggle).toHaveAttribute('aria-pressed', 'true');
            await page.reload();
            await expect(page.getByTestId('notifications-toggle').first()).toHaveAttribute('aria-pressed', 'true');
        });
    }
    await scenario('bulk-rollback-retry', async ({ page, state, go }) => {
        state.fail = { method: 'POST', status: 500 };
        await go(); await page.getByTestId('notifications-mark-all').click();
        await expect(page.getByTestId('notifications-error')).toContainText('SIMULATED');
        for (const toggle of await page.getByTestId('notifications-toggle').all()) await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        state.fail = null; await page.getByTestId('notifications-mark-all').click();
        await expect(page.getByTestId('notifications-toggle').first()).toHaveAttribute('aria-pressed', 'true');
    });
    await scenario('load-error-retry', async ({ page, state, go }) => {
        state.fail = { method: 'GET', status: 500 };
        await go(); await expect(page.getByText('Notifications unavailable')).toBeVisible();
        state.fail = null; await page.getByRole('button', { name: /retry|try again/i }).click();
        await expect(page.getByTestId('notifications-row')).toHaveCount(2);
    });
    await scenario('malformed-load-is-not-empty-success', async ({ page, state, go }) => {
        state.malformed = true; await go();
        await expect(page.getByText('Notifications unavailable')).toBeVisible();
    });
    const viewports = [[320,568],[375,812],[430,932],[768,1024],[1024,768],[1366,768],[1440,900],[1920,1080]];
    for (const [width, height] of viewports) {
        await scenario(`responsive-${width}x${height}`, async ({ page, setRows, go }) => {
            setRows([{ ...fixture()[0], title: '長い通知 — ' + 'LongTitle'.repeat(15), message: 'https://example.test/' + 'unbrokentext'.repeat(30) }, fixture()[1]]);
            await page.setViewportSize({ width, height }); await go();
            await expect(page.getByTestId('notifications-row')).toHaveCount(2);
            await page.screenshot({ path: `${output}/notifications-${width}x${height}.png`, fullPage: true });
            const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
            assert.ok(size.scroll <= size.width, JSON.stringify(size));
            const message = page.getByTestId('notifications-row').first().locator('[data-notification-message]');
            // Also measure the content span: overflow-hidden ancestors can conceal clipping.
            await expect(message).toHaveCount(1);
            assert.ok(await message.evaluate(node => node.scrollWidth <= node.clientWidth), 'notification text clips inside card');
            await page.getByTestId('notifications-filter-unread').click();
            await page.getByTestId('notifications-toggle').first().click();
            await expect(page.getByTestId('notifications-row')).toHaveCount(1);
        }, { viewport: `${width}x${height}` });
    }
    await scenario('automated-accessibility-and-keyboard', async ({ page, go }) => {
        await go(); await expect(page.getByTestId('notifications-row')).toHaveCount(2);
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        await fs.writeFile(`${output}/axe.json`, JSON.stringify(axe, null, 2));
        assert.equal(axe.violations.length, 0, axe.violations.map(v => v.id).join(', '));
        await page.getByTestId('notifications-filter-unread').focus();
        await page.keyboard.press('Enter');
        await expect(page.getByTestId('notifications-filter-unread')).toHaveAttribute('aria-pressed', 'true');
    });
} finally {
    await browser?.close();
    await runtime?.cleanup();
    await server.close();
    await fs.writeFile(`${output}/results.json`, JSON.stringify({ mode: 'SIMULATED API, real Chromium and real component/client', phase, results }, null, 2));
}
console.log(results.map(r => `${r.status} ${r.name}`).join('\n'));
console.log(`${results.filter(r => r.status === 'PASS').length}/${results.length} passed`);
if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
