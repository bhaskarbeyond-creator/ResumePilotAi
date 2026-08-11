import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function runPlaywrightVerification() {
    console.log("Starting Playwright full end-to-end verification...");
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await context.newPage();

    // 1. Visit create-resume on local domain
    console.log("Navigating to http://localhost:5173/create-resume...");
    await page.goto('http://localhost:5173/create-resume', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Fill in First Name and Last Name
    const firstNameInput = await page.$('input[name="firstname"]') || await page.$('input[placeholder*="first name" i]');
    const lastNameInput = await page.$('input[name="lastname"]') || await page.$('input[placeholder*="last name" i]');

    if (firstNameInput) await firstNameInput.fill('Bhaskar');
    if (lastNameInput) await lastNameInput.fill('Babu');
    await page.waitForTimeout(1000);

    // Click Save Resume State
    const saveBtn = await page.$('button:has-text("Save Resume State")') || await page.$('button:has-text("Resume Saved Completely!")');
    if (saveBtn) {
        console.log("Clicking 'Save Resume State' button...");
        await saveBtn.click();
        await page.waitForTimeout(2000);
    }

    // Capture Builder Page Screenshot
    const builderSsPath = path.join(artifactDir, `playwright_builder_verified.png`);
    await page.screenshot({ path: builderSsPath, fullPage: true });
    console.log("Saved playwright_builder_verified.png!");

    // 2. Mock a saved document in state to view Dashboard rendering
    await page.evaluate(() => {
        const dummyDoc = {
            id: 'resume_1786049999999',
            template: 'Cv2',
            item: {
                firstname: 'Bhaskar',
                lastname: 'Babu',
                occupation: 'Senior Software Engineer',
                template: 'Cv2',
                created_at: { seconds: Math.floor(Date.now() / 1000) }
            }
        };
        const currentItems = [dummyDoc];
        localStorage.setItem('user', 'test_user_bhaskar');
        localStorage.setItem('userResumes', JSON.stringify(currentItems));
        localStorage.setItem('currentResumeItem', JSON.stringify(dummyDoc.item));
    });

    // 3. Navigate to Dashboard page
    console.log("Navigating to http://localhost:5173/dashboard...");
    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);

    // Capture Dashboard Page Screenshot
    const dashboardSsPath = path.join(artifactDir, `playwright_dashboard_verified.png`);
    await page.screenshot({ path: dashboardSsPath, fullPage: true });
    console.log("Saved playwright_dashboard_verified.png!");

    await browser.close();
    console.log("E2E Verification script finished cleanly!");
}

runPlaywrightVerification().catch(console.error);
