import { test, expect } from '@playwright/test';
import { applicationDefault, initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'path';

dotenv.config({ path: path.resolve('backend/.env') });

const liveBaseUrl = String(process.env.LIVE_PRODUCTION_BASE_URL || '').replace(/\/$/, '');
const liveApproved = process.env.RUN_LIVE_PRODUCTION_MUTATIONS === 'true';
const evidenceDirectory = path.resolve('scratch/live-enterprise');
let testEmail = `playwright-e2e-${Date.now()}@northwind.example`;
let testPassword = crypto.randomBytes(24).toString('base64url');
let testUid = null;
let tenantId = null;
let liveIdToken = null;

test.describe('Live Authenticated Enterprise E2E Audit', () => {
  test.setTimeout(180000);
  test.skip(!liveBaseUrl || !liveApproved,
    'NOT VERIFIED: set LIVE_PRODUCTION_BASE_URL and explicitly approve isolated live mutations.');

  test.beforeAll(async () => {
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    if (getApps().length === 0) {
      initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
    }
    const userRecord = await getAuth().createUser({
      email: testEmail,
      password: testPassword,
      emailVerified: true,
      displayName: 'Enterprise Administrator'
    });
    testUid = userRecord.uid;
    await getAuth().setCustomUserClaims(testUid, { role: 'ADMIN' });
  });

  test.afterAll(async () => {
    let cleanupError = null;
    if (liveIdToken && liveBaseUrl) {
      try {
        const response = await fetch(`${liveBaseUrl}/api/account/delete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${liveIdToken}`, 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!response.ok && response.status !== 401 && response.status !== 404) {
          cleanupError = new Error(`Live account-data cleanup returned HTTP ${response.status}`);
        }
      } catch (error) { cleanupError = error; }
    }
    if (testUid) {
      await getAuth().deleteUser(testUid).catch(error => {
        if (error?.code !== 'auth/user-not-found' && !cleanupError) cleanupError = error;
      });
    }
    if (cleanupError) throw cleanupError;
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

    // Authenticate through the retained Firebase Authentication client. Tenant
    // provisioning must occur through the backend API, never a direct data-store write.
    await page.goto(`${liveBaseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.fire && window.fire.auth, { timeout: 30_000 });
    await page.evaluate(token => window.fire.auth().signInWithCustomToken(token), customToken);
    await page.waitForFunction(() => window.fire.auth().currentUser !== null, { timeout: 15_000 });
    liveIdToken = await page.evaluate(() => window.fire.auth().currentUser.getIdToken(true));

    const contextResponse = await page.request.get(`${liveBaseUrl}/api/enterprise/context`, {
      headers: { Authorization: `Bearer ${liveIdToken}` },
    });
    expect(contextResponse.status()).toBe(200);
    const contextPayload = await contextResponse.json();
    tenantId = contextPayload.context?.tenantId;
    expect(tenantId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.goto(`${liveBaseUrl}/enterprise`, { waitUntil: 'domcontentloaded' });
    await page.locator('.enterprise-shell').waitFor({ timeout: 20_000 });

    // Assert Topbar & Context Switchers
    await expect(page.locator('.enterprise-brand-title')).toHaveText('IME365 Enterprise');
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
    // Module 2: Talent & Resumes
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 2: Talent & Resumes...');
    // Seed sample candidate resume
    await page.evaluate(async (tenantId) => {
      try {
        const auth = window.fire?.auth?.();
        const token = await auth?.currentUser?.getIdToken();
        if (!token) return;
        await fetch('/api/enterprise/resources', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Enterprise-Tenant': tenantId
          },
          body: JSON.stringify({
            resourceType: 'resume',
            payload: {
              personalInfo: {
                fullName: 'Elena Rostova',
                jobTitle: 'VP of Product Engineering',
                email: 'elena.rostova@enterprise.example',
                phone: '+1 (555) 382-9912',
                location: 'San Francisco, CA',
                summary: 'Senior technology executive with 14+ years scaling distributed systems and cloud infrastructure products.'
              },
              atsScore: 94,
              experience: [
                { jobTitle: 'VP of Product Engineering', companyName: 'Stripe', startDate: '2021', endDate: 'Present', description: 'Led 85+ engineers across core payment infrastructure.' },
                { jobTitle: 'Director of Engineering', companyName: 'Datadog', startDate: '2017', endDate: '2021', description: 'Architected high-throughput telemetry ingestion platform.' }
              ],
              skills: ['Distributed Systems', 'Cloud Architecture', 'Go', 'Kubernetes', 'Product Strategy', 'Executive Leadership']
            }
          })
        });
      } catch {}
    }, tenantId);

    await page.locator('button.enterprise-nav-item').filter({ hasText: /Talent & Resumes|Documents & Resumes/ }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: /Talent & Resume Repository|Enterprise Document Library/ })).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(evidenceDirectory, 'enterprise_live_talent_resumes.png'), fullPage: true });

    // ─────────────────────────────────────────────────────────────
    // Module 3: Users (IAM)
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module 3: Users & IAM...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Users & IAM' }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Users & IAM' })).toBeVisible();

    // Verify Invite modal has complete role dropdown options
    const inviteBtn = page.locator('button').filter({ hasText: 'Invite Member' }).first();
    if (await inviteBtn.isVisible()) {
      await inviteBtn.click();
      await expect(page.locator('#member-role')).toBeVisible();
      const roleOptionsText = await page.locator('#member-role option').allTextContents();
      console.log('Live Role Options in Invite Modal:', roleOptionsText);
      expect(roleOptionsText.some(t => t.includes('Administrator'))).toBe(true);
      expect(roleOptionsText.some(t => t.includes('Workspace Manager'))).toBe(true);
      expect(roleOptionsText.some(t => t.includes('Enterprise Member'))).toBe(true);
      expect(roleOptionsText.some(t => t.includes('Read-Only Viewer'))).toBe(true);
      expect(roleOptionsText.some(t => t.includes('Billing Administrator'))).toBe(true);
      // Close modal
      await page.locator('.enterprise-modal-header button.enterprise-button-icon').click();
    }

    // Inspect first user row details modal
    const inspectBtn = page.locator('button[title*="membership details"]').first();
    if (await inspectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inspectBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(evidenceDirectory, 'enterprise_live_users_modal.png'), fullPage: true });
      // Close details modal
      await page.locator('.enterprise-modal-header button.enterprise-button-icon').click();
    }

    // Verify AppSwitcher and Sign Out topbar buttons
    await expect(page.locator('button.enterprise-app-switcher-btn')).toBeVisible();
    await expect(page.locator('button.enterprise-exit-link')).toBeVisible();

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

    // Open Team Members drawer
    const teamMembersBtn = page.locator('button').filter({ hasText: 'Members' }).first();
    if (await teamMembersBtn.isVisible()) {
      await teamMembersBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(evidenceDirectory, 'enterprise_live_teams_drawer.png'), fullPage: true });
      await page.locator('.enterprise-modal-header button.enterprise-button-icon').click();
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

    // Define and verify dynamic Custom Role creation
    const defineRoleBtn = page.locator('button').filter({ hasText: 'Define Custom Role' }).first();
    if (await defineRoleBtn.isVisible()) {
      console.log('Testing Custom Role Creation & Dynamic UI Integration...');
      await defineRoleBtn.click();
      const customSuffix = Date.now().toString().slice(-4);
      const customId = `AUDITOR_${customSuffix}`;
      const customLabel = `Quality Auditor ${customSuffix}`;
      await page.locator('#custom-role-id').fill(customId);
      await page.locator('#custom-role-label').fill(customLabel);
      await page.locator('.enterprise-modal-footer button.enterprise-button-primary').click();
      await page.waitForTimeout(1000);
      
      // Verify custom role card is rendered dynamically
      await expect(page.locator(`text=${customLabel}`).first()).toBeVisible({ timeout: 10000 });

      // Navigate back to Users & IAM to verify custom role is immediately selectable in IAM UI
      console.log('Verifying Custom Role is dynamically available in Users & IAM...');
      await page.locator('button.enterprise-nav-item').filter({ hasText: 'Users & IAM' }).click();
      await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Enterprise Members' })).toBeVisible();

      // Open Invite modal and verify custom role is in dropdown
      const inviteBtn = page.locator('button').filter({ hasText: 'Invite Member' }).first();
      if (await inviteBtn.isVisible()) {
        await inviteBtn.click();
        const roleDropdown = page.locator('#member-role');
        await expect(roleDropdown).toBeVisible();
        const roleOptionsText = await roleDropdown.locator('option').allInnerTexts();
        expect(roleOptionsText.some(t => t.includes(customLabel) || t.includes(customId))).toBe(true);
        // Close modal
        await page.locator('.enterprise-modal-header button.enterprise-button-icon').click();
      }
    }

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
    // Module: Email & Notifications
    // ─────────────────────────────────────────────────────────────
    console.log('Testing Module: Email & Notifications...');
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Email & Notifications' }).click();
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Email & Notification Templates' })).toBeVisible();
    
    // Dispatch test email preview
    const sendTestBtn = page.locator('button').filter({ hasText: 'Send Test Preview' }).first();
    if (await sendTestBtn.isVisible()) {
      console.log('Testing Test Email Dispatch Action...');
      await sendTestBtn.click();
      await page.waitForTimeout(1000);
      await expect(page.locator('.enterprise-toast-success, .enterprise-toast')).toBeVisible({ timeout: 8000 });
    }
    
    await page.screenshot({ path: path.join(evidenceDirectory, 'enterprise_live_email_templates.png'), fullPage: true });

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

    // Reset Viewport & Switch to Audit logs to verify actor humanization and clean layout
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Audit logs' }).click();
    await page.waitForTimeout(1500);

    // Verify document.title does NOT contain Page Not Found
    const docTitle = await page.title();
    console.log('Live Document Title:', docTitle);
    expect(docTitle).toContain('Enterprise Console');
    expect(docTitle).not.toContain('Page Not Found');

    // Assert tab content is visible
    await expect(page.locator('h2.enterprise-tab-title').filter({ hasText: 'Immutable Audit Trail' })).toBeVisible();

    // Capture Evidence Screenshot of Audit Trail
    console.log('Capturing Live E2E Screenshot...');
    await page.screenshot({ path: path.join(evidenceDirectory, 'enterprise_live_authenticated_audit_success.png'), fullPage: true });

    // Switch to Security tab to capture Security Posture alignment and HelpTooltip
    await page.locator('button.enterprise-nav-item').filter({ hasText: 'Security & M2M' }).click();
    await page.waitForTimeout(1000);
    await expect(page.locator('h3.enterprise-card-title').filter({ hasText: 'Security Posture' })).toBeVisible();
    await page.screenshot({ path: path.join(evidenceDirectory, 'enterprise_live_security_posture_success.png'), fullPage: true });

    // Verify console errors
    console.log('Live Console Errors logged during run:', consoleErrors);
    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('third-party') && !e.includes('Failed to load resource'));
    expect(fatalErrors, `unexpected browser console errors: ${fatalErrors.join(' | ')}`).toEqual([]);
  });
});
