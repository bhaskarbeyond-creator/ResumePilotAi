import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

async function inspectImages() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1450 } });

  for (const id of ['Cv1', 'Cv51', 'Cv17', 'Cv13', 'Cv6', 'Cv9', 'Cv4', 'Cv19']) {
    const p = path.resolve('src/assets/resumesNew', `${id}.JPG`);
    const base64 = fs.readFileSync(p).toString('base64');
    await page.setContent(`<body style="margin:0; background:#eee;"><img id="img" src="data:image/jpeg;base64,${base64}" style="width:993px;height:1404px;" /></body>`);
    await page.screenshot({ path: path.resolve(`scratch/debug_${id}.png`) });
    console.log('Saved debug screenshot for', id);
  }
  await browser.close();
}

inspectImages().catch(console.error);
