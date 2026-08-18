import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

async function inspectPreviews() {
  const dir = path.resolve('src/assets/resumesNew');
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.jpg'));
  console.log(`Found ${files.length} JPG files in src/assets/resumesNew`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const results = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    const base64 = fs.readFileSync(filePath).toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    await page.setContent(`<img id="target" src="${dataUrl}" />`);
    const dims = await page.evaluate(() => {
      const img = document.getElementById('target');
      return { width: img.naturalWidth, height: img.naturalHeight };
    });

    results.push({ file, ...dims, size: fs.statSync(filePath).size });
  }

  await browser.close();

  console.log('Sample of current preview dimensions:');
  console.table(results.slice(0, 15));

  // Find variation in dimensions
  const widths = new Set(results.map(r => r.width));
  const heights = new Set(results.map(r => r.height));
  console.log('\nUnique Widths:', [...widths]);
  console.log('Unique Heights:', [...heights]);
}

inspectPreviews().catch(console.error);
