import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const results = [];
let consoleErrors = [];
let failedRequests = [];

function record(name, ok, detail = '') {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
});
page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + String(err).slice(0, 300)));
page.on('requestfailed', req => {
    if (!req.url().includes('localhost')) failedRequests.push(req.url() + ' :: ' + (req.failure()?.errorText || ''));
});

try {
    // 1. Homepage loads
    const resp = await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
    record('homepage HTTP 200', resp.status() === 200, `status=${resp.status()}`);
    await page.waitForTimeout(2000);
    const title = await page.title();
    record('homepage title renders', title.length > 0, title.slice(0, 80));
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    record('homepage body has content', bodyText.trim().length > 50, bodyText.trim().slice(0, 80).replace(/\n/g, ' '));

    // 2. Login page loads without Firestore
    await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    const loginText = await page.evaluate(() => document.body.innerText.slice(0, 600));
    record('login page renders', loginText.trim().length > 30, loginText.trim().slice(0, 80).replace(/\n/g, ' '));

    // 3. No firestore.googleapis.com network calls anywhere
    const fsRequests = [];
    page.on('request', req => {
        if (req.url().includes('firestore') || req.url().includes('firebaseio')) fsRequests.push(req.url());
    });
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    record('ZERO Firestore network requests', fsRequests.length === 0, fsRequests.length ? fsRequests[0] : 'none');

    // 4. Public API endpoints reachable through the app origin
    const health = await page.evaluate(async () => {
        const r = await fetch('/api/health');
        return { status: r.status, body: await r.json() };
    });
    record('health via app origin', health.status === 200 && health.body.status === 'ok');

    // 5. Public config + stats + reviews + pages render data
    const publicData = await page.evaluate(async () => {
        const out = {};
        for (const path of ['/api/platform/public-config', '/api/stats', '/api/reviews?limit=3', '/api/public/custom-pages']) {
            try { const r = await fetch(path); out[path] = { status: r.status, ok: r.ok }; } catch (e) { out[path] = { error: e.message }; }
        }
        return out;
    });
    record('public config 200', publicData['/api/platform/public-config']?.ok === true);
    record('stats 200', publicData['/api/stats']?.ok === true);
    record('reviews 200', publicData['/api/reviews?limit=3']?.ok === true);
    record('custom pages 200', publicData['/api/public/custom-pages']?.ok === true);

    // 6. Console errors check
    await page.waitForTimeout(1000);
    const realErrors = consoleErrors.filter(e => !/favicon/i.test(e) && !/net::ERR_ABORTED.*sockjs/i.test(e));
    record('ZERO unexpected console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | ') || 'clean');

    // 7. Protected API requires auth (401)
    const unauth = await page.evaluate(async () => {
        const r = await fetch('/api/users-data/profile');
        return r.status;
    });
    record('protected API returns 401', unauth === 401, `status=${unauth}`);

    // 8. Dashboard redirects to login when unauthenticated
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    const url = page.url();
    record('dashboard redirects unauthenticated', url.includes('/login'), url);
} catch (err) {
    record('E2E run completed without uncaught error', false, String(err).slice(0, 200));
    consoleErrors.push('RUNERR: ' + String(err).slice(0, 300));
}

await browser.close();

const failed = results.filter(r => !r.ok);
console.log(`\n==== E2E SMOKE SUMMARY: ${results.length - failed.length}/${results.length} passed ====`);
console.log('Console errors captured:', consoleErrors.slice(0, 5));
console.log('Failed requests:', failedRequests.slice(0, 5));
process.exit(failed.length ? 1 : 0);
