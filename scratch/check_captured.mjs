import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

async function checkCaptured() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });

  for (const id of ['Cv1', 'Cv51', 'Cv17', 'Cv13', 'Cv6', 'Cv9', 'Cv4', 'Cv19']) {
    const p = path.resolve('src/assets/resumesNew', `${id}.JPG`);
    const base64 = fs.readFileSync(p).toString('base64');
    await page.setContent(`<body style="background:#333; display:flex; justify-content:center; padding:20px;"><img id="img" src="data:image/jpeg;base64,${base64}" style="max-width:600px; border:2px solid red;" /></body>`);
    await page.screenshot({ path: path.resolve(`scratch/view_${id}.png`) });
    console.log(`Saved scratch/view_${id}.png`);
  }
  await browser.close();
}

checkCaptured().catch(console.error);
