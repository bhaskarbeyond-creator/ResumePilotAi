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
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.evaluate(async (token) => { await window.fire.auth().signInWithCustomToken(token); }, customToken);
await page.waitForTimeout(1500);
await page.route('**/api/covers**', (route) => {
    route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again in a few moments.' } }) });
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
await page.goto(`${TARGET_URL}/dashboard/cover-letters`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(4000);
const text = await page.evaluate(() => document.body.innerText);
console.log('PAGEERRORS:', errors.length);
console.log('ERROR_CARD_VISIBLE:', text.includes('temporarily unavailable'));
console.log('RETRY_BUTTON_VISIBLE:', text.includes('Try again'));
const sample = text.split('\n').filter(l => l.match(/unavailable|Try again|saved/i)).slice(0, 6);
console.log('SAMPLE:', JSON.stringify(sample));
await browser.close();
process.exit(0);

