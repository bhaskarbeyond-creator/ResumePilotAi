import { chromium } from 'playwright';
import path from 'node:path';

const LIVE_BASE = 'https://airesume.projectdemo.guru';
const ARTIFACT_DIR = 'C:/Users/mbhas/.gemini/antigravity-ide/brain/0025b43c-9285-4eb7-a052-c08c4ee81c3f';

async function runLiveEnterpriseUxTest() {
  console.log('\n======================================================');
  console.log(`LAUNCHING ENTERPRISE UX BROWSER TEST: ${LIVE_BASE}/enterprise`);
  console.log('======================================================\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });

  const page = await context.newPage();

  try {
    // 1. Navigate to live /enterprise
    console.log('Step 1: Navigating to live /enterprise endpoint...');
    await page.goto(`${LIVE_BASE}/enterprise`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    const title = await page.title();
    console.log('Page Title:', title);

    const screenshotPath = path.join(ARTIFACT_DIR, 'enterprise_live_console.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('✓ Captured live console screenshot to:', screenshotPath);

    console.log('\n======================================================');
    console.log('ENTERPRISE BROWSER TEST SUCCESS — SCREENSHOT SAVED');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Test encountered error:', err);
  } finally {
    await browser.close();
  }
}

runLiveEnterpriseUxTest();
