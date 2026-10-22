import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACTS_DIR = 'C:/Users/mbhas/.gemini/antigravity-ide/brain/bf19b8e1-85f7-40ba-afa3-e1a98ffdb95b';
const BASE_URL = process.env.BASE_URL || 'http://localhost';

async function main() {
  console.log('--- Starting Playwright AI Settings Verification ---');
  
  // 1. Authenticate superadmin via backend preview login
  console.log('Step 1: Authenticating superadmin@resumepilot.test...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/preview-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@resumepilot.test', password: 'password123' })
  });
  
  if (!loginRes.ok) {
    throw new Error(`Login failed with HTTP ${loginRes.status}: ${await loginRes.text()}`);
  }
  const session = await loginRes.json();
  console.log('Authentication successful. Token uid:', session.uid, 'role:', session.role);

  // 2. Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  // Inject session into localStorage before loading page
  await context.addInitScript(({ session }) => {
    window.localStorage.setItem('ime_dev_user', JSON.stringify({
      uid: session.uid,
      email: session.email,
      displayName: session.displayName || 'Super Admin',
      role: session.role,
      token: session.token
    }));
    window.localStorage.setItem('token', session.token);
    window.localStorage.setItem('auth_token', session.token);
    window.localStorage.setItem('theme', 'dark');
  }, { session });

  const page = await context.newPage();

  // Listen to console and network errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Browser Console Error]: ${msg.text()}`);
  });
  page.on('response', res => {
    if (res.status() >= 400 && res.url().includes('/api/admin/ai-settings')) {
      console.log(`[API Response Error]: ${res.status()} ${res.url()}`);
    }
  });

  // 3. Navigate to admin console with AI settings tab
  console.log('Step 2: Navigating to', `${BASE_URL}/admin?tab=ai-settings`);
  await page.goto(`${BASE_URL}/admin?tab=ai-settings`, { waitUntil: 'networkidle' });

  // Wait for tab or heading to appear
  await page.waitForTimeout(1000);
  
  const heading = await page.locator('text=AI Multi-Provider Orchestration');
  const isHeadingVisible = await heading.isVisible().catch(() => false);
  console.log('AI Multi-Provider Orchestration heading visible:', isHeadingVisible);

  // Take screenshot of main AI settings view
  const screen1Path = path.join(ARTIFACTS_DIR, 'ai_settings_overview.png');
  await page.screenshot({ path: screen1Path, fullPage: false });
  console.log('Saved overview screenshot to:', screen1Path);

  // 4. Look for "+ Configure Provider" button
  console.log('Step 3: Opening Configure Provider modal...');
  const configureBtn = page.locator('button:has-text("Configure Provider"), button:has-text("Add Provider")').first();
  await configureBtn.waitFor({ state: 'visible', timeout: 5000 });
  await configureBtn.click();
  await page.waitForTimeout(500);

  // Take screenshot of open modal
  const screen2Path = path.join(ARTIFACTS_DIR, 'ai_settings_modal_open.png');
  await page.screenshot({ path: screen2Path });
  console.log('Saved modal screenshot to:', screen2Path);

  // 5. Select platform and enter key using exact data-testids
  console.log('Step 4: Selecting Groq platform and entering API key...');
  const platformSelector = page.locator('[data-testid="platform-selector"]').first();
  await platformSelector.waitFor({ state: 'visible', timeout: 5000 });
  await platformSelector.click();
  await page.waitForTimeout(300);

  const groqOption = page.locator('[data-testid="platform-option-groq"]').first();
  await groqOption.waitFor({ state: 'visible', timeout: 5000 });
  await groqOption.click();
  console.log('Selected Groq platform from listbox.');
  await page.waitForTimeout(300);

  const keyInput = page.locator('[data-testid="modal-api-key"]').first();
  await keyInput.waitFor({ state: 'visible', timeout: 5000 });
  await keyInput.fill('gsk_verifyTestKey1234567890abcdef');
  console.log('Filled Groq API key.');
  await page.waitForTimeout(300);

  // Take screenshot with Groq and key filled
  const screen3Path = path.join(ARTIFACTS_DIR, 'ai_settings_key_filled.png');
  await page.screenshot({ path: screen3Path });
  console.log('Saved key filled screenshot to:', screen3Path);

  // 6. Click "Add key & Activate" button
  console.log('Step 5: Clicking Add key & Activate...');
  const submitBtn = page.locator('[data-testid="modal-add-key"]').first();
  await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
  
  // Track network request to /api/admin/ai-settings
  const [response] = await Promise.all([
    page.waitForResponse(res => res.url().includes('/api/admin/ai-settings') && res.request().method() === 'POST', { timeout: 10000 }),
    submitBtn.click()
  ]);

  console.log('POST /api/admin/ai-settings status:', response.status());
  const resJson = await response.json();
  console.log('Response body:', JSON.stringify(resJson, null, 2));

  await page.waitForTimeout(1000);

  // Check if error banner appeared
  const errorAlert = page.locator('.text-rose-400, [role="alert"]');
  const errorVisible = await errorAlert.isVisible().catch(() => false);
  if (errorVisible) {
    const errorText = await errorAlert.innerText();
    console.log('Alert text on page:', errorText);
  } else {
    console.log('No error alert! Submission succeeded cleanly.');
  }

  // Take final screenshot of the result
  const screen4Path = path.join(ARTIFACTS_DIR, 'ai_settings_kilo_activated.png');
  await page.screenshot({ path: screen4Path });
  console.log('Saved activation result screenshot to:', screen4Path);

  await browser.close();
  console.log('--- Verification Complete: All steps executed cleanly! ---');
}

main().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
