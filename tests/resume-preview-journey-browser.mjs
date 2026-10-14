import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Enable the app's local-only auth adapter for this isolated browser run. All
// API traffic is intercepted below; no production identity or records are used.
process.env.VITE_LOCAL_AUTH = 'true';
process.env.VITE_PREVIEW_TOKEN = 'test.eyJ1aWQiOiJwcmV2aWV3LXVzZXIiLCJyb2xlIjoiVVNFUiIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSJ9.sig';

const output = path.resolve('artifacts/ui-ux-audit/resumes/after');
const fixture = {
    id: 'preview-journey-1',
    revision: 4,
    updatedAt: '2026-10-14T10:00:00.000Z',
    title: 'Asha Rao Resume',
    template: 'Cv1',
    firstname: 'Asha',
    lastname: 'Rao',
    email: 'asha.rao@example.com',
    phone: '+91 90000 00000',
    occupation: 'Site Reliability Engineer',
    city: 'Bengaluru',
    country: 'India',
    summary: 'Site reliability engineer focused on resilient cloud systems and dependable delivery.',
    employments: [{ id: 'employment-preview', jobTitle: 'Site Reliability Engineer', employer: 'Example Systems', begin: '2022', end: 'Present', description: 'Improved service reliability and reduced recovery time.' }],
    skills: [{ id: 'skill-preview', name: 'Kubernetes', rating: 90 }],
};

const checks = [];
const record = (name, passed, detail = '') => {
    checks.push({ name, passed, detail });
    assert.ok(passed, `${name}: ${detail}`);
};

const vite = await createServer({
    cacheDir: 'node_modules/.vite-resume-preview-e2e',
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
});
let browser;

