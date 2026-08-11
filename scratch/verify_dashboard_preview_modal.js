import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function verifyDashboardPreviewModal() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

    // Inject localStorage before navigation
    await page.addInitScript(() => {
        const dummyDoc = {
            id: 'resume_bhaskar_babu',
            item: {
                firstname: 'Bhaskar',
                lastname: 'Babu',
                occupation: 'Senior Software Engineer',
                template: 'Cv2',
                created_at: { seconds: Math.floor(Date.now() / 1000) }
            },
            template: 'Cv2'
        };
        localStorage.setItem('currentResumeItem', JSON.stringify(dummyDoc.item));
        localStorage.setItem('userResumes', JSON.stringify([dummyDoc]));
        localStorage.setItem('selectedTemplate', 'Cv2');
        localStorage.setItem('currentResumeId', 'resume_bhaskar_babu');
    });

    console.log("Navigating to Dashboard with pre-injected resume state...");
    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // Screenshot of Dashboard with Card rendered
    const cardSsPath = path.join(artifactDir, `dashboard_card_middle_preview_verified.png`);
    await page.screenshot({ path: cardSsPath, fullPage: true });
    console.log("Saved dashboard_card_middle_preview_verified.png!");

    // Click on the preview box to open Full Size Preview Modal
    const previewBox = await page.$('.group\\/preview') || await page.$('.relative.h-72');
    if (previewBox) {
        console.log("Clicking Template Preview Box on Dashboard card...");
        await previewBox.click();
        await page.waitForTimeout(3000);

        const modalSsPath = path.join(artifactDir, `dashboard_full_size_preview_modal_opened.png`);
        await page.screenshot({ path: modalSsPath, fullPage: true });
        console.log("Saved dashboard_full_size_preview_modal_opened.png!");
    } else {
        console.log("Preview box element not found after wait!");
    }

    await browser.close();
}

verifyDashboardPreviewModal().catch(console.error);
