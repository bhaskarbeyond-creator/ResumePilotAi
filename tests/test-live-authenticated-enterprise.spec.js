import { test, expect } from '@playwright/test';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { FirestoreTenantRegistry } = require('../backend/enterprise/tenantRegistry.js');

// Load production backend env to get Firebase credentials
dotenv.config({ path: path.resolve('backend/.env') });

let testEmail = `playwright-e2e-${Date.now()}@northwind.example`;
let testPassword = crypto.randomBytes(16).toString('hex');
let testUid = null;
let tenantId = null;

test.describe('Live Authenticated Enterprise E2E Audit', () => {
  test.setTimeout(180000);

  test.beforeAll(async () => {
    // 1. Initialize Firebase Admin SDK
    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
      });
    }

    // 2. Create the temporary test user
    console.log(`Creating test user: ${testEmail}`);
    const userRecord = await getAuth().createUser({
      email: testEmail,
      password: testPassword,
      emailVerified: true,
      displayName: 'Enterprise Administrator'
    });
    testUid = userRecord.uid;

    // 3. Set custom claims to make them an ADMIN
    await getAuth().setCustomUserClaims(testUid, { role: 'ADMIN' });
    console.log(`Created user ${testUid} with ADMIN claims.`);

    // 4. Ensure tenant and default workspace in Firestore so context resolves instantly
    const db = getFirestore();
    const registry = new FirestoreTenantRegistry({ db, admin: { firestore: { FieldValue } } });
    const ensured = await registry.ensurePersonalTenant(testUid, { displayName: 'Enterprise Administrator' });
    tenantId = ensured.tenantId;
    console.log(`Ensured tenant ${tenantId} for test user.`);
  });

  test.afterAll(async () => {
    // Clean up the test user
    if (testUid) {
      console.log(`Cleaning up test user: ${testUid}`);
      await getAuth().deleteUser(testUid);
    }
  });

  test('10/10 Enterprise UI/UX Flow (Live)', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Generate Firebase custom token for the test user
    console.log('Minting custom token for test user...');
    const customToken = await getAuth().createCustomToken(testUid);

    // 2. Navigate to live site and sign in via Firebase Auth in browser
    console.log('Navigating to live site...');
    await page.goto('https://airesume.projectdemo.guru/', { waitUntil: 'domcontentloaded' });
    
    console.log('Authenticating in browser context via Firebase SDK...');
    await page.waitForFunction(() => window.fire && window.fire.auth, { timeout: 30000 });
    await page.evaluate(token => window.fire.auth().signInWithCustomToken(token), customToken);
    
    // Wait for the auth state to settle
    await page.waitForFunction(() => window.fire.auth().currentUser !== null, { timeout: 15000 });
    console.log('Live Firebase session successfully established in browser!');

    // 3. Navigate directly to Enterprise Console
    console.log('Navigating to Enterprise Console...');
    await page.goto('https://airesume.projectdemo.guru/enterprise', { waitUntil: 'domcontentloaded' });
    
    // Wait for the full enterprise shell to load
    await page.locator('.enterprise-shell').waitFor({ timeout: 20000 });
    console.log('Enterprise Console successfully mounted.');

    // Assert Topbar & Context Switchers
    await expect(page.locator('.enterprise-brand-title')).toHaveText('ResumePilot Enterprise');
    await expect(page.locator('.enterprise-topbar')).toBeVisible();
    await expect(page.locator('.enterprise-sidebar')).toBeVisible();

    // ─────────────────────────────────────────────────────────────
    // Module 1: Overview
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 1: Overview...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Overview' }).click();
    await expect(page.locator('.enterprise-banner-card')).toBeVisible();
    await expect(page.locator('text=Enterprise Active')).toBeVisible();

    // ─────────────────────────────────────────────────────────────
    // Module 2: Resumes
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 2: Documents & Resumes...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Documents & Resumes' }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Enterprise Document Library' })).toBeVisible();

    // ─────────────────────────────────────────────────────────────
    // Module 3: Users (IAM)
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 3: Users & IAM...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Users & IAM' }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Users & IAM' })).toBeVisible();

    // ─────────────────────────────────────────────────────────────
    // Module 4: Teams
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 4: Teams...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Teams' }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Teams Management' })).toBeVisible();
    
    // Create Team
    console.log('Testing Team Creation...');
    const createTeamBtn = page.locator('button').filter({ hasText: 'Create Team' }).first();
    if (await createTeamBtn.isVisible()) {
      await createTeamBtn.click();
      await page.locator('input[placeholder*="Engineering"]').fill(`QA Team ${Date.now()}`);
      await page.locator('.enterprise-modal-footer button.enterprise-button-primary').click();
      await page.waitForTimeout(1500);
    }

    // ─────────────────────────────────────────────────────────────
    // Module 5: Workspaces
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 5: Workspaces...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Workspaces' }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Workspaces' })).toBeVisible();
    
    // Create Workspace
    console.log('Testing Workspace Creation...');
    const createWsBtn = page.locator('button').filter({ hasText: 'Create Workspace' }).first();
    if (await createWsBtn.isVisible()) {
      await createWsBtn.click();
      const wsName = `Live Workspace ${Date.now()}`;
      await page.locator('input[placeholder*="Workspace name"]').fill(wsName);
      await page.locator('.enterprise-modal-footer button.enterprise-button-primary').click();
      await expect(page.locator(`text=${wsName}`).first()).toBeVisible({ timeout: 10000 });
    }

    // ─────────────────────────────────────────────────────────────
    // Module 6: Roles & Permissions
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 6: Roles & Permissions...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Roles & permissions' }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Roles & Access Control Matrix' })).toBeVisible();

    // ─────────────────────────────────────────────────────────────
    // Module 7: AI Administration
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 7: AI Workspace...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'AI workspace' }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Enterprise AI Policy & Quota Console' })).toBeVisible();

    // ─────────────────────────────────────────────────────────────
    // Module 8: Security & Service Accounts
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 8: Security & M2M...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Security & M2M' }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Enterprise Security Center' })).toBeVisible();

    // ─────────────────────────────────────────────────────────────
    // Module 9: Usage & Quotas
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 9: Usage & Quotas...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Usage & Quotas' }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Usage & Quota Analytics' })).toBeVisible();

    // ─────────────────────────────────────────────────────────────
    // Module 10: Audit Logs
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 10: Audit Logs...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Audit logs' }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Immutable Audit Trail' })).toBeVisible();

    // ─────────────────────────────────────────────────────────────
    // Module 11: Support Access
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 11: Support Access...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Support access' }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Break-Glass & Support Access' })).toBeVisible();

    // ─────────────────────────────────────────────────────────────
    // Module 12: Tenant Settings
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 12: Organization Settings...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Organization settings' }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Organization Settings' })).toBeVisible();

    // ─────────────────────────────────────────────────────────────
    // Module 13: Platform Administration
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 13: Platform Administration...');
    const platformNavBtn = page.locator('button.enterprise-nav-item').filter({ hasText: 'Platform administration' });
    if (await platformNavBtn.isVisible()) {
      await platformNavBtn.click();
      await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Platform Administration' })).toBeVisible();
    }

    // ─────────────────────────────────────────────────────────────
    // Responsive Testing: Mobile Viewport
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Responsive Mobile Viewport (390x844)...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1000);
    
    // Check mobile menu toggle
    const mobileToggle = page.locator('button.enterprise-mobile-toggle');
    await expect(mobileToggle).toBeVisible();
    await mobileToggle.click();
    await expect(page.locator('.enterprise-sidebar.mobile-open')).toBeVisible();
    await mobileToggle.click();

    // Reset Viewport & Switch to Roles & permissions to verify full canvas expansion and document.title
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Roles & permissions' }).click();
    await page.waitForTimeout(1000);

    // Verify document.title does NOT contain Page Not Found
    const docTitle = await page.title();
    console.log('Live Document Title:', docTitle);
    expect(docTitle).toContain('Enterprise Console');
    expect(docTitle).not.toContain('Page Not Found');

    // Capture Evidence Screenshot
    console.log('Capturing Live E2E Screenshot...');
    await page.screenshot({ path: 'enterprise_live_authenticated_audit_success.png', fullPage: true });

    // Verify console errors
    console.log('Live Console Errors logged during run:', consoleErrors);
    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('third-party') && !e.includes('Failed to load resource'));
    expect(fatalErrors.length).toBeLessThan(10);
    console.log('✓ 10/10 Live Authenticated Enterprise E2E Verification PASSED!');
  });
});
