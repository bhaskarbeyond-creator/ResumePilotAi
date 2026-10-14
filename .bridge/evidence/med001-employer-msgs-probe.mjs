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
const TARGET_URL = 'https://ime365.local';
const customToken = await admin.auth().createCustomToken('OhZdiSIFL7ePA1TMkfu9bnR935D3', { email: 'bhaskar.beyond@gmail.com', email_verified: true, role: 'SUPER_ADMIN', superAdmin: true });
const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.evaluate(async (token) => { await window.fire.auth().signInWithCustomToken(token); }, customToken);
await page.waitForTimeout(1500);
await page.goto(`${TARGET_URL}/employer/messages`, { waitUntil: 'domcontentloaded', timeout: 45000 });
// sample at multiple times to see when the overflow exists
for (const ms of [600, 1500, 3500, 6000]) {
    await page.waitForTimeout(ms);
    const info = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflow = doc.scrollWidth - doc.clientWidth;
        const offenders = [];
        if (overflow > 1) {
            const all = document.body.querySelectorAll('*');
            for (const el of all) {
                const r = el.getBoundingClientRect();
                if (r.right > doc.clientWidth + 1 || r.width > doc.clientWidth + 1) {
                    const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 80) : '';
                    offenders.push({ tag: el.tagName.toLowerCase(), cls, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
                    if (offenders.length >= 12) break;
                }
            }
        }
        return { overflow, spinnerVisible: !!document.querySelector('.loading'), textLen: (document.body.innerText || '').trim().length, offenders };
    });
    console.log(`t+${ms}ms`, JSON.stringify(info));
}
await browser.close();
process.exit(0);
