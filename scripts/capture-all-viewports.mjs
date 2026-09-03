import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const VIEWPORTS = [
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'laptop-1280', width: 1280, height: 800 },
    { name: 'tablet-land-1024', width: 1024, height: 768 },
    { name: 'tablet-port-768', width: 768, height: 1024 },
    { name: 'mobile-iphone-390', width: 390, height: 844 },
    { name: 'mobile-android-360', width: 360, height: 800 },
];

const STEPS = [
    'heading',
    'work-history',
    'education',
    'skills',
    'projects',
    'certifications',
    'languages',
    'summary',
    'achievements',
    'references',
    'custom',
    'review',
];

async function main() {
    const outDir = path.resolve('test-results/visual-audit');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    console.log('Starting Vite server for visual audit...');
    const server = await createServer({
        server: { port: 51796 },
    });
    await server.listen();

    console.log('Launching headless Playwright browser...');
    const browser = await chromium.launch({ headless: true });

    let totalScreenshots = 0;

    for (const vp of VIEWPORTS) {
        console.log(`\n=== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
        const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            deviceScaleFactor: 1,
        });
        const page = await context.newPage();

        for (const step of STEPS) {
            const url = `http://localhost:51796/template-lab/builder-preview.html?step=${step}`;
            try {
                await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
                await page.waitForTimeout(1000);

                const shotName = `${step}-${vp.name}.png`;
                const shotPath = path.join(outDir, shotName);
                await page.screenshot({ path: shotPath, fullPage: false });
                totalScreenshots++;
                process.stdout.write(`  ✓ ${step} `);
            } catch (err) {
                console.error(`  ✗ Failed to capture ${step} on ${vp.name}:`, err.message);
            }
        }
        await context.close();
    }

    console.log(`\n\nVisual Audit Completed! ${totalScreenshots} screenshots saved to: ${outDir}`);

    await browser.close();
    await server.close();
}

main().catch((err) => {
    console.error('Visual audit runner failed:', err);
    process.exit(1);
});
