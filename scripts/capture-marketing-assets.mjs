import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function captureProductAssets() {
  const outputDir = path.resolve('public/images/marketing');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();

  console.log('Capturing real product routes...');

  // 1. Resume Builder / Template Gallery
  try {
    await page.goto('https://ai-resume-builder.local/build-resume/heading', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outputDir, 'product-resume-builder.png') });
    console.log('✓ Captured product-resume-builder.png');
  } catch (e) {
    console.warn('Builder capture skipped:', e.message);
  }

  // 2. Portfolios Gallery
  try {
    await page.goto('https://ai-resume-builder.local/portfolios', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outputDir, 'product-portfolio-gallery.png') });
    console.log('✓ Captured product-portfolio-gallery.png');
  } catch (e) {
    console.warn('Portfolio capture skipped:', e.message);
  }

  // 3. Cover Letter
  try {
    await page.goto('https://ai-resume-builder.local/cover-letter', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outputDir, 'product-cover-letter.png') });
    console.log('✓ Captured product-cover-letter.png');
  } catch (e) {
    console.warn('Cover letter capture skipped:', e.message);
  }

  // 4. CV Template Preview (Cv1)
  try {
    await page.goto('https://ai-resume-builder.local/export/Cv1/demo/en', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outputDir, 'product-cv-template.png') });
    console.log('✓ Captured product-cv-template.png');
  } catch (e) {
    console.warn('CV template capture skipped:', e.message);
  }

  await browser.close();
  console.log('Marketing asset capture completed.');
}

captureProductAssets().catch(console.error);
