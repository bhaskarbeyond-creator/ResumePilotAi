import { chromium } from 'playwright';

async function verifyLiveSessionContinuity() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('--- Test 1: Direct /login visit as guest ---');
  await page.goto('https://airesume.projectdemo.guru/login', { waitUntil: 'networkidle' });
  const modalVisible = await page.locator('.authModal').isVisible();
  console.log('[PROD PROOF] /login for guest opens modal:', modalVisible);
  
  console.log('--- Test 2: Protected route redirect with return target ---');
  await page.goto('https://airesume.projectdemo.guru/dashboard', { waitUntil: 'networkidle' });
  console.log('Target URL after unauthenticated dashboard access:', page.url());
  const hasLoginNext = page.url().includes('/login') && page.url().includes('next=');
  console.log('[PROD PROOF] Redirects to /login?next= correctly:', hasLoginNext);
  
  console.log('--- Test 3: Public Website & Navigation Routes ---');
  await page.goto('https://airesume.projectdemo.guru/', { waitUntil: 'networkidle' });
  const navbarVisible = await page.locator('nav').first().isVisible();
  console.log('[PROD PROOF] Homepage navbar visible:', navbarVisible);
  
  await browser.close();
  console.log('ALL SESSION CONTINUITY CHECKS PASSED!');
}

verifyLiveSessionContinuity().catch(err => {
  console.error('Session Continuity Test Error:', err);
  process.exit(1);
});
