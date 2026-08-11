import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function renderCv2() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
    
    console.log("Navigating to Cv2 export view...");
    await page.goto('http://localhost:5173/export/Cv2/resume_1786032172991/en', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    const ssPath = path.join(artifactDir, `cv2_initial_preview.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved cv2_initial_preview.png!");

    await browser.close();
}

renderCv2().catch(console.error);
