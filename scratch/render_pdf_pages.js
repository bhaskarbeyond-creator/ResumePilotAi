import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function renderPdfPages() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });

    const pdfPath = path.join(artifactDir, 'downloaded_pdf_export_test.pdf');
    const fileUrl = 'file:///' + pdfPath.replace(/\\/g, '/');

    console.log("Opening PDF in browser...");
    await page.goto(fileUrl);
    await page.waitForTimeout(2000);

    // Scroll down to show page 2
    await page.evaluate(() => {
        const viewer = document.querySelector('embed') || document.querySelector('iframe') || window;
        window.scrollBy(0, 1100);
    });
    await page.waitForTimeout(1000);

    const pdfSsPath = path.join(artifactDir, `rendered_downloaded_pdf_page2_preview.png`);
    await page.screenshot({ path: pdfSsPath, fullPage: true });
    console.log("Saved rendered_downloaded_pdf_page2_preview.png!");

    await browser.close();
}

renderPdfPages().catch(console.error);
