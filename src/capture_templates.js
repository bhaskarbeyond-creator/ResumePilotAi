import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";
const resumeId = "resume_1786032172991";
const language = "en";

const templates = ['Cv1'];

async function run() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });

    for (const tpl of templates) {
        const page = await context.newPage();
        
        const url = `http://localhost:5173/export/${tpl}/${resumeId}/${language}`;
        console.log(`\nCapturing ${tpl} preview with candidate's EXACT screenshot data...`);
        
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            
            // Set candidate's exact input from their screenshot
            await page.evaluate(() => {
                const userExactLanguages = [
                    { id: 'lang_1', name: 'English', language: 'English', level: 'Professional Working (Advanced)' },
                    { id: 'lang_2', name: 'Telugu', language: 'Telugu', level: 'Native / Bilingual' },
                    { id: 'lang_3', name: 'Hindi', language: 'Hindi', level: 'Limited Working (Intermediate)' }
                ];
                
                const existing = localStorage.getItem('resumeData');
                let parsed = existing ? JSON.parse(existing) : {};
                parsed.languages = userExactLanguages;
                localStorage.setItem('resumeData', JSON.stringify(parsed));
                localStorage.setItem('currentResumeItem', JSON.stringify(parsed));
            });

            // Reload page so Exporter picks up exact candidate inputs
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);

            const resumeElement = await page.$('#resumen') || await page.$('.cv1-board');
            const ssPath = path.join(artifactDir, `template_${tpl.toLowerCase()}.png`);
            
            if (resumeElement) {
                await resumeElement.screenshot({ path: ssPath });
            } else {
                await page.screenshot({ path: ssPath, fullPage: true });
            }
            console.log(`  Saved: template_${tpl.toLowerCase()}.png`);
        } catch (err) {
            console.log(`  Failed ${tpl}: ${err.message}`);
        }
        
        await page.close();
    }

    await browser.close();
}

run().catch(err => console.error("Fatal error:", err));
