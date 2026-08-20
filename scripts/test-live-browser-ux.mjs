import { chromium } from 'playwright';

async function testLiveBrowserUx() {
  console.log('=== Testing Live Browser UX on https://airesume.projectdemo.guru ===\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Test 1: Homepage Navbar Enterprise link
  await page.goto('https://airesume.projectdemo.guru', { waitUntil: 'load', timeout: 15000 });
  const title = await page.title();
  console.log('[1] Homepage Loaded. Title:', title);

  // Wait 1s for client-side hydration
  await page.waitForTimeout(1000);

  const enterpriseLinks = await page.locator('a[href*="enterprise"]').all();
  console.log('[2] Found', enterpriseLinks.length, 'Enterprise links on homepage navigation.');
  for (let i = 0; i < enterpriseLinks.length; i++) {
    const text = await enterpriseLinks[i].textContent();
    const isVisible = await enterpriseLinks[i].isVisible();
    const href = await enterpriseLinks[i].getAttribute('href');
    console.log(`    Link #${i+1}: href="${href}", text="${text?.trim()}", visible=${isVisible}`);
  }

  // Test 2: Navigate to /enterprise
  await page.goto('https://airesume.projectdemo.guru/enterprise', { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(1000);
  console.log('[3] Navigated to /enterprise. Current URL:', page.url());

  // Check what is rendered on /enterprise
  const heading = await page.locator('h1, h2').allTextContents();
  console.log('[4] Headings on /enterprise page:', heading);

  const bodyText = await page.textContent('body');
  console.log('[5] Page content snippet:', bodyText?.replace(/\s+/g, ' ').slice(0, 300));

  await browser.close();
  console.log('\n=== Live Browser UX Test Finished Successfully ===');
}

testLiveBrowserUx().catch(console.error);
