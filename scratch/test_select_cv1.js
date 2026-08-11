import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function testSelectCv1() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    
    console.log("Navigating to BuildResume page...");
    await page.goto('http://localhost:5173/build/Cv1/resume_1786032172991/en', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Check initial board class and content
    const initialBoardClass = await page.evaluate(() => {
        const board = document.querySelector('#resumen');
        return board ? board.className : 'NOT_FOUND';
    });
    console.log("Initial Board Class:", initialBoardClass);

    // Open template modal
    console.log("Opening template modal...");
    const modalBtn = await page.$('button:has-text("Template")') || await page.$('button:has-text("Choose")') || await page.$('[data-testid="choose-template"]');
    if (modalBtn) {
        await modalBtn.click();
        await page.waitForTimeout(1000);
    }

    // Type "Professional Classic" into search
    const searchInput = await page.$('input[placeholder*="Search"]') || await page.$('input[type="text"]');
    if (searchInput) {
        await searchInput.fill("Professional Classic");
        await page.waitForTimeout(1000);
    }

    // Click on the first template card (Cv1)
    const firstCard = await page.$('.template-card') || await page.$('div:has-text("Professional Classic")');
    if (firstCard) {
        console.log("Clicking on Professional Classic template card...");
        await firstCard.click();
        await page.waitForTimeout(2000);
    }

    const updatedBoardClass = await page.evaluate(() => {
        const board = document.querySelector('#resumen');
        return board ? board.className : 'NOT_FOUND';
    });
    console.log("Updated Board Class after selection:", updatedBoardClass);

    const ssPath = path.join(artifactDir, `build_page_cv1_selected.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved screenshot: build_page_cv1_selected.png");

    await browser.close();
}

testSelectCv1().catch(console.error);
