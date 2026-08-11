import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function verifyDashboardPreviewFixed() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    
    console.log("Navigating to Dashboard...");
    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Inject document with item and template
    await page.evaluate(() => {
        const dummyDoc = {
            id: 'resume_1786049900000',
            template: 'Cv2',
            item: {
                firstname: 'Bhaskar',
                lastname: 'Babu',
                occupation: 'Senior Software Engineer',
                template: 'Cv2',
                created_at: { seconds: Math.floor(Date.now() / 1000) }
            }
        };
        localStorage.setItem('user', 'test_user_id');
        localStorage.setItem('currentResumeItem', JSON.stringify(dummyDoc.item));
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const ssPath = path.join(artifactDir, `dashboard_preview_fixed_verified.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved dashboard_preview_fixed_verified.png!");

    await browser.close();
}

verifyDashboardPreviewFixed().catch(console.error);
