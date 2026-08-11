import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function verifyCreateResumeRoute() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    
    console.log("Navigating to http://localhost:5173/create-resume...");
    await page.goto('http://localhost:5173/create-resume', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    
    const boardText = await page.evaluate(() => {
        const board = document.querySelector('#resumen');
        return board ? board.innerText.substring(0, 200) : 'NO_BOARD_FOUND';
    });
    console.log("Board Text Snippet:", boardText);

    const ssPath = path.join(artifactDir, `create_resume_verification.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved create_resume_verification.png!");
    
    await browser.close();
}

verifyCreateResumeRoute().catch(console.error);
