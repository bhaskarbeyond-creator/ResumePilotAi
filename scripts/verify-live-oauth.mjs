import { chromium } from 'playwright';

async function verifyLiveOAuth() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating to https://airesume.projectdemo.guru ...');
  await page.goto('https://airesume.projectdemo.guru/', { waitUntil: 'networkidle' });
  console.log('Page Title:', await page.title());
  
  // Click Sign In
  const signInBtn = page.locator('button:has-text("Sign in"), button:has-text("Sign In")').first();
  await signInBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Found Sign In button. Clicking...');
  await signInBtn.click();
  
  // Wait for modal
  const loginModal = page.locator('.authModal');
  await loginModal.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Login modal opened successfully.');
  
  const googleBtn = page.locator('#btn-login-google');
  const googleVisible = await googleBtn.isVisible();
  console.log('[PROD PROOF] #btn-login-google visible in Login modal:', googleVisible);
  
  const fbBtn = page.locator('#btn-login-facebook');
  const fbVisible = await fbBtn.isVisible();
  console.log('[PROD PROOF] #btn-login-facebook visible in Login modal:', fbVisible);
  
  // Switch to Register modal
  const regLink = page.locator('.modalFooter a').first();
  await regLink.click();
  await page.waitForTimeout(500);
  
  const regGoogleBtn = page.locator('#btn-register-google');
  const regGoogleVisible = await regGoogleBtn.isVisible();
  console.log('[PROD PROOF] #btn-register-google visible in Register modal:', regGoogleVisible);
  
  const regFbBtn = page.locator('#btn-register-facebook');
  const regFbVisible = await regFbBtn.isVisible();
  console.log('[PROD PROOF] #btn-register-facebook visible in Register modal:', regFbVisible);
  
  await browser.close();
  
  if (!googleVisible || !fbVisible || !regGoogleVisible || !regFbVisible) {
    console.error('FAILED: One or more OAuth buttons were not visible on live DOM!');
    process.exit(1);
  }
  
  console.log('ALL LIVE DOM OAUTH BUTTON CHECKS PASSED PERFECTLY!');
}

verifyLiveOAuth().catch(err => {
  console.error('Verification Error:', err);
  process.exit(1);
});
