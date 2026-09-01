import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'mobile-375', width: 375, height: 667 }
  ];

  if (!fs.existsSync('test-results/audit-screenshots')) {
    fs.mkdirSync('test-results/audit-screenshots', { recursive: true });
  }

  for (const vp of viewports) {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: vp.width, height: vp.height }
    });
    const page = await context.newPage();
    const consoleLogs = [];
    page.on('console', msg => consoleLogs.push(msg.text()));
    page.on('pageerror', err => consoleLogs.push('PAGE_ERROR: ' + err.message));

    await page.goto('https://ai-resume-builder.local/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const shotPath = `test-results/audit-screenshots/homepage-${vp.name}.png`;
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log(`Captured ${vp.name} to ${shotPath}`);

    if (vp.name === 'desktop-1440') {
      const pageData = await page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll('nav, section, footer')).map(el => ({
          tagName: el.tagName,
          id: el.id,
          classes: el.className,
          rect: { width: el.offsetWidth, height: el.offsetHeight }
        }));
        const images = Array.from(document.querySelectorAll('img')).map(img => ({
          src: img.src,
          alt: img.alt,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          displayedWidth: img.offsetWidth,
          displayedHeight: img.offsetHeight
        }));
        const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => ({
          tag: h.tagName,
          text: h.textContent.trim().replace(/\s+/g, ' ')
        }));
        return { sections, images, headings };
      });
      console.log('--- Page Data ---');
      console.log('Headings:', JSON.stringify(pageData.headings, null, 2));
      console.log('Images count:', pageData.images.length);
      console.log('Images sample:', JSON.stringify(pageData.images.slice(0, 10), null, 2));
    }
    await context.close();
  }

  await browser.close();
  console.log('Audit capture completed successfully.');
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
