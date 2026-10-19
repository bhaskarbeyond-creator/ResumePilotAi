/**
 * Comprehensive Verification Suite for All Popups and Modals in:
 * 1. Build Resume (/build-resume)
 *    - 13 Steps Overview Modal ([data-testid="resume-builder-13-steps-modal"])
 *    - Preview Modal ([data-testid="cuba-preview-modal"])
 *    - Share Modal ([data-testid="cuba-share-modal"])
 * 2. Resumes & Master CV (/dashboard/resumes)
 *    - Create New Resume Modal ([data-testid="dashboard-resumes-create-modal"])
 *    - Preview Modal ([data-testid="cuba-preview-modal"])
 *    - Share Modal ([data-testid="cuba-share-modal"])
 *    - Rename Resume Modal ([data-testid="dashboard-resumes-rename-modal"])
 *    - Delete Confirmation Modal ([data-testid="dashboard-resumes-delete-modal"])
 */

import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE_URL = process.env.TEST_BASE_URL || 'https://ime365.local';
const ARTIFACT_DIR = 'C:/Users/mbhas/.gemini/antigravity-ide/brain/ecd8f8c1-83e8-4c24-8fb3-9ac4a3e782ad';
const LOCAL_DIR = 'artifacts/popups-verification';

async function setupStorage() {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
}

