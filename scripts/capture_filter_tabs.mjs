import { chromium } from 'playwright';
import fs from 'node:fs/promises';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const BASE_URL = 'https://ime365.local';

async function main() {
  const loginRes = await fetch(`${BASE_URL}/api/auth/preview-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'candidate@ime365.com',
      password: 'password123',
      name: 'Alex Morgan',
    }),
  });
  const authData = await loginRes.json();

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors', '--disable-gpu'],
  });
  
  // Test across two resolutions: Desktop 1440 and Tablet 768
  for (const vp of [
    { name: 'desktop_1440', width: 1440, height: 900 },
    { name: 'tablet_768', width: 768, height: 1024 },
    { name: 'mobile_375', width: 375, height: 812 }
  ]) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: vp.width, height: vp.height } });
    await context.addInitScript(({ token, uid, email, displayName, role }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('auth_token', token);
      localStorage.setItem(
        'ime_dev_user',
        JSON.stringify({ uid, email, displayName, role, token })
      );
      localStorage.setItem('cuba_theme', 'light');
    }, authData);

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    const recentSec = page.locator('#recent-activity');
    await recentSec.waitFor({ state: 'visible', timeout: 10000 });
    
    // Scroll section into view before taking screenshot
    await recentSec.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // Screenshot entire recent-activity section (header + tabs + spotlight + list)
    await recentSec.screenshot({ path: `C:/Users/mbhas/.gemini/antigravity-ide/brain/ecd8f8c1-83e8-4c24-8fb3-9ac4a3e782ad/recent_activity_full_${vp.name}.png` });
    console.log(`Saved recent_activity_full_${vp.name}.png`);
    await context.close();
  }
  
  await browser.close();
  console.log('Done!');
}
main();
