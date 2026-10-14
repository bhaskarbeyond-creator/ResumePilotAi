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
const context = await browser.newContext({ viewport: { width: 320, height: 640 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.evaluate(async (token) => { await window.fire.auth().signInWithCustomToken(token); }, customToken);
await page.waitForTimeout(800);
await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(900);
const info = await page.evaluate(() => {
    const body = document.body;
    return { url: location.href, textLen: (body.innerText || '').trim().length, sample: (body.innerText || '').trim().slice(0, 200), rootChildren: document.getElementById('root')?.children.length };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
process.exit(0);
