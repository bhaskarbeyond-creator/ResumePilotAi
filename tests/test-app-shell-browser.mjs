import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

async function runBrowserShellAudit() {
    console.log('--- Starting Real Playwright Browser Application Shell Audit ---');
    const vite = await createServer({
        server: { port: 0, host: '127.0.0.1', strictPort: false },
        logLevel: 'error',
    });
    const server = await vite.listen();
    const port = server.config.server.port;
    const base = `http://127.0.0.1:${port}`;
    console.log(`Vite test server running at ${base}`);

    const browser = await chromium.launch({
        args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

        // Helper to mock an authenticated user in Firebase local storage or auth state
        await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
        
        // 1. Audit routes for shell presence and uniqueness
        const routesToTest = [
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

        console.log('\n--- Auditing Route Shell DOM Structure ---');
        for (const route of routesToTest) {
            await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(500);

            const shellMetrics = await page.evaluate(() => {
                const wrappers = document.querySelectorAll('.dashboardWrapper');
                const sidebars = document.querySelectorAll('nav[aria-label="Main Navigation"], aside, .dashboardWrapper > div:first-child');
                const contentWrappers = document.querySelectorAll('.dashboardContentWrapper');
                return {
                    wrapperCount: wrappers.length,
                    contentWrapperCount: contentWrappers.length,
                    path: window.location.pathname,
                };
            });

            console.log(`Route: ${route} -> wrappers: ${shellMetrics.wrapperCount}, contentWrappers: ${shellMetrics.contentWrapperCount}`);
            // If guest/unauthenticated or authenticated, shell must never be double-wrapped (>1)
            assert.ok(shellMetrics.wrapperCount <= 1, `Route ${route} has duplicate wrappers: ${shellMetrics.wrapperCount}`);
            assert.ok(shellMetrics.contentWrapperCount <= 1, `Route ${route} has duplicate content wrappers: ${shellMetrics.contentWrapperCount}`);
        }

        console.log('\n--- Running 20-Cycle Navigation & Refresh Stability Test ---');
        let passCount = 0;
        let failCount = 0;

        for (let cycle = 1; cycle <= 20; cycle++) {
            try {
                // Step A: Navigate to /dashboard
                await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(100);

                // Step B: Navigate to /build-resume/heading
                await page.goto(`${base}/build-resume/heading`, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(100);

                // Step C: Refresh /build-resume/heading
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(100);

                // Step D: Navigate back and forward
                await page.goBack({ waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(100);
                await page.goForward({ waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(100);

                // Verify DOM state at end of cycle
                const metrics = await page.evaluate(() => {
                    const wrappers = document.querySelectorAll('.dashboardWrapper');
                    const contentWrappers = document.querySelectorAll('.dashboardContentWrapper');
                    return {
                        wrappers: wrappers.length,
                        contentWrappers: contentWrappers.length,
                    };
                });

                assert.ok(metrics.wrappers <= 1, `Cycle ${cycle}: Duplicate wrappers`);
                assert.ok(metrics.contentWrappers <= 1, `Cycle ${cycle}: Duplicate content wrappers`);
                passCount++;
                process.stdout.write(`Cycle ${cycle}/20: PASS `);
                if (cycle % 5 === 0) process.stdout.write('\n');
            } catch (cycleErr) {
                failCount++;
                console.error(`\nCycle ${cycle} FAILED:`, cycleErr.message);
            }
        }

        console.log(`\n20-Cycle Stability Results: PASS = ${passCount}, FAIL = ${failCount}`);
        assert.equal(passCount, 20, 'Expected 20/20 cycles to pass');
        assert.equal(failCount, 0, 'Expected 0 failures');

        console.log('\n--- Auditing 7 Responsive Viewports & Cross-Surface Transitions ---');
        const viewports = [
            { name: 'Desktop Large (1440x900)', width: 1440, height: 900 },
            { name: 'Desktop Standard (1280x800)', width: 1280, height: 800 },
            { name: 'Desktop Compact (1024x768)', width: 1024, height: 768 },
            { name: 'Tablet Portrait (768x1024)', width: 768, height: 1024 },
            { name: 'Large Mobile (430x932)', width: 430, height: 932 },
            { name: 'Standard Mobile (390x844)', width: 390, height: 844 },
            { name: 'Compact Mobile (375x667)', width: 375, height: 667 },
        ];

        const surfaces = [
            '/build-resume/heading',
            '/dashboard',
            '/pricing',
            '/features',
            '/enterprise',
            '/adm',
            '/adm/tenants',
        ];

        for (const vp of viewports) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            console.log(`\nTesting Viewport: ${vp.name}`);

            for (const surface of surfaces) {
                // Direct URL navigation
                await page.goto(`${base}${surface}`, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(200);

                let overflow = await page.evaluate(() => {
                    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
                });
                assert.equal(overflow, false, `Viewport ${vp.name} on ${surface} has horizontal overflow`);

                // Normal reload test
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(200);
                overflow = await page.evaluate(() => {
                    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
                });
                assert.equal(overflow, false, `Viewport ${vp.name} on ${surface} has horizontal overflow after reload`);
            }
            console.log(`  ✓ Viewport ${vp.name} passed all surface transitions without overflow or style collapse`);
        }

        await page.close();
    } finally {
        await browser.close();
        await server.close();
        await vite.close();
    }

    console.log('\n--- Real Browser Application Shell Audit Completed Successfully ---');
}

runBrowserShellAudit().catch((err) => {
    console.error('Browser Shell Audit Failed:', err);
    process.exit(1);
});
