import { chromium } from 'playwright';
import path from 'path';

const artifactsDir = 'C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\fff200af-a201-4391-8082-ce332af72e59';

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('1. Navigating to /blog...');
  await page.goto('https://ai-resume-builder.local/blog', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const blogListPic = path.join(artifactsDir, 'blog_list_verified.png');
  await page.screenshot({ path: blogListPic, fullPage: false });
  console.log('✓ Captured blog list screenshot:', blogListPic);

  console.log('2. Navigating to /blog/how-to-beat-ats-in-2026...');
  await page.goto('https://ai-resume-builder.local/blog/how-to-beat-ats-in-2026', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const blogArticlePic = path.join(artifactsDir, 'blog_article_verified.png');
  await page.screenshot({ path: blogArticlePic, fullPage: false });
  console.log('✓ Captured blog article screenshot:', blogArticlePic);

  console.log('3. Navigating to Homepage Footer...');
  await page.goto('https://ai-resume-builder.local/', { waitUntil: 'networkidle' });
  const footerElement = await page.$('#rp-footer-main');
  if (footerElement) {
    const footerPic = path.join(artifactsDir, 'footer_clean_verified.png');
    await footerElement.screenshot({ path: footerPic });
    console.log('✓ Captured clean footer screenshot:', footerPic);
  }

  await browser.close();
  console.log('All screenshots captured successfully.');
}

captureScreenshots().catch(err => {
  console.error('Screenshot capture error:', err);
  process.exit(1);
});
