import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function testLocalDomain() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    
    console.log("Testing http://ai-resume-builder.local/export/Cv1/resume_1786032172991/en...");
    
    try {
        await page.goto('http://ai-resume-builder.local/export/Cv1/resume_1786032172991/en', { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(2000);
        
        const ssPath = path.join(artifactDir, `local_domain_cv1_export.png`);
        await page.screenshot({ path: ssPath, fullPage: true });
        console.log("Saved local_domain_cv1_export.png!");
    } catch (err) {
        console.log("Error testing local domain:", err.message);
    }

    await browser.close();
}

testLocalDomain().catch(console.error);
