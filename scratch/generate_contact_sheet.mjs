import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';

const CV_IDS = Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`);

async function generateContactSheet() {
  console.log('Generating 51-Template Preview Contact Sheet...');
  const auditDir = path.resolve('scratch/template_preview_audit');
  const assetsDir = path.resolve('src/assets/resumesNew');

  const cardsHtml = CV_IDS.map((id, index) => {
    const filePath = path.join(assetsDir, `${id}.JPG`);
    const base64 = fs.readFileSync(filePath).toString('base64');
    return `
      <div style="background: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); padding: 12px; display: flex; flex-direction: column; align-items: center; border: 1px solid #e2e8f0;">
        <div style="font-weight: 700; font-size: 13px; color: #1e293b; margin-bottom: 8px; width: 100%; display: flex; justify-content: space-between;">
          <span>${id}</span>
          <span style="color: #64748b; font-weight: 500;">#${index + 1}</span>
        </div>
        <img src="data:image/jpeg;base64,${base64}" style="width: 100%; aspect-ratio: 1 / 1.414; object-fit: cover; border-radius: 4px; border: 1px solid #cbd5e1;" />
      </div>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>51 Template Previews Contact Sheet</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #f8fafc;
            margin: 0;
            padding: 32px;
          }
          h1 {
            color: #0f172a;
            font-size: 24px;
            margin-bottom: 8px;
          }
          p {
            color: #64748b;
            font-size: 14px;
            margin-bottom: 24px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 16px;
          }
        </style>
      </head>
      <body>
        <h1>ResumePilot AI — All 51 Template Previews Matrix</h1>
        <p>Production template engine screenshots generated with uniform A4 framing and representative resume data.</p>
        <div class="grid">
          ${cardsHtml}
        </div>
      </body>
    </html>
  `;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(html, { waitUntil: 'load' });

  const boardPath = path.join(auditDir, '51_template_preview_board.png');
  await page.screenshot({ path: boardPath, fullPage: true });
  console.log('Saved 51-template contact sheet to:', boardPath);

  await browser.close();
}

generateContactSheet().catch(console.error);