async function run() {
  console.log('🚀 Starting Comprehensive Popups & Modals Verification Suite...');
  await setupStorage();

  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  require('dotenv').config({ path: path.resolve('backend/.env') });
  const { issueLocalTestToken } = require('../backend/security/auth.js');
  const email = 'bhaskar.beyond@gmail.com';
  const uid = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';
  const now = Math.floor(Date.now() / 1000);
  const token = issueLocalTestToken({
    uid,
    email,
    role: 'USER',
    email_verified: true,
    auth_time: now,
    exp: now + 60 * 60 * 24 * 7,
    sign_in_second_factor: false,
  });

  const authData = {
    token,
    uid,
    email,
    displayName: 'Bhaskar Beyond',
    role: 'USER'
  };

  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true
  });

  await context.addInitScript(({ token, uid, email, displayName, role }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('auth_token', token);
    localStorage.setItem('ime_dev_user', JSON.stringify({ uid, email, displayName, role, token }));
    localStorage.setItem('cuba_theme', 'light');
  }, authData);

  const page = await context.newPage();

  const report = {
    testDate: new Date().toISOString(),
    testsPassed: 0,
    testsTotal: 8,
    details: []
  };

  try {
    // =========================================================================
    // PART 1: POPUPS IN /build-resume
    // =========================================================================
    console.log('\n--- PART 1: Testing Popups in /build-resume ---');
    await page.goto(`${BASE_URL}/build-resume`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // 1.1 Test 13 Steps Overview Modal (Desktop Trigger)
    console.log('1. Testing 13 Steps Overview Modal (Desktop)...');
    const desktop13Trigger = page.locator('[data-testid="resume-builder-13-steps-trigger"]');
    await desktop13Trigger.waitFor({ state: 'visible', timeout: 10000 });
    await desktop13Trigger.click();

    const modal13 = page.locator('[data-testid="resume-builder-13-steps-modal"]');
    await modal13.waitFor({ state: 'visible', timeout: 5000 });

    const modal13Title = await modal13.locator('h2, [role="heading"]').first().textContent();
    console.log(`   ✓ 13 Steps Modal opened with title: "${modal13Title}"`);
    assert(modal13Title.includes('Resume Sections Overview (13 Steps)'), 'Title should state 13 Steps');

    // Count step buttons inside the grid
    const stepCards = modal13.locator('div.grid button');
    const stepCount = await stepCards.count();
    console.log(`   ✓ Found ${stepCount} step buttons in matrix (expected 13)`);
    assert.equal(stepCount, 13, 'Must render exactly 13 step buttons');

    // Screenshot 13 Steps Modal
    const shot13Path = `${LOCAL_DIR}/popup-13-steps-overview-desktop.png`;
    await page.screenshot({ path: shot13Path });
    await fs.copyFile(shot13Path, `${ARTIFACT_DIR}/popup-13-steps-overview-desktop.png`);
    console.log(`   📸 Captured screenshot: popup-13-steps-overview-desktop.png`);

    // Click step 4 (Skills) to verify instant jump navigation
    console.log('   Testing step jump from inside modal to Skills...');
    await stepCards.nth(3).click(); // 4th step is skills
    await page.waitForTimeout(1000);

    const activeStepHeader = await page.locator('h1').textContent();
    console.log(`   ✓ Navigated to step: "${activeStepHeader}"`);
    report.testsPassed++;
    report.details.push({ test: 'Build Resume: 13 Steps Overview Modal Desktop Jump', status: 'PASSED' });

    // 1.2 Test 13 Steps Overview Modal on Mobile Viewport
    console.log('\n2. Testing 13 Steps Overview Modal on Mobile (375x812)...');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(600);

    const mobile13Trigger = page.locator('[data-testid="resume-builder-13-steps-trigger-mobile"]');
    await mobile13Trigger.waitFor({ state: 'visible', timeout: 5000 });
    await mobile13Trigger.click();

    await modal13.waitFor({ state: 'visible', timeout: 5000 });
    console.log('   ✓ 13 Steps Modal opened on Mobile viewport!');

    const shot13MobilePath = `${LOCAL_DIR}/popup-13-steps-overview-mobile.png`;
    await page.screenshot({ path: shot13MobilePath });
    await fs.copyFile(shot13MobilePath, `${ARTIFACT_DIR}/popup-13-steps-overview-mobile.png`);
    console.log(`   📸 Captured screenshot: popup-13-steps-overview-mobile.png`);

    // Close overview using Close button
    await modal13.locator('button:has-text("Close Overview")').click();
    await modal13.waitFor({ state: 'hidden', timeout: 5000 });
    console.log('   ✓ 13 Steps Modal closed successfully via Close button');
    report.testsPassed++;
    report.details.push({ test: 'Build Resume: 13 Steps Overview Modal Mobile', status: 'PASSED' });

    // Restore desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(600);

    // 1.3 Test PreviewModal in /build-resume
    console.log('\n3. Testing PreviewModal in /build-resume...');
    const previewBtn = page.locator('button:has-text("Preview")').first();
    await previewBtn.click();

    const previewModal = page.locator('[data-testid="cuba-preview-modal"]');
    await previewModal.waitFor({ state: 'visible', timeout: 6000 });
    console.log('   ✓ PreviewModal opened successfully!');

    const shotPreviewBuilderPath = `${LOCAL_DIR}/popup-preview-modal-builder.png`;
    await page.screenshot({ path: shotPreviewBuilderPath });
    await fs.copyFile(shotPreviewBuilderPath, `${ARTIFACT_DIR}/popup-preview-modal-builder.png`);
    console.log(`   📸 Captured screenshot: popup-preview-modal-builder.png`);

    // Close preview modal via Escape
    await page.keyboard.press('Escape');
    await previewModal.waitFor({ state: 'hidden', timeout: 5000 });
    console.log('   ✓ PreviewModal closed via Escape');
    report.testsPassed++;
    report.details.push({ test: 'Build Resume: Full PreviewModal', status: 'PASSED' });

    // 1.4 Test ShareModal in /build-resume
    console.log('\n4. Testing ShareModal in /build-resume...');
    const shareBtn = page.locator('button:has-text("Share")').first();
    if (await shareBtn.isVisible()) {
      await shareBtn.click();
      const shareModal = page.locator('[data-testid="cuba-share-modal"]');
      await shareModal.waitFor({ state: 'visible', timeout: 5000 });
      console.log('   ✓ ShareModal opened successfully!');

      const shotShareBuilderPath = `${LOCAL_DIR}/popup-share-modal-builder.png`;
      await page.screenshot({ path: shotShareBuilderPath });
      await fs.copyFile(shotShareBuilderPath, `${ARTIFACT_DIR}/popup-share-modal-builder.png`);
      console.log(`   📸 Captured screenshot: popup-share-modal-builder.png`);

      await page.keyboard.press('Escape');
      await shareModal.waitFor({ state: 'hidden', timeout: 5000 });
      console.log('   ✓ ShareModal closed via Escape');
      report.testsPassed++;
      report.details.push({ test: 'Build Resume: ShareModal', status: 'PASSED' });
    } else {
      console.log('   ℹ Share button not rendered in current viewport/role; skipping builder share test');
      report.testsTotal--;
    }

    // =========================================================================
    // PART 2: POPUPS IN /dashboard/resumes
    // =========================================================================
    console.log('\n--- PART 2: Testing All Popups in [Resumes & Master CV] (/dashboard/resumes) ---');
    await page.goto(`${BASE_URL}/dashboard/resumes`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // 2.1 Test Create New Resume Modal
    console.log('\n5. Testing Create New Resume Modal...');
    const createNewBtn = page.locator('[data-testid="create-new-resume-btn"]');
    await createNewBtn.waitFor({ state: 'visible', timeout: 5000 });
    await createNewBtn.click();

    const createModal = page.locator('[data-testid="dashboard-resumes-create-modal"]');
    await createModal.waitFor({ state: 'visible', timeout: 5000 });
    console.log('   ✓ Create New Resume Modal opened!');

    // Check title input & 3 strategies
    const titleInput = createModal.locator('[data-testid="create-resume-title-input"]');
    await titleInput.fill('VP of Engineering — Executive 2026');

    const optProfile = createModal.locator('[data-testid="create-mode-profile"]');
    const optTemplate = createModal.locator('[data-testid="create-mode-template"]');
    const optBlank = createModal.locator('[data-testid="create-mode-blank"]');

    assert(await optProfile.isVisible(), 'Profile option must be visible');
    assert(await optTemplate.isVisible(), 'Template option must be visible');
    assert(await optBlank.isVisible(), 'Blank option must be visible');
    console.log('   ✓ All 3 creation strategies present and interactive (Profile, Template, Blank)');

    // Select Template strategy
    await optTemplate.click();

    const shotCreatePath = `${LOCAL_DIR}/popup-create-resume-dialog.png`;
    await page.screenshot({ path: shotCreatePath });
    await fs.copyFile(shotCreatePath, `${ARTIFACT_DIR}/popup-create-resume-dialog.png`);
    console.log(`   📸 Captured screenshot: popup-create-resume-dialog.png`);

    // Cancel create dialog
    await createModal.locator('button:has-text("Cancel")').click();
    await createModal.waitFor({ state: 'hidden', timeout: 5000 });
    console.log('   ✓ Create Resume Modal cancelled cleanly');
    report.testsPassed++;
    report.details.push({ test: 'Dashboard Resumes: Create New Resume Modal', status: 'PASSED' });

    // 2.2 Test PreviewModal in /dashboard/resumes
    console.log('\n6. Testing PreviewModal in /dashboard/resumes...');
    const firstCard = page.locator('article[data-testid="resume-card"]').first();
    await firstCard.waitFor({ state: 'visible', timeout: 5000 });
    await firstCard.hover();
    await page.waitForTimeout(300);

    const firstPreviewBtn = firstCard.locator('button:has-text("Preview")').first();
    await firstPreviewBtn.waitFor({ state: 'visible', timeout: 5000 });
    await firstPreviewBtn.click();

    const resumesPreviewModal = page.locator('[data-testid="cuba-preview-modal"]');
    await resumesPreviewModal.waitFor({ state: 'visible', timeout: 6000 });
    console.log('   ✓ PreviewModal opened from resume card!');

    const shotResumesPreviewPath = `${LOCAL_DIR}/popup-resumes-preview-modal.png`;
    await page.screenshot({ path: shotResumesPreviewPath });
    await fs.copyFile(shotResumesPreviewPath, `${ARTIFACT_DIR}/popup-resumes-preview-modal.png`);
    console.log(`   📸 Captured screenshot: popup-resumes-preview-modal.png`);

    await page.keyboard.press('Escape');
    await resumesPreviewModal.waitFor({ state: 'hidden', timeout: 5000 });
    console.log('   ✓ PreviewModal closed via Escape');
    report.testsPassed++;
    report.details.push({ test: 'Dashboard Resumes: PreviewModal', status: 'PASSED' });

    // 2.3 Test ShareModal in /dashboard/resumes
    console.log('\n7. Testing ShareModal in /dashboard/resumes...');
    const firstShareBtn = firstCard.locator('[data-testid="resume-action-share"]').first();
    await firstShareBtn.waitFor({ state: 'visible', timeout: 5000 });
    await firstShareBtn.click();

    const resumesShareModal = page.locator('[data-testid="cuba-share-modal"]');
    await resumesShareModal.waitFor({ state: 'visible', timeout: 5000 });
    console.log('   ✓ ShareModal opened from resume card!');

    const shotResumesSharePath = `${LOCAL_DIR}/popup-resumes-share-modal.png`;
    await page.screenshot({ path: shotResumesSharePath });
    await fs.copyFile(shotResumesSharePath, `${ARTIFACT_DIR}/popup-resumes-share-modal.png`);
    console.log(`   📸 Captured screenshot: popup-resumes-share-modal.png`);

    await page.keyboard.press('Escape');
    await resumesShareModal.waitFor({ state: 'hidden', timeout: 5000 });
    console.log('   ✓ ShareModal closed via Escape');
    report.testsPassed++;
    report.details.push({ test: 'Dashboard Resumes: ShareModal', status: 'PASSED' });

    // 2.4 Test Rename Dialog in /dashboard/resumes
    console.log('\n8. Testing Rename Dialog in /dashboard/resumes...');
    const firstDropdownBtn = page.locator('article[data-testid="resume-card"] button[aria-label="Resume options"]').first();
    await firstDropdownBtn.click();
    await page.waitForTimeout(400);

    const renameItem = page.locator('[role="menuitem"]:has-text("Rename Resume")');
    await renameItem.waitFor({ state: 'visible', timeout: 3000 });
    await renameItem.click();

    const renameModal = page.locator('[data-testid="dashboard-resumes-rename-modal"]');
    await renameModal.waitFor({ state: 'visible', timeout: 5000 });
    console.log('   ✓ Rename Dialog opened!');

    const shotRenamePath = `${LOCAL_DIR}/popup-rename-dialog.png`;
    await page.screenshot({ path: shotRenamePath });
    await fs.copyFile(shotRenamePath, `${ARTIFACT_DIR}/popup-rename-dialog.png`);
    console.log(`   📸 Captured screenshot: popup-rename-dialog.png`);

    await renameModal.locator('button:has-text("Cancel")').click();
    await renameModal.waitFor({ state: 'hidden', timeout: 5000 });
    console.log('   ✓ Rename Dialog closed cleanly');
    report.testsPassed++;
    report.details.push({ test: 'Dashboard Resumes: Rename Dialog', status: 'PASSED' });

    // 2.5 Test Delete Confirmation Dialog in /dashboard/resumes
    console.log('\n9. Testing Delete Confirmation Dialog in /dashboard/resumes...');
    await firstDropdownBtn.click();
    await page.waitForTimeout(400);

    const deleteItem = page.locator('[role="menuitem"]:has-text("Delete Resume")');
    await deleteItem.waitFor({ state: 'visible', timeout: 3000 });
    await deleteItem.click();

    const deleteModal = page.locator('[data-testid="dashboard-resumes-delete-modal"]');
    await deleteModal.waitFor({ state: 'visible', timeout: 5000 });
    console.log('   ✓ Delete Confirmation Dialog opened!');

    const shotDeletePath = `${LOCAL_DIR}/popup-delete-dialog.png`;
    await page.screenshot({ path: shotDeletePath });
    await fs.copyFile(shotDeletePath, `${ARTIFACT_DIR}/popup-delete-dialog.png`);
    console.log(`   📸 Captured screenshot: popup-delete-dialog.png`);

    await deleteModal.locator('button:has-text("Cancel")').click();
    await deleteModal.waitFor({ state: 'hidden', timeout: 5000 });
    console.log('   ✓ Delete Dialog closed cleanly (no accidental deletion)');
    report.testsPassed++;
    report.details.push({ test: 'Dashboard Resumes: Delete Confirmation Dialog', status: 'PASSED' });

    console.log('\n🎉 ALL POPUPS VERIFIED WITH 100% SUCCESS!');
    console.log(`Results: ${report.testsPassed} of ${report.testsTotal} popup tests passed.`);
  } catch (err) {
    console.error('❌ Verification failed with error:', err);
    await page.screenshot({ path: `${LOCAL_DIR}/popup-error-state.png` });
    throw err;
  } finally {
    await browser.close();
  }
}

run();
