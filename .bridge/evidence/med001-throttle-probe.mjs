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
// Delay every JS asset by 3s so lazy chunks hydrate late: spinner fallback stays mounted
await page.route('**/*.js', async (route) => { await new Promise(r => setTimeout(r, 3000)); route.continue(); });
await page.goto(`${TARGET_URL}/employer/messages`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    const offenders = [];
    if (overflow > 1) {
        const all = document.body.querySelectorAll('*');
        for (const el of all) {
            const r = el.getBoundingClientRect();
            if (r.right > doc.clientWidth + 1 || r.width > doc.clientWidth + 1) {
                const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 100) : '';
                const parent = el.parentElement;
                offenders.push({ tag: el.tagName.toLowerCase(), cls, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), parentTag: parent?.tagName.toLowerCase(), parentCls: (parent?.className && typeof parent.className === 'string') ? parent.className.slice(0, 100) : '' });
                if (offenders.length >= 8) break;
            }
        }
    }
    const spinner = document.querySelector('.loading');
    let chain = [];
    if (spinner) {
        let n = spinner;
        for (let i = 0; i < 6 && n; i++) {
            const r = n.getBoundingClientRect();
            chain.push({ tag: n.tagName.toLowerCase(), cls: (n.className && typeof n.className === 'string') ? n.className.slice(0, 90) : '', left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
            n = n.parentElement;
        }
    }
    return { overflow, spinnerVisible: !!spinner, textLen: (document.body.innerText || '').trim().length, offenders, spinnerChain: chain };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
process.exit(0);
