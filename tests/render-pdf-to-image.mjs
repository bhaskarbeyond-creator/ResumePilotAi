import { chromium } from 'playwright';
import fs from 'fs';

async function renderPdf() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
  
  const pdfBase64 = fs.readFileSync('test-results/browser-verification/user-exported-free.pdf').toString('base64');
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        </script>
        <style>
          body { margin: 0; background: #333; display: flex; justify-content: center; }
          canvas { box-shadow: 0 0 10px rgba(0,0,0,0.5); margin: 20px; }
        </style>
      </head>
      <body>
        <canvas id="pdf-canvas"></canvas>
        <script>
          const raw = atob("${pdfBase64}");
          const uint8Array = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) uint8Array[i] = raw.charCodeAt(i);

          pdfjsLib.getDocument({ data: uint8Array }).promise.then(pdf => {
            return pdf.getPage(1).then(page => {
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.getElementById('pdf-canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              return page.render({ canvasContext: context, viewport: viewport }).promise.then(() => {
                document.body.setAttribute('data-rendered', 'true');
              });
            });
          }).catch(err => {
            document.body.setAttribute('data-error', err.message);
          });
        </script>
      </body>
    </html>
  `;

  await page.setContent(html);
  await page.waitForSelector('body[data-rendered="true"]', { timeout: 15000 });
  await page.screenshot({ path: 'test-results/browser-verification/rendered-pdf-page1.png' });
  console.log('Successfully captured rendered PDF canvas at test-results/browser-verification/rendered-pdf-page1.png');
  await browser.close();
}

renderPdf().catch(err => {
  console.error(err);
  process.exit(1);
});
