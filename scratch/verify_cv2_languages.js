import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function verifyCv2Languages() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

    await page.addInitScript(() => {
        const dummyDoc = {
            id: 'resume_bhaskar_babu',
            item: {
                firstname: 'Bhaskar',
                lastname: 'Babu',
                occupation: 'Senior Software Engineer',
                template: 'Cv2',
                languages: [
                    { name: 'English', level: 'Professional Working (Advanced)' },
                    { name: 'Telugu', level: 'Native / Bilingual' },
                    { name: 'Hindi', level: 'Limited Working (Intermediate)' }
                ]
            },
            template: 'Cv2'
        };
        localStorage.setItem('currentResumeItem', JSON.stringify(dummyDoc.item));
        localStorage.setItem('userResumes', JSON.stringify([dummyDoc]));
        localStorage.setItem('selectedTemplate', 'Cv2');
        localStorage.setItem('currentResumeId', 'resume_bhaskar_babu');
    });

    console.log("Navigating to Dashboard...");
    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const previewBox = await page.$('.group\\/preview') || await page.$('.relative.h-72');
    if (previewBox) {
        console.log("Opening preview modal...");
        await previewBox.click();
        await page.waitForTimeout(2500);

        const modalSsPath = path.join(artifactDir, `cv2_languages_fixed_verified.png`);
        await page.screenshot({ path: modalSsPath, fullPage: true });
        console.log("Saved cv2_languages_fixed_verified.png!");
    } else {
        console.log("Preview box element not found!");
    }

    await browser.close();
}

verifyCv2Languages().catch(console.error);
