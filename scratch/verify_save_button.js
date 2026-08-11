import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function verifySaveButton() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    
    console.log("Navigating to create-resume page...");
    await page.goto('http://localhost:5173/create-resume', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Screenshot of initial sidebar with Save Resume State button
    let ssPath = path.join(artifactDir, `sidebar_save_button_initial.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved sidebar_save_button_initial.png!");

    // Click "Save Resume State" button
    const saveBtn = await page.$('button:has-text("Save Resume State")');
    if (saveBtn) {
        console.log("Clicking Save Resume State button...");
        await saveBtn.click();
        await page.waitForTimeout(1000);

        ssPath = path.join(artifactDir, `sidebar_save_button_clicked.png`);
        await page.screenshot({ path: ssPath, fullPage: true });
        console.log("Saved sidebar_save_button_clicked.png!");
    } else {
        console.log("Save Resume State button not found!");
    }

    await browser.close();
}

verifySaveButton().catch(console.error);
