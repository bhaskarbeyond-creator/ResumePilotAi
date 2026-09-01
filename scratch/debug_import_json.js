require('dotenv').config({ path: './backend/.env' });
import { chromium } from 'playwright';
import path from 'path';

(async () => {
    console.log('=== DEEP DIAGNOSTIC: Resume Import Debug ===');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Capture ALL console messages
    const consoleLogs = [];
    page.on('console', msg => {
        const text = msg.text();
        consoleLogs.push({ type: msg.type(), text });
        if (text.includes('Temp resume JSON') || text.includes('Failsafe') || text.includes('NVIDIA') || text.includes('Gemini') || text.includes('parser error') || text.includes('sessionStorage')) {
            console.log(`[BROWSER ${msg.type().toUpperCase()}] ${text}`);
        }
    });

    // Set auth
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/dashboard', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
        localStorage.setItem('user', 'e2e_test_user_777');
    });

    // Navigate with import=true
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/build-resume/heading?import=true', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Upload file
    const filePath = 'C:\\Users\\mbhas\\Downloads\\Bhaskar_Resume_Manager (1).txt';
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePath);
    console.log('✔ File uploaded');

    // Wait for parsing
    console.log('⏳ Waiting for AI parsing...');
    await page.waitForTimeout(10000);

    // Check sessionStorage
    const tempJson = await page.evaluate(() => {
        try {
            return JSON.parse(sessionStorage.getItem('temp_imported_resume_json'));
        } catch(e) { return null; }
    });

    console.log('\n═══════════════════════════════════════');
    console.log('  EXTRACTED TEMP JSON DATA:');
    console.log('═══════════════════════════════════════');
    console.log(JSON.stringify(tempJson, null, 2));

    await browser.close();
    console.log('\n=== DIAGNOSTIC COMPLETE ===');
})();
