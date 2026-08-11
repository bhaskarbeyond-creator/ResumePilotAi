import { chromium } from 'playwright';

async function updateFirestoreResumeLanguages() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    
    // Go to build route to access app's module context
    await page.goto('http://localhost:5173/build/Cv1/resume_1786032172991/en', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    const result = await page.evaluate(() => {
        try {
            const rawData = localStorage.getItem('resume_resume_1786032172991') || localStorage.getItem('resumeData');
            if (rawData) {
                const parsed = JSON.parse(rawData);
                parsed.languages = [
                    { name: 'English', level: 'Native / Bilingual' },
                    { name: 'Hindi', level: 'Full Professional' },
                    { name: 'Telugu', level: 'Native / Bilingual' }
                ];
                localStorage.setItem('resume_resume_1786032172991', JSON.stringify(parsed));
                localStorage.setItem('resumeData', JSON.stringify(parsed));
                return { success: true, languages: parsed.languages };
            }
            return { success: false, reason: 'No local storage resume data' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    console.log('Update result:', JSON.stringify(result, null, 2));
    await browser.close();
}

updateFirestoreResumeLanguages().catch(console.error);
