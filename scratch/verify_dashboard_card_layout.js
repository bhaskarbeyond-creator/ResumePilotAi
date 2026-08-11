import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function verifyDashboardCardLayout() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    
    console.log("Navigating to Dashboard...");
    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const ssPath = path.join(artifactDir, `dashboard_card_preview_middle.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved dashboard_card_preview_middle.png!");

    await browser.close();
}

verifyDashboardCardLayout().catch(console.error);
