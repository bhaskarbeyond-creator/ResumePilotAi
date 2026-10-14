import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: 'D:/xampp/htdocs/IME365/backend/.env' });
const TARGET_URL = process.env.TARGET_URL;
const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 150)); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e.message).slice(0, 150)));
await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
    const body = document.body;
    return {
        url: location.href,
        textLen: (body.innerText || '').trim().length,
        sample: (body.innerText || '').trim().slice(0, 300),
        htmlLen: body.innerHTML.length,
        rootChildren: document.getElementById('root')?.children.length,
    };
});
console.log(JSON.stringify(info, null, 2));
console.log('ERRORS:', JSON.stringify(errors, null, 2));
await browser.close();
process.exit(0);
