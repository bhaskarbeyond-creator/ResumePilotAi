import { chromium } from 'playwright';
import { createServer } from 'vite';

async function reproduce() {
  const viteServer = await createServer({
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'error',
  });
  await viteServer.listen();
  const port = viteServer.config.server.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let capturedError = null;
  page.on('pageerror', (err) => {
    console.error('🔥 CAPTURED PAGE ERROR:', err.message);
    console.error(err.stack);
    capturedError = err;
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('🖥️ BROWSER CONSOLE ERROR:', msg.text());
    }
  });

  await page.goto(`${baseUrl}/template-lab/subscription-modal.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });

  console.log('Clicking "Continue to Checkout"...');
  await page.locator('button:has-text("Continue to Checkout")').click();
  await page.waitForTimeout(1000);

  const viewErrorVisible = await page.locator('text=Application View Error').isVisible().catch(() => false);
  console.log('Assertion 4 [Application View Error visible]:', viewErrorVisible);

  const editPlanBtn = await page.locator('button:has-text("Edit Plan & Duration")').isVisible().catch(() => false);
  console.log('Assertion 2 [Edit Plan & Duration visible]:', editPlanBtn);

  const countryInput = await page.locator('input[placeholder="Select your country"], select, .checkout-input-emb').count();
  console.log('Assertion 2 [Checkout inputs found in Step 2]:', countryInput);

  if (capturedError) {
    throw new Error(`CRASH REPRODUCED: Uncaught exception in page: ${capturedError.message}`);
  }
  if (viewErrorVisible) {
    throw new Error('CRASH REPRODUCED: RouteErrorBoundary caught an unhandled render error and displayed "Application View Error"!');
  }
  if (!editPlanBtn || countryInput === 0) {
    throw new Error('STEP 2 MOUNT FAILED: Checkout component failed to render fields properly!');
  }

  console.log('✅ REPRODUCTION GUARD PASSED: Known crash path executed -> Checkout mounted successfully -> Zero runtime exceptions -> Zero Application View Error.');
  await browser.close();
  await viteServer.close();
}

reproduce().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
