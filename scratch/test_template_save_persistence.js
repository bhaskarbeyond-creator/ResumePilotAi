import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function testTemplateSavePersistence() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    
    console.log("Navigating to create-resume page...");
    await page.goto('http://localhost:5173/create-resume', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Open template selection modal
    const changeBtn = await page.$('button:has-text("Change Template")');
    if (changeBtn) {
        console.log("Opening template modal...");
        await changeBtn.click();
        await page.waitForTimeout(1500);
    }

    // Click on template card in modal
    const cards = await page.$$('.template-card');
    if (cards && cards.length > 1) {
        console.log("Selecting Cv2 card in modal...");
        await cards[1].click();
        await page.waitForTimeout(2000);
    } else {
        const textCard = await page.$('div:has-text("Europass")') || await page.$('div:has-text("Modern Creative")');
        if (textCard) {
            await textCard.click();
            await page.waitForTimeout(2000);
        }
    }

    // Click "Save Resume State" button after modal is closed
    const saveBtn = await page.$('button:has-text("Save Resume State")') || await page.$('button:has-text("Resume Saved Completely!")');
    if (saveBtn) {
        console.log("Clicking Save Resume State button...");
        await saveBtn.click();
        await page.waitForTimeout(2500);
    }

    // Reload page to verify persistence
    console.log("Reloading page...");
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const ssPath = path.join(artifactDir, `template_persisted_after_reload.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved template_persisted_after_reload.png!");

    await browser.close();
}

testTemplateSavePersistence().catch(console.error);
