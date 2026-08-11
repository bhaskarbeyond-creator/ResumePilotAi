import { chromium } from 'playwright';

async function inspectBrowserResume() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    
    await page.goto('http://localhost:5173/export/Cv1/resume_1786032172991/en', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    const resumeData = await page.evaluate(() => {
        // Inspect the React props or window object if available
        const board = document.querySelector('#resumen');
        return {
            hasBoard: !!board,
            languagesText: board ? board.querySelector('.sectionLanguages')?.innerText : 'NONE',
            fullBoardText: board ? board.innerText : 'EMPTY'
        };
    });
    
    console.log('Browser Resume Data:', JSON.stringify(resumeData, null, 2));
    await browser.close();
}

inspectBrowserResume().catch(console.error);
