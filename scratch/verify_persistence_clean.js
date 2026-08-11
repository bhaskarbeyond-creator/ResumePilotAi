import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function verifyPersistenceClean() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    
    console.log("Navigating to create-resume...");
    await page.goto('http://localhost:5173/create-resume', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Set selectedTemplate to Cv2 in localStorage & click save
    await page.evaluate(() => {
        localStorage.setItem('selectedTemplate', 'Cv2');
        const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Save Resume'));
        if (saveBtn) saveBtn.click();
    });
    await page.waitForTimeout(2000);

    // Reload page
    console.log("Reloading page...");
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const savedTemplateInStorage = await page.evaluate(() => localStorage.getItem('selectedTemplate'));
    console.log("Saved template in localStorage after reload:", savedTemplateInStorage);

    const ssPath = path.join(artifactDir, `cv2_persisted_clean_reload.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved cv2_persisted_clean_reload.png!");

    await browser.close();
}

verifyPersistenceClean().catch(console.error);
