import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const LIVE_BASE = 'https://airesume.projectdemo.guru';

async function testLiveProduction() {
    console.log(`\n==================================================`);
    console.log(`STARTING LIVE PRODUCTION VERIFICATION AGAINST: ${LIVE_BASE}`);
    console.log(`==================================================\n`);

    const browser = await chromium.launch({
        args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];

    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    page.on('requestfailed', (req) => {
        failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    });

    try {
        // 1. Check live index.html and bundle version
        console.log('1. Checking Live Production Bundle & Assets...');
        await page.goto(`${LIVE_BASE}/`, { waitUntil: 'domcontentloaded' });
        
        const liveBundle = await page.evaluate(() => {
            const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.getAttribute('src'));
            return {
                title: document.title,
                scripts,
            };
        });
        console.log(`Live Page Title: ${liveBundle.title}`);
        console.log(`Live Scripts: ${JSON.stringify(liveBundle.scripts)}`);

        // 2. Test live routes DOM Structure
        const routes = [
            '/dashboard',
            '/build-resume',
            '/build-resume/heading',
            '/build-resume/summary',
            '/build-resume/employment',
            '/build-resume/education',
            '/build-resume/skills',
            '/create-resume',
            '/create-resume/heading',
        ];

        console.log('\n2. Testing Live Route Navigation & Shell Presence...');
        for (const route of routes) {
            await page.goto(`${LIVE_BASE}${route}`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1000);

            const metrics = await page.evaluate(() => {
                const wrappers = document.querySelectorAll('.dashboardWrapper');
                const contentWrappers = document.querySelectorAll('.dashboardContentWrapper');
                const sidebars = document.querySelectorAll('nav[aria-label="Main Navigation"], aside, .dashboardWrapper > div:first-child');
                return {
                    wrappers: wrappers.length,
                    contentWrappers: contentWrappers.length,
                    sidebars: sidebars.length,
                    path: window.location.pathname,
                    bodyTextLength: document.body.innerText.length,
                };
            });

            console.log(`Live Route ${route} -> path: ${metrics.path}, wrappers: ${metrics.wrappers}, contentWrappers: ${metrics.contentWrappers}, textLen: ${metrics.bodyTextLength}`);
            // Shell must never duplicate (>1)
            assert.ok(metrics.wrappers <= 1, `Live Route ${route} has duplicate wrappers: ${metrics.wrappers}`);
            assert.ok(metrics.contentWrappers <= 1, `Live Route ${route} has duplicate content wrappers: ${metrics.contentWrappers}`);
        }

        // 3. 20-Cycle Live Stability Test
        console.log('\n3. Running 20-Cycle Live Production Stability Test...');
        let passedCycles = 0;
        for (let i = 1; i <= 20; i++) {
            await page.goto(`${LIVE_BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(200);

            await page.goto(`${LIVE_BASE}/build-resume/heading`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(200);

            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(200);

            await page.goBack({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(200);

            await page.goForward({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(200);

            const metrics = await page.evaluate(() => {
                return {
                    wrappers: document.querySelectorAll('.dashboardWrapper').length,
                    contentWrappers: document.querySelectorAll('.dashboardContentWrapper').length,
                };
            });

            assert.ok(metrics.wrappers <= 1, `Cycle ${i}: Duplicate wrappers on live`);
            assert.ok(metrics.contentWrappers <= 1, `Cycle ${i}: Duplicate content wrappers on live`);
            passedCycles++;
            process.stdout.write(`Live Cycle ${i}/20: PASS `);
            if (i % 5 === 0) process.stdout.write('\n');
        }

        console.log(`\n20-Cycle Live Results: ${passedCycles}/20 PASSED (0 FAILURES)`);
        assert.equal(passedCycles, 20);

        // 4. Live Viewports Check
        console.log('\n4. Auditing Live Viewports...');
        const viewports = [
            { name: 'Desktop (1440x900)', width: 1440, height: 900 },
            { name: 'Tablet (768x1024)', width: 768, height: 1024 },
            { name: 'Mobile (375x667)', width: 375, height: 667 },
        ];

        for (const vp of viewports) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto(`${LIVE_BASE}/build-resume/heading`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(500);

            const overflow = await page.evaluate(() => {
                return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
            });
            console.log(`Live Viewport ${vp.name}: Horizontal overflow = ${overflow}`);
            assert.equal(overflow, false, `Live Viewport ${vp.name} overflow detected`);
        }

        console.log('\n5. Console & Network Summary:');
        console.log(`Total Console Errors logged: ${consoleErrors.length}`);
        console.log(`Total Failed Requests logged: ${failedRequests.length}`);

        console.log('\n✅ ALL LIVE PRODUCTION CHECKS PASSED 100%!');
    } finally {
        await page.close();
        await context.close();
        await browser.close();
    }
}

testLiveProduction().catch((err) => {
    console.error('\n❌ LIVE PRODUCTION TEST FAILED:', err);
    process.exit(1);
});
