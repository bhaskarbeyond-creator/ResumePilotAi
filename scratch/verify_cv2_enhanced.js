import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function verifyCv2Enhanced() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1600 } });
    
    console.log("Navigating to Cv2 export view...");
    await page.goto('http://localhost:5173/export/Cv2/resume_1786032172991/en', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    let ssPath = path.join(artifactDir, `cv2_masterpiece_export.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved cv2_masterpiece_export.png!");

    // Also update Cv2.JPG thumbnail preview in assets
    const cv2ImgPath = "d:\\xampp\\htdocs\\ai-resume-builder\\src\\assets\\resumesNew\\Cv2.JPG";
    try {
        await page.screenshot({ path: cv2ImgPath });
        console.log("Updated Cv2.JPG thumbnail in assets!");
    } catch (e) {
        console.error("Failed to save Cv2.JPG:", e.message);
    }

    await browser.close();
}

verifyCv2Enhanced().catch(console.error);
