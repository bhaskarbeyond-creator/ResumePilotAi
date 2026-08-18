import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function inspectSplit() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });

  // Load Cv1 and Cv51 in preview/lab mode
  for (const cvId of ['Cv1', 'Cv51', 'Cv13']) {
    await page.goto(`http://localhost:5173/build-resume/heading?previewTemplate=${cvId}`, { waitUntil: 'networkidle' }).catch(async () => {
      // If dev server on 5173 not running, test with compiled dist or standalone
    });
  }
  await browser.close();
}
inspectSplit();
