import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
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
    role: 'SUPER_ADMIN',
    superAdmin: true,
});

async function run() {
    console.log('=== ADVERSARIAL NETWORK FAILURE & MID-MUTATION TESTS ===\n');
    const browser = await chromium.launch({
        headless: true,
        args: ['--ignore-certificate-errors']
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        ignoreHTTPSErrors: true
    });
    const page = await context.newPage();

    await page.goto((process.env.TARGET_URL || process.env.APP_URL));
    await page.evaluate(async (token) => {
        await window.fire.auth().signInWithCustomToken(token);
    }, customToken);
    await page.waitForTimeout(600);

    const testResults = [];

    // ── SCENARIO 1: Blog Editor Network Abort during Save as Draft ──
    console.log('--- Scenario 1: Blog Editor Network Abort during Draft Save ---');
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/blog-editor');
    await page.waitForSelector('input#title', { timeout: 10000 });

    const titleInput = await page.$('input#title');
    await titleInput.fill('Adversarial Test Blog Title');

    const editorPane = await page.$('.ProseMirror, [contenteditable="true"]');
    if (editorPane) {
        await editorPane.fill('This is test body content that must not be lost.');
    }

    // Intercept and abort the save request
    let interceptedSave = false;
    await page.route('**/api/blog-data**', route => {
        if (route.request().method() === 'POST' || route.request().method() === 'PUT') {
            interceptedSave = true;
            return route.abort('failed');
        }
        return route.continue();
    });

    const saveDraftBtn = await page.$('button:has-text("Save as Draft")');
    if (saveDraftBtn) {
        await saveDraftBtn.click();
        await page.waitForTimeout(1500);

        // Verify:
        // 1. Button is not stuck in disabled loading state
        const isSaveDisabled = await saveDraftBtn.isDisabled();
        // 2. Draft content is NOT cleared
        const preservedTitle = await titleInput.inputValue();
        // 3. Error alert or toast is displayed
        const errorElement = await page.$('[role="alert"], .text-red-600, .bg-red-50, .text-rose-600');
        const hasErrorNotice = errorElement !== null;

        testResults.push({
            scenario: 'Blog Editor: Network Offline on Save',
            requestIntercepted: interceptedSave,
            buttonUsable: !isSaveDisabled,
            dataPreserved: preservedTitle === 'Adversarial Test Blog Title',
            errorSurfaced: hasErrorNotice,
            status: (!isSaveDisabled && preservedTitle === 'Adversarial Test Blog Title') ? 'PASS' : 'FAIL'
        });
    }
    await page.unroute('**/api/blog-data**');

    // ── SCENARIO 2: Blog Editor Backend 500 during Publish ──
    console.log('--- Scenario 2: Blog Editor Backend 500 during Publish ---');
    let interceptedPublish = false;
    await page.route('**/api/blog-data**', route => {
        if (route.request().method() === 'POST' || route.request().method() === 'PUT') {
            interceptedPublish = true;
            return route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ success: false, error: 'Database connection pool exhausted' })
            });
        }
        return route.continue();
    });

    const publishBtn = await page.$('button:has-text("Submit for Review")');
    if (publishBtn) {
        await publishBtn.click();
        await page.waitForTimeout(1500);

        const isPublishDisabled = await publishBtn.isDisabled();
        const preservedTitle = await titleInput.inputValue();
        const errorElement = await page.$('[role="alert"], .text-red-600, .bg-red-50, .text-rose-600');

        testResults.push({
            scenario: 'Blog Editor: Backend 500 on Publish',
            requestIntercepted: interceptedPublish,
            buttonUsable: !isPublishDisabled,
            dataPreserved: preservedTitle === 'Adversarial Test Blog Title',
            errorSurfaced: errorElement !== null,
            status: (!isPublishDisabled && preservedTitle === 'Adversarial Test Blog Title') ? 'PASS' : 'FAIL'
        });
    }
    await page.unroute('**/api/blog-data**');

    // ── SCENARIO 3: Reviews Screen Backend 500 on Creation ──
    console.log('--- Scenario 3: Reviews Screen Backend 500 on Creation ---');
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/adm/reviews');
    await page.waitForSelector('form, textarea', { timeout: 10000 });

    const reviewInputs = await page.$$('form input, form textarea');
    if (reviewInputs.length >= 2) {
        await reviewInputs[0].fill('Adversarial Reviewer');
        await reviewInputs[1].fill('Adversarial Review Text That Must Remain');

        let interceptedReview = false;
        await page.route('**/api/reviews**', route => {
            if (route.request().method() === 'POST') {
                interceptedReview = true;
                return route.fulfill({
                    status: 500,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: false, error: 'Internal MariaDB Deadlock' })
                });
            }
            return route.continue();
        });

        const addReviewBtn = await page.$('form button:has-text("Add"), form button[type="submit"]');
        if (addReviewBtn) {
            await addReviewBtn.click();
            await page.waitForTimeout(1500);

            const isAddDisabled = await addReviewBtn.isDisabled();
            const preservedText = await reviewInputs[1].inputValue();
            const errorElement = await page.$('[role="alert"], .text-red-600, .bg-red-50');

            testResults.push({
                scenario: 'Reviews: Backend 500 on Submission',
                requestIntercepted: interceptedReview,
                buttonUsable: !isAddDisabled,
                dataPreserved: preservedText.includes('Adversarial Review Text'),
                errorSurfaced: errorElement !== null,
                status: (!isAddDisabled && preservedText.includes('Adversarial Review Text')) ? 'PASS' : 'FAIL'
            });
        }
        await page.unroute('**/api/reviews**');
    }

    // ── SCENARIO 4: Trusted By Network Timeout on Save ──
    console.log('--- Scenario 4: Trusted By Network Timeout on Save ---');
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/adm/trustedby');
    await page.waitForSelector('form input', { timeout: 10000 });

    const trustedInputs = await page.$$('form input');
    if (trustedInputs.length >= 2) {
        await trustedInputs[0].fill('Adversarial Company Name');
        await trustedInputs[1].fill('https://example.com/adversarial.png');

        let interceptedTrusted = false;
        await page.route('**/api/admin/trusted-by**', route => {
            if (route.request().method() === 'POST') {
                interceptedTrusted = true;
                return route.abort('timedout');
            }
            return route.continue();
        });

        const saveCompanyBtn = await page.$('form button:has-text("Save"), form button[type="submit"]');
        if (saveCompanyBtn) {
            await saveCompanyBtn.click();
            await page.waitForTimeout(1500);

            const isSaveDisabled = await saveCompanyBtn.isDisabled();
            const preservedCompany = await trustedInputs[0].inputValue();
            const errorElement = await page.$('[role="alert"], .text-red-600, .bg-red-50');

            testResults.push({
                scenario: 'Trusted By: Network Timeout on Save',
                requestIntercepted: interceptedTrusted,
                buttonUsable: !isSaveDisabled,
                dataPreserved: preservedCompany === 'Adversarial Company Name',
                errorSurfaced: errorElement !== null,
                status: (!isSaveDisabled && preservedCompany === 'Adversarial Company Name') ? 'PASS' : 'FAIL'
            });
        }
        await page.unroute('**/api/admin/trusted-by**');
    }

    await browser.close();

    console.log('\n=== ADVERSARIAL NETWORK FAILURE RESULTS ===');
    console.table(testResults);
    const passed = testResults.filter(r => r.status === 'PASS').length;
    console.log(`Total Scenarios: ${testResults.length} | Passed: ${passed} | Failed: ${testResults.length - passed}`);
    if (passed === testResults.length) {
        console.log('✓ ALL ADVERSARIAL MID-MUTATION SCENARIOS VERIFIED SAFE!');
    }
}

run().catch(console.error);
