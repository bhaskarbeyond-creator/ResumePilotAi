import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const admin = require('../backend/services/firebaseAdmin');
const dotenv = require('../backend/node_modules/dotenv');

dotenv.config({ path: path.resolve('backend/.env') });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

async function testLiveAuthenticatedUx() {
  console.log('=== Live Authenticated Enterprise Console UX Test ===\n');

  const testUid = 'controlled-enterprise-ux-user-01';
  const testEmail = 'enterprise-ux-pilot@projectdemo.guru';
  const testPassword = 'TemporarySecurePilotPassword2026!';

  try {
    await admin.auth().getUser(testUid);
    await admin.auth().updateUser(testUid, { password: testPassword, emailVerified: true });
    console.log('[Auth] Updated existing pilot test user with test credentials.');
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      await admin.auth().createUser({
        uid: testUid,
        email: testEmail,
        password: testPassword,
        emailVerified: true,
        displayName: 'Enterprise Test Director',
      });
      console.log('[Auth] Created new pilot test user in Firebase Auth.');
    } else {
      throw err;
    }
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    // 1. Navigate to /login
    await page.goto('https://airesume.projectdemo.guru/login', { waitUntil: 'load', timeout: 15000 });
    await page.waitForSelector('.loading, .loader', { state: 'detached', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // 2. Accept cookie consent if present
    const cookieBtn = page.locator('button:has-text("Accept All Cookies"), button:has-text("Reject")').first();
    if (await cookieBtn.isVisible()) {
      await cookieBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
    }

    // 3. Open Sign In modal
    const signInBtn = page.locator('button:has-text("Sign In"), button:has-text("Login")').first();
    if (await signInBtn.isVisible()) {
      await signInBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    // 4. Fill credentials
    await page.locator('input[name="Email"]').first().fill(testEmail);
    await page.locator('input[name="Password"]').first().fill(testPassword);
    await page.locator('input[type="submit"], button[type="submit"], .inputSubmit').first().click({ force: true });

    // Wait for redirect to dashboard
    await page.waitForTimeout(5000);

    // 5. Navigate to /enterprise
    await page.goto('https://airesume.projectdemo.guru/enterprise', { waitUntil: 'load', timeout: 15000 });
    await page.waitForSelector('.loading, .loader', { state: 'detached', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // 6. Verify Enterprise Console elements
    const brand = await page.locator('.enterprise-brand, header h1, header h2').allTextContents();
    console.log('[1] Brand/Header on /enterprise:', brand);

    const navButtons = await page.locator('.enterprise-sidebar button').allTextContents();
    console.log('[2] Enterprise sidebar navigation items:', navButtons);

    const metrics = await page.locator('.enterprise-metric strong, .enterprise-hero h1, .enterprise-hero p').allTextContents();
    console.log('[3] Enterprise dashboard headline & metrics:', metrics);

    // 7. Save high-resolution screenshot into artifacts
    const screenshotPath = 'C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\e973f01a-4e97-4355-bb6f-2d1340c18015\\enterprise_live_console.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('[4] Saved live screenshot to:', screenshotPath);

  } finally {
    await browser.close();
    await admin.auth().deleteUser(testUid).catch(() => {});
    console.log('[Auth] Cleaned up pilot test user from Firebase Auth.');
  }
}

testLiveAuthenticatedUx().catch(console.error);
