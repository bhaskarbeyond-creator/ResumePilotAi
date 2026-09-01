import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const adminMod = await import('../backend/services/firebaseAdmin.js');
const admin = adminMod.default || adminMod;

if (!admin.apps.length) {
    const pKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: pKey,
        }),
    });
}

const customToken = await admin.auth().createCustomToken('OhZdiSIFL7ePA1TMkfu9bnR935D3', {
    email: 'superadmin@example.com',
    email_verified: true,
    role: 'SUPER_ADMIN',
    superAdmin: true,
});

async function run() {
    console.log('=== DATABASE → API → UI END-TO-END CHAIN PROOF ===\n');

    // 1. Establish direct MariaDB connection
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'resume_builder',
        port: Number(process.env.DB_PORT) || 3306,
    });

    const browser = await chromium.launch({
        headless: true,
        args: ['--ignore-certificate-errors']
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        ignoreHTTPSErrors: true
    });
    const page = await context.newPage();

    // Trace events
    let capturedRequest = null;
    let capturedResponse = null;

    page.on('request', req => {
        if (req.url().includes('/api/admin/trusted-by') && req.method() === 'POST') {
            capturedRequest = {
                url: req.url(),
                method: req.method(),
                postData: JSON.parse(req.postData() || '{}')
            };
        }
    });

    page.on('response', async res => {
        if (res.url().includes('/api/admin/trusted-by') && res.request().method() === 'POST') {
            capturedResponse = {
                status: res.status(),
                body: await res.json().catch(() => ({}))
            };
        }
    });

    // Authenticate
    await page.goto((process.env.TARGET_URL || process.env.APP_URL));
    await page.evaluate(async (tok) => {
        await window.fire.auth().signInWithCustomToken(tok);
    }, customToken);
    await page.waitForTimeout(600);

    // Step 1: Navigate to Trusted By screen
    console.log('Step 1: Navigating to /adm/trustedby in browser...');
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/adm/trustedby');
    await page.waitForSelector('form input', { timeout: 10000 });

    const companyUniqueName = `E2E_Company_${Date.now()}`;
    const testInputs = await page.$$('form input');
    // Fill Name
    await testInputs[0].fill(companyUniqueName);
    // Fill Logo URL
    await testInputs[1].fill('https://example.com/logo-e2e.png');

    console.log(`Step 2: Submitting mutation for company "${companyUniqueName}"...`);
    const submitBtn = await page.$('form button:has-text("Save"), form button[type="submit"]');
    await submitBtn.click();
    await page.waitForTimeout(2000);

    console.log('\n--- Step 2 Output: Captured API Request ---');
    console.log(JSON.stringify(capturedRequest, null, 2));

    console.log('\n--- Step 3 Output: Captured API Response ---');
    console.log(JSON.stringify(capturedResponse, null, 2));

    const createdId = capturedResponse?.body?.data?.id || capturedResponse?.body?.id;

    // Step 4: Direct MariaDB Inspection
    console.log(`\nStep 4: Directly inspecting MariaDB row for "${companyUniqueName}"...`);
    const [rows] = await db.query('SELECT id, name, logo_url, active, created_at FROM trusted_by WHERE name = ?', [companyUniqueName]);
    console.log('MariaDB Raw Record:');
    console.table(rows);

    const dbRecordExists = rows.length > 0 && rows[0].name === companyUniqueName;
    console.log(`MariaDB Verification: ${dbRecordExists ? 'EXISTS & MATCHES' : 'RECORD NOT FOUND'}`);

    // Step 5: Reload Browser and Verify UI Persistence
    console.log('\nStep 5: Performing hard browser page reload...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    console.log('Step 6: Verifying DOM rendering of persisted entity...');
    const pageText = await page.evaluate(() => document.body.innerText);
    const renderedInDom = pageText.includes(companyUniqueName);
    console.log(`DOM Render Verification: ${renderedInDom ? 'PERSISTED & RENDERED' : 'NOT FOUND IN DOM'}`);

    // Step 7: Clean up MariaDB record
    if (dbRecordExists) {
        console.log('\nStep 7: Cleaning up test row in MariaDB...');
        await db.query('DELETE FROM trusted_by WHERE name = ?', [companyUniqueName]);
        const [cleanRows] = await db.query('SELECT id FROM trusted_by WHERE name = ?', [companyUniqueName]);
        console.log(`Cleanup Verification: ${cleanRows.length === 0 ? 'CLEANED UP' : 'STILL PRESENT'}`);
    }

    await db.end();
    await browser.close();

    const chainComplete = (capturedRequest !== null) &&
                          (capturedResponse?.status === 200 || capturedResponse?.status === 201) &&
                          dbRecordExists &&
                          renderedInDom;

    console.log('\n=== END-TO-END PROOF VERDICT ===');
    console.log(`Full Chain Integrity: ${chainComplete ? 'PROVEN 100%' : 'CHAIN BROKEN'}`);
}

run().catch(console.error);
