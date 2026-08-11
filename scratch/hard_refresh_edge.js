import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function hardRefreshEdge() {
    console.log("Launching Microsoft Edge with fresh session...");
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true
    });
    
    await context.clearCookies();
    const page = await context.newPage();
    
    console.log("Navigating to http://localhost:5173/create-resume...");
    await page.goto('http://localhost:5173/create-resume', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    
    console.log("Performing hard reload...");
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    
    // Open Choose Template Modal
    const changeBtn = await page.$('button:has-text("Change Template")') || await page.$('button:has-text("Template")');
    if (changeBtn) {
        console.log("Opening Choose Template modal...");
        await changeBtn.click();
        await page.waitForTimeout(1500);
    }
    
    // Type Professional Classic into search
    const searchInput = await page.$('input[placeholder*="Search"]');
    if (searchInput) {
        console.log("Filtering by 'Professional Classic'...");
        await searchInput.fill('Professional Classic');
        await page.waitForTimeout(1500);
    }
    
    let ssPath = path.join(artifactDir, `edge_modal_hard_refreshed.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved edge_modal_hard_refreshed.png!");

    // Click on Cv1 card
    const cv1Card = await page.$('div:has-text("Professional Classic")') || await page.$('.template-card');
    if (cv1Card) {
        console.log("Selecting Cv1 card...");
        await cv1Card.click();
        await page.waitForTimeout(2000);
    }
    
    ssPath = path.join(artifactDir, `edge_cv1_selected_page.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved edge_cv1_selected_page.png!");

    await browser.close();
}

hardRefreshEdge().catch(console.error);
