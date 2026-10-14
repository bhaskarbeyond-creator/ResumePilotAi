import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: 'D:/xampp/htdocs/IME365/backend/.env' });
const adminMod = await import('file:///D:/xampp/htdocs/IME365/backend/services/firebaseAdmin.js');
const admin = adminMod.default || adminMod;
if (!admin.apps.length) {
    const pKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({ credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: pKey }) });
}
const TARGET_URL = process.env.TARGET_URL;
const customToken = await admin.auth().createCustomToken('OhZdiSIFL7ePA1TMkfu9bnR935D3', { email: 'bhaskar.beyond@gmail.com', email_verified: true, role: 'SUPER_ADMIN', superAdmin: true });
const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push('C: ' + m.text().slice(0, 250)); });
page.on('pageerror', e => errs.push('P: ' + String(e.message).slice(0, 250)));
await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.evaluate(async (token) => { await window.fire.auth().signInWithCustomToken(token); }, customToken);
await page.waitForTimeout(1500);
await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
for (const ms of [300, 900, 2500, 5000, 8000]) {
    await page.waitForTimeout(ms);
    const info = await page.evaluate(() => ({ url: location.href, textLen: (document.body.innerText || '').trim().length, rootChildren: document.getElementById('root')?.children.length }));
    console.log(`t+${ms}ms`, JSON.stringify(info));
}
console.log('ERRS:', JSON.stringify(errs));
await browser.close();
process.exit(0);
