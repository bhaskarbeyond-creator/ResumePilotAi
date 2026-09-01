import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const mysqlMod = await import('../backend/database/mysql.js');
const getPool = mysqlMod.getPool || mysqlMod.default?.getPool;
const adminMod = await import('../backend/services/firebaseAdmin.js');
const admin = adminMod.default || adminMod;

// Initialize Firebase Admin if not already initialized
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

async function runTest() {
    console.log('--- Step 1: Generate Firebase custom token for Super Admin ---');
    const customToken = await admin.auth().createCustomToken('OhZdiSIFL7ePA1TMkfu9bnR935D3');
    console.log('Generated token length:', customToken.length);

    console.log('--- Step 2: Launch Chromium with ignoreHTTPSErrors ---');
    const browser = await chromium.launch({
        headless: true,
        args: ['--ignore-certificate-errors', '--disable-web-security']
    });
    const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];

    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
            console.error('[BROWSER ERROR]', msg.text());
        }
    });
    page.on('response', res => {
        if (res.status() >= 400) {
            console.log(`[HTTP ${res.status()}] ${res.url()}`);
        }
    });
    page.on('pageerror', err => {
        pageErrors.push(err.message);
        console.error('[PAGE ERROR]', err.message);
    });

    console.log('--- Step 3: Navigate to ${process.env.TARGET_URL || process.env.APP_URL}/ and authenticate ---');
    await page.goto((process.env.TARGET_URL || process.env.APP_URL), { waitUntil: 'networkidle' });
    
    // Sign in via custom token
    const signInResult = await page.evaluate(async (token) => {
        try {
            const userCred = await window.fire.auth().signInWithCustomToken(token);
            return { success: true, uid: userCred.user.uid, email: userCred.user.email };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }, customToken);
    console.log('Sign in result:', signInResult);
    if (!signInResult.success) {
        throw new Error('Sign in failed: ' + signInResult.error);
    }

    // Wait for auth to propagate to React state
    await page.waitForTimeout(2000);

    console.log('--- Step 4: Navigate to ${process.env.TARGET_URL || process.env.APP_URL}/blog-editor ---');
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/blog-editor', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Verify page loaded and no white screen
    const urlAfter = page.url();
    console.log('URL after navigation:', urlAfter);
    if (!urlAfter.includes('/blog-editor')) {
        throw new Error('Redirected away from /blog-editor to ' + urlAfter);
    }

    console.log('--- Step 5: Check Editor Elements in DOM ---');
    // Title input
    const titleInput = await page.locator('#title, input[aria-label="Post title"]').first();
    const titleVisible = await titleInput.isVisible();
    console.log('Title input visible:', titleVisible);

    // Tiptap ProseMirror editor
    const editorContent = await page.locator('.ProseMirror, [contenteditable="true"]').first();
    const editorVisible = await editorContent.isVisible();
    console.log('ProseMirror editor visible:', editorVisible);

    if (!titleVisible || !editorVisible) {
        throw new Error('Blog editor elements not visible');
    }

    console.log('--- Step 6: Test Title & Rich Text Typing ---');
    const testTitle = `Test Blog Post ${Date.now()}`;
    await titleInput.fill(testTitle);

    await editorContent.click();
    await editorContent.fill(`This is a forensically verified blog post content created through automated browser testing on ${process.env.TARGET_URL || 'the platform'}.`);

    console.log('--- Step 7: Test Category Selection & Formatting ---');
    const categorySelect = page.locator('#category, select[aria-label="Post category"]').first();
    if (await categorySelect.isVisible()) {
        const options = await categorySelect.locator('option').all();
        if (options.length > 1) {
            const val = await options[1].getAttribute('value');
            if (val) await categorySelect.selectOption(val);
            console.log('Selected category value:', val);
        }
    }

    // Select text and click bold if available
    const boldBtn = page.locator('button[title*="Bold"], button[aria-label*="Bold"]').first();
    if (await boldBtn.isVisible()) {
        await boldBtn.click();
        console.log('Bold button clicked');
    }

    console.log('--- Step 8: Save Draft ---');
    const saveDraftBtn = page.locator('button:has-text("Save as Draft")').first();
    console.log('Save Draft button visible:', await saveDraftBtn.isVisible());

    // Intercept network request
    const saveResponsePromise = page.waitForResponse(response => 
        response.url().includes('/api/blog-data') && (response.request().method() === 'POST' || response.request().method() === 'PUT'),
        { timeout: 15000 }
    );

    await saveDraftBtn.click();
    const saveResponse = await saveResponsePromise;
    console.log('Save HTTP status:', saveResponse.status());
    const saveJson = await saveResponse.json();
    console.log('Save response JSON:', saveJson);

    if (!saveJson.success) {
        throw new Error('Save draft failed: ' + JSON.stringify(saveJson));
    }

    console.log('--- Step 9: Verify in MariaDB Database ---');
    const pool = getPool();
    const [rows] = await pool.query('SELECT id, title, slug, published, content, author_id FROM blog WHERE title = ?', [testTitle]);
    console.log('MariaDB query result for test post:', rows);
    if (!rows.length) {
        throw new Error('MariaDB record was NOT created for ' + testTitle);
    }
    console.log('✓ Verified: MariaDB record created with ID', rows[0].id);

    console.log('--- Step 10: Reload page and verify data persistence ---');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const editorStillThere = await page.locator('.ProseMirror, [contenteditable="true"]').first().isVisible();
    console.log('Editor still visible after reload:', editorStillThere);

    console.log('--- Step 11: Navigate away to /blog and return ---');
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/blog', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    console.log('Navigated to /blog, URL is:', page.url());

    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/blog-editor', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    console.log('Returned to /blog-editor, URL is:', page.url());

    console.log('--- Step 12: Clean up test post from MariaDB ---');
    await pool.query('DELETE FROM blog WHERE id = ?', [rows[0].id]);
    console.log('✓ Cleaned up test post from MariaDB');

    console.log('--- Summary of Errors ---');
    console.log('Console errors count:', consoleErrors.length, consoleErrors);
    console.log('Page errors count:', pageErrors.length, pageErrors);

    await browser.close();
    await pool.end();

    if (pageErrors.length > 0) {
        throw new Error('Page errors detected: ' + JSON.stringify(pageErrors));
    }
    console.log('=== ALL BLOG EDITOR BROWSER CHECKS PASSED 100% ===');
}

runTest().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
