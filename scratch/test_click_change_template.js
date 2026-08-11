import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function testClickChangeTemplate() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    
    console.log("Navigating to http://localhost:5173/create-resume...");
    await page.goto('http://localhost:5173/create-resume', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Click "Change Template" button
    const changeBtn = await page.$('button:has-text("Change Template")');
    if (changeBtn) {
        console.log("Clicking 'Change Template' button...");
        await changeBtn.click();
        await page.waitForTimeout(1500);
    }
    
    let ssPath = path.join(artifactDir, `modal_opened.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved modal_opened.png!");

    // Search for "Professional Classic"
    const searchInput = await page.$('input[placeholder*="Search"]');
    if (searchInput) {
        console.log("Searching for 'Professional Classic'...");
        await searchInput.fill('Professional Classic');
        await page.waitForTimeout(1000);
    }

    ssPath = path.join(artifactDir, `modal_searched.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved modal_searched.png!");

    // Click on the first card (Cv1)
    const firstCard = await page.$('div.template-card') || await page.$('button:has-text("Cv1")') || await page.$('div:has-text("Professional Classic")');
    if (firstCard) {
        console.log("Clicking first template card...");
        await firstCard.click();
        await page.waitForTimeout(2000);
    }

    ssPath = path.join(artifactDir, `template_selected_live.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved template_selected_live.png!");

    await browser.close();
}

testClickChangeTemplate().catch(console.error);