try {
    await vite.listen();
    const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
    await context.addInitScript(() => {
        localStorage.setItem('sidebarCollapsed', 'true');
        localStorage.setItem('resumepilot_local_session_v1', JSON.stringify({
            token: 'test.eyJ1aWQiOiJwcmV2aWV3LXVzZXIiLCJyb2xlIjoiVVNFUiIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSJ9.sig',
            uid: 'preview-user',
            email: 'test@example.com',
            displayName: 'Preview Test User',
            role: 'USER',
            exp: Math.floor(Date.now() / 1000) + 3600,
        }));
    });

    const page = await context.newPage();
    const pageErrors = [];
    let resumeWrites = 0;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();

        const method = route.request().method();
        if (url.pathname === '/api/resumes' && method === 'GET') {
            return route.fulfill({ json: { resumes: [fixture] } });
        }
        if (url.pathname === `/api/resumes/${fixture.id}/publication`) {
            return route.fulfill({ json: { isPublished: false, publicationRevision: 0, sourceRevision: fixture.revision } });
        }
        if (url.pathname === `/api/resumes/${fixture.id}` && method === 'GET') {
            return route.fulfill({ json: { resume: fixture } });
        }
        if (url.pathname.startsWith('/api/resumes/') && method === 'POST') {
            resumeWrites += 1;
            return route.fulfill({ json: { resume: fixture } });
        }
        if (url.pathname.startsWith('/api/users-data/')) {
            return route.fulfill({ json: { user: { firstname: 'Asha', lastname: 'Rao', profile: { firstname: 'Asha', lastname: 'Rao' } } } });
        }
        if (url.pathname === '/api/platform/public-config') {
            return route.fulfill({ json: { _settingsSource: 'mariadb', modules: { enableAtsScoreModule: true }, systemHealth: { maintenanceMode: false } } });
        }
        return route.fulfill({ json: {} });
    });

    await page.goto(`${base}/dashboard/resumes`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
        await page.getByRole('heading', { name: 'My Resumes' }).waitFor({ state: 'visible', timeout: 15000 });
    } catch (error) {
        const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500);
        throw new Error(`Resume hub did not load: ${error.message.slice(0, 120)} url=${page.url()} body="${body}"`);
    }
    await page.getByRole('button', { name: 'Preview Asha Rao Resume' }).click();

    const dialog = page.locator('[role="dialog"][aria-labelledby="resume-preview-title"]');
    await dialog.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(600);
    const previewText = await dialog.innerText();
    const selectedId = await page.evaluate(() => localStorage.getItem('currentResumeId'));
    record('Resume thumbnail opens the selected saved document in the full preview renderer',
        previewText.includes('Resume Preview') && previewText.includes('Asha Rao') && page.url().includes('/dashboard/resumes'),
        `name=${previewText.includes('Asha Rao')} remainsOnHub=${page.url().includes('/dashboard/resumes')} storedId=${selectedId}`);
    record('Preview remains read-only and does not issue a resume save', resumeWrites === 0, `writes=${resumeWrites}`);
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'resume-preview-375x812.png') });

    await dialog.getByRole('button', { name: 'Close preview' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 5000 });
    await page.getByRole('button', { name: 'Edit Asha Rao Resume' }).click();
    await page.waitForURL(/\/build-resume\/heading/, { timeout: 15000 });
    const editorId = await page.evaluate(() => localStorage.getItem('currentResumeId'));
    const firstNameField = page.getByLabel(/first name/i);
    record('Closing preview returns to the gallery and Edit opens the selected heading step',
        editorId === fixture.id && await firstNameField.inputValue() === fixture.firstname,
        `selectedId=${editorId} url=${page.url()} headingDataLoaded=${await firstNameField.inputValue() === fixture.firstname}`);

    const outerScrollMetrics = await page.evaluate(() => {
        const selectors = ['html', 'body', '#root', '#main-content', '.dashboardContentWrapper'];
        return selectors.map((selector) => {
            const element = document.querySelector(selector);
            if (!element) return { selector, present: false };
            return {
                selector,
                present: true,
                scrollHeight: element.scrollHeight,
                clientHeight: element.clientHeight,
                overflowY: getComputedStyle(element).overflowY,
            };
        });
    });
    const outerPageScrollers = outerScrollMetrics.filter((entry) => (
        entry.present
        && entry.scrollHeight > entry.clientHeight + 1
        && ['auto', 'scroll'].includes(entry.overflowY)
    ));
    record('Builder keeps document and application-shell containers bounded around its own editing canvas',
        outerPageScrollers.length === 0,
        JSON.stringify(outerScrollMetrics));

    const tailorToggle = page.getByRole('button', { name: /Tailor for a specific job/ });
    record('Optional tailoring starts collapsed for a clean first-run form', await tailorToggle.getAttribute('aria-expanded') === 'false');
    await tailorToggle.click();
    record('Optional tailoring opens on demand', await tailorToggle.getAttribute('aria-expanded') === 'true');
    await page.screenshot({ path: path.join(output, 'resume-heading-375x812.png') });

    const viewports = [[320, 568], [375, 812], [430, 932], [768, 1024], [1024, 768], [1366, 768], [1440, 900], [1920, 1080]];
    for (const [width, height] of viewports) {
        await page.setViewportSize({ width, height });
        const headingWidth = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
        record(`Heading has no horizontal overflow at ${width}x${height}`, headingWidth.document <= headingWidth.viewport + 1,
            `${headingWidth.document}px / ${headingWidth.viewport}px`);

        await page.getByRole('button', { name: 'Preview resume' }).first().click();
        await dialog.waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForTimeout(550);
        const modalWidth = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
        record(`Preview has no horizontal overflow at ${width}x${height}`, modalWidth.document <= modalWidth.viewport + 1,
            `${modalWidth.document}px / ${modalWidth.viewport}px`);
        if (width === 320 || width === 1920) {
            await page.screenshot({ path: path.join(output, `resume-preview-${width}x${height}.png`) });
        }
        await dialog.getByRole('button', { name: 'Close preview' }).click();
        await dialog.waitFor({ state: 'detached', timeout: 5000 });
    }

    await page.goto(`${base}/build-resume/heading?legacy=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByLabel(/first name/i).waitFor({ state: 'visible', timeout: 15000 });
    const legacyScrollMetrics = await page.evaluate(() => {
        const selectors = ['html', 'body', '#root', '#main-content', '.dashboardContentWrapper'];
        return selectors.map((selector) => {
            const element = document.querySelector(selector);
            if (!element) return { selector, present: false };
            return {
                selector,
                present: true,
                scrollHeight: element.scrollHeight,
                clientHeight: element.clientHeight,
                overflowY: getComputedStyle(element).overflowY,
            };
        });
    });
    const legacyPageScrollers = legacyScrollMetrics.filter((entry) => (
        entry.present
        && entry.scrollHeight > entry.clientHeight + 1
        && ['auto', 'scroll'].includes(entry.overflowY)
    ));
    record('Legacy shell also keeps the outer page bounded around the builder canvas',
        legacyScrollMetrics.some((entry) => entry.selector === '.dashboardContentWrapper' && entry.present)
        && legacyPageScrollers.length === 0,
        JSON.stringify(legacyScrollMetrics));
    await page.screenshot({ path: path.join(output, 'resume-heading-legacy-shell-1920x1080.png') });

    record('Browser completes the hub-to-preview route with no uncaught page errors', pageErrors.length === 0,
        pageErrors.slice(0, 3).join(' | '));
    await context.close();
} finally {
    await browser?.close();
    await vite.close();
}

console.log('RESUME HUB → PREVIEW BROWSER E2E');
for (const check of checks) console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
console.log(`${checks.filter((check) => check.passed).length}/${checks.length} checks passed.`);
