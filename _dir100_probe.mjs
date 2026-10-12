import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
const p = await ctx.newPage();
// Reproduce the audit sequence: navigate ONCE, then resize through the viewports.
await p.goto('https://ime365.local/features', { waitUntil: 'load', timeout: 25000 }).catch(() => {});
await p.waitForFunction(() => { const x = document.getElementById('root'); return x && x.children.length > 0; }, { timeout: 10000 }).catch(() => {});
await p.waitForTimeout(300);
for (const w of [320, 375, 768, 1024, 1280, 1440, 1920]) {
    await p.setViewportSize({ width: w, height: 900 });
    const info = await p.evaluate(() => ({ h1: document.querySelectorAll('h1').length, nav: document.querySelectorAll('nav,[role="navigation"]').length, main: document.querySelectorAll('main,[role="main"]').length }));
    console.log('@' + w, JSON.stringify(info));
}
await b.close();


