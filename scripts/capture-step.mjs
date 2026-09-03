import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'node:path';

const step = process.argv[2] || 'work-history';
const width = parseInt(process.argv[3] || '1440', 10);
const height = parseInt(process.argv[4] || '900', 10);

async function main() {
    const server = await createServer({
        server: { port: 51795 },
    });
    await server.listen();
    const url = `http://localhost:51795/template-lab/builder-preview.html?step=${step}`;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width, height } });

    console.log(`Navigating to ${url} at ${width}x${height}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const shotName = `step-${step}-${width}.png`;
    const shotPath = path.resolve(`test-results/${shotName}`);
    await page.screenshot({ path: shotPath, fullPage: false });
    console.log('Screenshot saved to:', shotPath);

    await browser.close();
    await server.close();
}

main().catch(console.error);
