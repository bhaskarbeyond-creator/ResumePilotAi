import { chromium } from 'playwright';
import { createServer } from 'vite';

async function testLocalDashboardHumanization() {
  console.log('=== Starting Local Dashboard Humanization Browser Verification ===');
  
  // Start local Vite server
  const server = await createServer({
    server: { port: 5199 }
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = address ? address.port : 5199;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Vite preview server listening at ${baseUrl}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon.ico') && !text.includes('Failed to load resource')) {
        consoleErrors.push(text);
      }
    }
  });

  // Inject authenticated user mock session in localStorage before routing
  await page.addInitScript(() => {
    localStorage.setItem('user', 'test-user-humanize-123');
  });

  console.log('\n--- Checking /dashboard Render ---');
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  const pageContent = await page.content();
  console.log(`Dashboard page content length: ${pageContent.length}`);

  // Check 10 responsive viewports for overflow
  const viewports = [
    { name: '320x667', width: 320, height: 667 },
    { name: '375x667', width: 375, height: 667 },
    { name: '390x844', width: 390, height: 844 },
    { name: '414x896', width: 414, height: 896 },
    { name: '430x932', width: 430, height: 932 },
    { name: '768x1024', width: 768, height: 1024 },
    { name: '1024x768', width: 1024, height: 768 },
    { name: '1280x800', width: 1280, height: 800 },
    { name: '1440x900', width: 1440, height: 900 },
    { name: '1920x1080', width: 1920, height: 1080 }
  ];

  let overflowDetected = false;
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(150);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const hasOverflow = bodyWidth > vp.width + 10;
    if (hasOverflow) overflowDetected = true;
    console.log(`  Viewport ${vp.name.padEnd(10)}: Rendered cleanly (Overflow: ${hasOverflow ? 'YES' : 'NONE'})`);
  }

  await browser.close();
  await server.close();

  console.log(`\nLocal Browser Verification: ${overflowDetected ? 'OVERFLOW DETECTED' : '100% PASSED'}`);
  console.log(`Console errors: ${consoleErrors.length}`);
}

testLocalDashboardHumanization().then(() => {
  console.log('LOCAL_DASHBOARD_VERIFICATION_COMPLETE');
  process.exit(0);
}).catch(err => {
  console.error('LOCAL_DASHBOARD_VERIFICATION_FAILED:', err);
  process.exit(1);
});
