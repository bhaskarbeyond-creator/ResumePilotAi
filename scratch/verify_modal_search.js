import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function verifyModalSearch() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    
    await page.goto('http://localhost:5173/create-resume', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    
    const changeBtn = await page.$('button:has-text("Change Template")');
    if (changeBtn) {
        await changeBtn.click();
        await page.waitForTimeout(1500);
    }
    
    const ssPath = path.join(artifactDir, `cv_number_cards.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved cv_number_cards.png!");
    await browser.close();
}

verifyModalSearch().catch(console.error);
