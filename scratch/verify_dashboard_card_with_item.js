import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function verifyDashboardCardWithItem() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
    
    console.log("Navigating to Dashboard...");
    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
        const dummyDoc = {
            id: 'resume_1786049900000',
            item: {
                firstname: 'Bhaskar',
                lastname: 'Babu',
                created_at: { seconds: Math.floor(Date.now() / 1000) }
            }
        };
        // Inject into localStorage so dashboard picks up documents
        localStorage.setItem('user', 'test_user_id');
        localStorage.setItem('currentResumeItem', JSON.stringify(dummyDoc.item));
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const ssPath = path.join(artifactDir, `dashboard_card_rendered_with_preview.png`);
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved dashboard_card_rendered_with_preview.png!");

    await browser.close();
}

verifyDashboardCardWithItem().catch(console.error);
