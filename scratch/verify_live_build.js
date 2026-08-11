import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function runLiveBuildVerification() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    
    console.log("Navigating to BuildResume page...");
    await page.goto('http://localhost:5173/build/Cv1/resume_1786032172991/en', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    const ssPath = path.join(artifactDir, `live_build_resume_page.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved live build resume screenshot!");
    await browser.close();
}

runLiveBuildVerification().catch(console.error);
