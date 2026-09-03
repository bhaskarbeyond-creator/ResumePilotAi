import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';

async function main() {
    const server = await createServer({
        server: { port: 51794 },
    });
    await server.listen();
    const url = 'http://localhost:51794/template-lab/builder-preview.html?step=heading';

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const shotPath = path.resolve('test-results/current-heading-1440.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log('Screenshot saved to:', shotPath);

    await browser.close();
    await server.close();
}

main().catch(console.error);
