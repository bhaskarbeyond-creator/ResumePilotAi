import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const VIEWPORTS = [
    { name: '1440p-desktop', width: 1440, height: 900, isMobile: false },
    { name: '1280p-desktop', width: 1280, height: 800, isMobile: false },
    { name: '1024p-tablet-landscape', width: 1024, height: 768, isMobile: false },
    { name: '768p-tablet-portrait', width: 768, height: 1024, isMobile: true },
    { name: '390p-mobile-standard', width: 390, height: 844, isMobile: true },
    { name: '360p-mobile-compact', width: 360, height: 780, isMobile: true }
];

async function runViewportAudit() {
    console.log('--- Starting Multi-Viewport Visual & Layout Audit ---');

    // Simple static server for dist
    const distDir = path.resolve('dist');
    if (!fs.existsSync(distDir)) {
        console.error('dist directory does not exist! Run npm run build first.');
        process.exit(1);
    }

    const server = http.createServer((req, res) => {
        let reqPath = req.url.split('?')[0];
        if (reqPath === '/' || !reqPath.includes('.')) {
            reqPath = '/index.html';
        }
        const filePath = path.join(distDir, reqPath);
        
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath);
            const mimeTypes = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.svg': 'image/svg+xml',
                '.woff2': 'font/woff2'
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            fs.createReadStream(filePath).pipe(res);
        } else {
            // SPA fallback
            const fallbackPath = path.join(distDir, 'index.html');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            fs.createReadStream(fallbackPath).pipe(res);
        }
    });

    const port = 41738;
    await new Promise((resolve) => server.listen(port, resolve));
    console.log(`Local preview server listening on port ${port}`);

    const browser = await chromium.launch({ headless: true });
    const auditResults = [];

    try {
        for (const vp of VIEWPORTS) {
            console.log(`Auditing viewport: ${vp.name} (${vp.width}x${vp.height})...`);
            const context = await browser.newContext({
                viewport: { width: vp.width, height: vp.height },
                isMobile: vp.isMobile
            });
            const page = await context.newPage();

            const errors = [];
            page.on('pageerror', (err) => errors.push(err.message));

            await page.goto(`http://localhost:${port}/create-resume/heading`, {
                waitUntil: 'domcontentloaded'
            });

            // Wait 1.5s for initial layout hydration
            await page.waitForTimeout(1500);

            // Check horizontal scroll / overflow
            const overflow = await page.evaluate(() => {
                const scrollWidth = document.documentElement.scrollWidth;
                const innerWidth = window.innerWidth;
                return {
                    scrollWidth,
                    innerWidth,
                    hasOverflow: scrollWidth > innerWidth + 1 // 1px tolerance
                };
            });

            // Check presence of layout structure
            const layoutCheck = await page.evaluate((isDesktop) => {
                const companion = document.querySelector('aside[aria-label*="Companion"]');
                const hasCompanion = Boolean(companion);
                const isSticky = companion ? window.getComputedStyle(companion.parentElement).position === 'sticky' : false;
                const mainGrid = document.querySelector('.grid.grid-cols-1');
                const hasGrid = Boolean(mainGrid);

                return {
                    hasCompanion,
                    isSticky,
                    hasGrid
                };
            }, !vp.isMobile);

            auditResults.push({
                viewport: vp.name,
                dimensions: `${vp.width}x${vp.height}`,
                errors: errors.length,
                hasOverflow: overflow.hasOverflow,
                overflowDetails: `${overflow.scrollWidth}px vs ${overflow.innerWidth}px`,
                hasGrid: layoutCheck.hasGrid,
                pass: errors.length === 0 && !overflow.hasOverflow
            });

            await context.close();
        }
    } finally {
        await browser.close();
        server.close();
    }

    console.log('\n--- Viewport Audit Results ---');
    console.table(auditResults);

    const allPassed = auditResults.every((r) => r.pass);
    if (!allPassed) {
        console.error('Audit failed for one or more viewports!');
        process.exit(1);
    } else {
        console.log('ALL VIEWPORTS PASSED: Zero horizontal overflow, clean responsive layout.');
    }
}

runViewportAudit().catch((err) => {
    console.error('Audit script error:', err);
    process.exit(1);
});
