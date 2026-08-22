// @ts-check
import { test, expect } from '@playwright/test';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

// Load production backend env to get Firebase credentials
dotenv.config({ path: path.resolve('backend/.env') });

let testEmail = `playwright-superadmin-${Date.now()}@test.example`;
let testPassword = crypto.randomBytes(16).toString('hex');
let testUid = null;

test.describe('Live Authenticated Super Admin E2E', () => {
  test.setTimeout(180000);
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    // Initialize Firebase Admin SDK
    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
      });
    }

    // Create the temporary test user
    console.log(`Creating test Super Admin user: ${testEmail}`);
    const userRecord = await getAuth().createUser({
      email: testEmail,
      password: testPassword,
      emailVerified: true,
      displayName: 'Automated Super Admin'
    });
    testUid = userRecord.uid;

    // Set custom claims to make them a SUPER_ADMIN and simulate MFA
    await getAuth().setCustomUserClaims(testUid, { role: 'SUPER_ADMIN', sign_in_second_factor: true });
    console.log(`Created user ${testUid} with SUPER_ADMIN claims.`);
  });

  test.afterAll(async () => {
    if (testUid) {
      console.log(`Cleaning up test user: ${testUid}`);
      await getAuth().deleteUser(testUid);
    }
  });

  test('Live E2E Verification Flow', async ({ page }) => {
    // Mint custom token
    const customToken = await getAuth().createCustomToken(testUid);

    console.log('Navigating to live site for auth...');
    await page.goto('https://airesume.projectdemo.guru/', { waitUntil: 'domcontentloaded' });
    
    console.log('Authenticating in browser context via Firebase SDK...');
    await page.waitForFunction(() => window.fire && window.fire.auth, { timeout: 30000 });
    await page.evaluate(token => window.fire.auth().signInWithCustomToken(token), customToken);
    await page.waitForFunction(() => window.fire.auth().currentUser !== null, { timeout: 15000 });

    console.log('Live Firebase session successfully established. Navigating to /adm/dashboard...');
    await page.goto('https://airesume.projectdemo.guru/adm/dashboard', { waitUntil: 'domcontentloaded' });

    // Wait for Super Admin shell
    await expect(page.getByRole('heading', { name: 'Super Admin Command Center' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('SHA: bc28474')).toBeVisible({ timeout: 5000 }); // check live SHA prefix

    console.log('Testing grouped navigation...');
    const modules = [
      ['/adm/dashboard', 'Super Admin Command Center'],
      ['/adm/tenants', 'Enterprise Tenants Registry'],
      ['/adm/audit-logs', 'Admin Audit Logs'],
      ['/adm/security', 'Security Events'],
      ['/adm/queues', 'Platform Queue & DLQ Monitor'],
      ['/adm/operations', 'Platform Operations'],
      ['/adm/attention', 'Attention'],
      ['/adm/operators', 'Platform Operators'],
      ['/adm/phrases', 'Phrases'],
    ];
    for (const [navPath, heading] of modules) {
      await page.goto(`https://airesume.projectdemo.guru${navPath}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 20_000 });
    }

    console.log('Testing destructive action routing...');
    await page.goto('https://airesume.projectdemo.guru/adm/tenants', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Enterprise Tenants Registry' })).toBeVisible({ timeout: 10_000 });
  });
});
