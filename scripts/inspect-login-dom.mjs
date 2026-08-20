import { chromium } from 'playwright';

async function inspectLoginDom() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://airesume.projectdemo.guru/login', { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  // Accept cookies if present
  const cookieBtn = page.locator('button:has-text("Accept All Cookies"), button:has-text("Reject")').first();
  if (await cookieBtn.isVisible()) {
    await cookieBtn.click();
    console.log('Clicked Cookie button.');
    await page.waitForTimeout(1000);
  }

  // Click Sign In button in navbar
  const signInBtn = page.locator('button:has-text("Sign In"), button:has-text("Login")').first();
  if (await signInBtn.isVisible()) {
    await signInBtn.click();
    console.log('Clicked Sign In button.');
    await page.waitForTimeout(1000);
  }

  const inputs = await page.locator('input').all();
  console.log('Inputs count after opening modal:', inputs.length);
  for (let i = 0; i < inputs.length; i++) {
    const name = await inputs[i].getAttribute('name');
    const type = await inputs[i].getAttribute('type');
    const placeholder = await inputs[i].getAttribute('placeholder');
    const isVisible = await inputs[i].isVisible();
    console.log(`  Input #${i+1}: name="${name}", type="${type}", placeholder="${placeholder}", visible=${isVisible}`);
  }

  await browser.close();
}

inspectLoginDom().catch(console.error);
