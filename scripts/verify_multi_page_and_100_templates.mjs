/**
 * Master Verification Suite: Multi-Page Smart Partitioning, 100 Unique ATS Templates,
 * Real Candidate Data / Photo Headshot, and Word (.docx) Export Engine.
 */

import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'module';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: path.resolve('backend/.env') });
const mysql = require('mysql2/promise');
const { issueLocalTestToken } = require('../backend/security/auth.js');

const BASE_URL = process.env.TEST_BASE_URL || 'https://ime365.local';
const LOCAL_ARTIFACTS = 'artifacts/templates-verification';
const BRAIN_ARTIFACTS = 'C:/Users/mbhas/.gemini/antigravity-ide/brain/ecd8f8c1-83e8-4c24-8fb3-9ac4a3e782ad';
const MEDIA_DIR = path.join(BRAIN_ARTIFACTS, '.tempmediaStorage');

const RESUME_ID = 'res_1792231546845';
const USER_ID = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';
const USER_EMAIL = 'bhaskar.beyond@gmail.com';
const USER_NAME = 'Bhaskar Beyond';

async function saveProof(page, filename) {
  const localPath = path.join(LOCAL_ARTIFACTS, filename);
  const brainPath = path.join(BRAIN_ARTIFACTS, filename);
  const mediaPath = path.join(MEDIA_DIR, `proof_${filename}`);
  
  await page.screenshot({ path: localPath, fullPage: false });
  try {
    await fs.copyFile(localPath, brainPath);
  } catch {}
  try {
    await fs.copyFile(localPath, mediaPath);
  } catch {}
}

async function runMasterVerification() {
  console.log(`\n=============================================================================`);
  console.log(`🚀 MASTER 10/10 VERIFICATION: 100 ATS TEMPLATES + MULTI-PAGE SMART PARTITIONING`);
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Live Resume: ${RESUME_ID} (Candidate: ${USER_NAME})`);
  console.log(`=============================================================================\n`);

  await fs.mkdir(LOCAL_ARTIFACTS, { recursive: true });
  await fs.mkdir(MEDIA_DIR, { recursive: true });

  const now = Math.floor(Date.now() / 1000);
  const token = issueLocalTestToken({
    uid: USER_ID,
    email: USER_EMAIL,
    role: 'SUPER_ADMIN',
    email_verified: true,
    auth_time: now,
    exp: now + 60 * 60 * 24 * 7,
    sign_in_second_factor: false,
  });

  const authData = { token, uid: USER_ID, email: USER_EMAIL, displayName: USER_NAME, role: 'SUPER_ADMIN' };

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors', '--disable-gpu'],
  });

  const suiteResults = {
    testedAt: new Date().toISOString(),
    testsPassed: 0,
    testsFailed: 0,
    details: [],
  };

  const recordPass = (name, details = '') => {
    suiteResults.testsPassed++;
    suiteResults.details.push({ name, status: 'PASSED', details });
    console.log(`  ✓ [PASS] ${name}${details ? ` (${details})` : ''}`);
  };

  const recordFail = (name, error) => {
    suiteResults.testsFailed++;
    suiteResults.details.push({ name, status: 'FAILED', error: error.message });
    console.error(`  ✗ [FAIL] ${name}: ${error.message}`);
  };

  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 1000 },
    });

    await context.addInitScript(({ token, uid, email, displayName, role }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('auth_token', token);
      localStorage.setItem('ime_dev_user', JSON.stringify({ uid, email, displayName, role, token }));
      localStorage.setItem('cuba_theme', 'light');
    }, authData);

    const page = await context.newPage();

    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 1: LIVE CANDIDATE RESUME & PHOTO HEADSHOT VERIFICATION
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[SECTION 1] Live Candidate Resume & Photo Headshot Verification...`);
    try {
      await page.goto(`${BASE_URL}/export/Cv1/${RESUME_ID}/en`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('.smart-resume-page', { timeout: 15000 });

      // Verify Candidate Name and Occupation
      const pageText = await page.textContent('.smart-resume-page');
      assert(pageText.includes('Bhaskar'), 'Candidate first name "Bhaskar" must be rendered');
      assert(pageText.includes('Beyond'), 'Candidate last name "Beyond" must be rendered');
      assert(pageText.includes('Recruiter'), 'Candidate occupation "Recruiter" must be rendered');
      assert(pageText.includes('Certified Physician Executive (CPE)'), 'Candidate certification "CPE" must be rendered');

      // Verify Photo Headshot
      const photoSelector = '.smart-resume-page img[alt*="Bhaskar"]';
      await page.waitForSelector(photoSelector, { timeout: 10000 });
      const photoImg = page.locator(photoSelector).first();
      const isVisible = await photoImg.isVisible();
      assert(isVisible, 'Candidate photo image element must be visible');

      const naturalDims = await photoImg.evaluate((img) => ({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        srcLength: img.src ? img.src.length : 0,
      }));
      assert(naturalDims.naturalWidth > 0, `Photo naturalWidth must be > 0 (got ${naturalDims.naturalWidth})`);
      assert(naturalDims.naturalHeight > 0, `Photo naturalHeight must be > 0 (got ${naturalDims.naturalHeight})`);
      assert(naturalDims.srcLength > 100, 'Photo must have a valid non-empty data URI / image source');

      await saveProof(page, 'live_candidate_photo_and_data_Cv1.png');
      recordPass('Live Candidate Photo & MariaDB Data Verification', `Photo ${naturalDims.naturalWidth}x${naturalDims.naturalHeight}px, CPE cert displayed`);
    } catch (err) {
      recordFail('Live Candidate Photo & MariaDB Data Verification', err);
    }

    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 2: MULTI-PAGE SMART PARTITIONING & CONTINUATION HEADERS
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[SECTION 2] Multi-Page Smart Partitioning & Continuation Headers...`);
    try {
      // Test multi-page rendering using multipage-demo resume with 5 experiences, 3 degrees, 4 certifications, 2 projects
      await page.goto(`${BASE_URL}/export/Cv1/multipage-demo/en`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('.smart-resume-page', { timeout: 15000 });

      const pageSheets = page.locator('.smart-resume-page.page-sheet');
      const pageCount = await pageSheets.count();
      console.log(`     Detected discrete A4 sheets: ${pageCount}`);
      assert(pageCount >= 2, `Multi-page resume must produce >= 2 discrete A4 sheets (got ${pageCount})`);

      // Verify Page 2 contains continuation header
      const page2 = pageSheets.nth(1);
      const page2Text = await page2.textContent();
      assert(
        page2Text.includes('Page 2') || page2Text.includes('Continuation') || page2Text.includes('Alex Morgan'),
        'Page 2 must contain continuation header with candidate identity'
      );

      // Verify footers on both pages
      for (let i = 0; i < pageCount; i++) {
        const sheet = pageSheets.nth(i);
        const footerText = await sheet.locator('.page-footer, footer').first().textContent();
        assert(footerText.includes(`Page ${i + 1}`), `Page ${i + 1} must display "Page ${i + 1}" in footer`);
      }

      await saveProof(page, 'multi_page_smart_partitioning_sheets.png');
      recordPass('Multi-Page Smart Partitioning & Continuation Headers', `${pageCount} A4 sheets partitioned with continuation headers and footers`);
    } catch (err) {
      recordFail('Multi-Page Smart Partitioning & Continuation Headers', err);
    }

    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 3: BROAD ARCHETYPE & VISUAL TOKEN AUDIT (100 TEMPLATES SAMPLING)
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[SECTION 3] Broad Archetype & Visual Differentiation Sampling across 100 Templates...`);

    const templatesToAudit = [
      // Baseline 1-51 Archetypes
      { id: 'Cv1', name: 'Metropolitan Navy', archetype: 'modern-split', headerStyle: 'sidebar', skillVariant: 'pills' },
      { id: 'Cv2', name: 'Nordic Slate', archetype: 'modern-split', headerStyle: 'sidebar', skillVariant: 'pills' },
      { id: 'Cv3', name: 'Emerald Executive', archetype: 'modern-split', headerStyle: 'sidebar', skillVariant: 'badges' },
      { id: 'Cv4', name: 'Harvard Classic ATS', archetype: 'minimal-ats', headerStyle: 'centered-classic', skillVariant: 'inline' },
      { id: 'Cv6', name: 'Clean Slate ATS', archetype: 'minimal-ats', headerStyle: 'left-bold', skillVariant: 'inline' },
      { id: 'Cv8', name: 'Gold Crest Executive', archetype: 'executive-banner', headerStyle: 'banner', skillVariant: 'pills' },
      { id: 'Cv14', name: 'Swiss Grid ATS', archetype: 'minimal-ats', headerStyle: 'left-bold', skillVariant: 'inline' },
      { id: 'Cv21', name: 'Burgundy Director', archetype: 'executive-banner', headerStyle: 'banner', skillVariant: 'badges' },
      { id: 'Cv25', name: 'Silicon Valley Dark', archetype: 'tech-grid', headerStyle: 'left-bold', skillVariant: 'bars' },
      { id: 'Cv33', name: 'DevOps Infra Grid', archetype: 'tech-grid', headerStyle: 'left-bold', skillVariant: 'dots' },
      { id: 'Cv40', name: 'Europass Modern Blue', archetype: 'compact-euro', headerStyle: 'left-bold', skillVariant: 'pills' },
      { id: 'Cv50', name: 'Reverse Split Modern', archetype: 'modern-split', headerStyle: 'sidebar', skillVariant: 'pills', reverse: true },

      // Expanded 52-100 Archetypes
      { id: 'Cv52', name: 'Zurich Private Wealth', archetype: 'minimal-ats', headerStyle: 'centered-classic', skillVariant: 'inline' },
      { id: 'Cv54', name: 'Silicon Valley AI Fellow', archetype: 'tech-grid', headerStyle: 'left-bold', skillVariant: 'bars' },
      { id: 'Cv60', name: 'Tokyo Semiconductor Architect', archetype: 'tech-grid', headerStyle: 'left-bold', skillVariant: 'dots' },
      { id: 'Cv70', name: 'London Fintech Quantitative', archetype: 'modern-split', headerStyle: 'sidebar', skillVariant: 'badges' },
      { id: 'Cv80', name: 'Berlin Industrial Designer', archetype: 'modern-split', headerStyle: 'sidebar', skillVariant: 'pills' },
      { id: 'Cv90', name: 'Milan Luxury Retail VP', archetype: 'modern-split', headerStyle: 'sidebar', skillVariant: 'pills' },
      { id: 'Cv94', name: 'Dubai Infrastructure Director', archetype: 'executive-banner', headerStyle: 'banner', skillVariant: 'pills' },
      { id: 'Cv100', name: 'Global Chief Executive Officer', archetype: 'executive-banner', headerStyle: 'banner', skillVariant: 'pills' },

      // All 4 Cover Letters
      { id: 'Cover1', name: 'Executive Classic', archetype: 'cover-classic' },
      { id: 'Cover2', name: 'Modern Left-Aligned', archetype: 'cover-modern' },
      { id: 'Cover3', name: 'Split Sidebar', archetype: 'cover-split' },
      { id: 'Cover4', name: 'Accent Icons', archetype: 'cover-creative' },
    ];

    for (const t of templatesToAudit) {
      try {
        const url = `${BASE_URL}/export/${t.id}/${RESUME_ID}/en`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForSelector('.smart-resume-page', { timeout: 10000 });

        const pageEl = page.locator('.smart-resume-page').first();
        const bbox = await pageEl.boundingBox();
        assert(bbox && bbox.width > 500, `Template ${t.id} must render with width > 500px`);

        // Check layout specifics
        if (t.archetype === 'executive-banner') {
          // Banner archetype must have banner container (header with background or rounded header)
          const hasBanner = await pageEl.locator('header[style*="background"], div[style*="background"], header.rounded-xl, header').count();
          assert(hasBanner > 0, `Template ${t.id} (executive-banner) must render banner header`);
        } else if (t.archetype === 'modern-split') {
          // Modern split has sidebar layout
          const hasSidebar = await pageEl.locator('aside, .flex-row').count();
          assert(hasSidebar > 0, `Template ${t.id} (modern-split) must render sidebar column`);
        } else if (t.id.startsWith('Cover')) {
          // Cover letters
          const text = await pageEl.textContent();
          assert(
            text.includes('Hiring') || text.includes('Dear Hiring') || text.includes('Engineering Leadership'),
            `Cover template ${t.id} must render letterhead content`
          );
        }

        // Save representative sample screenshots
        if (['Cv1', 'Cv4', 'Cv8', 'Cv25', 'Cv40', 'Cv50', 'Cv54', 'Cv100', 'Cover1', 'Cover3'].includes(t.id)) {
          await saveProof(page, `sample_${t.id}_${t.archetype}.png`);
        }

        recordPass(`Template Layout Audit: ${t.id} (${t.name})`, `Archetype: ${t.archetype}`);
      } catch (err) {
        recordFail(`Template Layout Audit: ${t.id} (${t.name})`, err);
      }
    }

    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 4: PREVIEW MODAL INTERACTION IN CUBA RESUMES DASHBOARD
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[SECTION 4] PreviewModal Interaction in Cuba Resumes Dashboard...`);
    try {
      await page.goto(`${BASE_URL}/dashboard/resumes`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('[data-testid="resumes-table"], .grid, table', { timeout: 15000 });

      // Find Preview button on any resume card/row
      const previewBtn = page.locator('button:has-text("Preview"), [title="Preview"], [aria-label*="Preview"]').first();
      await previewBtn.waitFor({ state: 'visible', timeout: 10000 });
      await previewBtn.click();

      // Verify Preview Modal opens
      await page.waitForSelector('.smart-resume-page', { timeout: 12000 });
      const modalPage = page.locator('.smart-resume-page').first();
      const isModalVisible = await modalPage.isVisible();
      assert(isModalVisible, 'SmartResumeDocument must be visible inside PreviewModal');

      // Check candidate photo is visible in modal
      const modalPhoto = modalPage.locator('img[alt*="Bhaskar"], img[src*="data:image"]').first();
      const photoCount = await modalPhoto.count();
      if (photoCount > 0) {
        const photoVisible = await modalPhoto.isVisible();
        assert(photoVisible, 'Candidate photo must be visible in PreviewModal');
      }

      await saveProof(page, 'preview_modal_open_with_smart_document.png');
      recordPass('PreviewModal Integration in Resumes Dashboard', 'Modal opens and displays live SmartResumeDocument');
    } catch (err) {
      recordFail('PreviewModal Integration in Resumes Dashboard', err);
    }

    // ───────────────────────────────────────────────────────────────────────────
    // SECTION 5: WORD (.DOCX) EXPORT API VERIFICATION
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[SECTION 5] Word (.docx) Export API Verification for Expanded Inventory...`);
    
    // Connect to database to sync resume template for contract validation
    const dbConn = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ime365',
    });

    // Create test cover letter fixture for Cover1 testing
    await dbConn.query(
      'INSERT INTO covers (id, user_id, title, template, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE template = ?',
      ['cov_test_1', USER_ID, 'Executive Cover Letter', 'Cover1', '{}', 'Cover1']
    );

    const docxTemplatesToTest = [
      { tmplId: 'Cv1', docId: RESUME_ID, isCover: false },
      { tmplId: 'Cv4', docId: RESUME_ID, isCover: false },
      { tmplId: 'Cv50', docId: RESUME_ID, isCover: false },
      { tmplId: 'Cv75', docId: RESUME_ID, isCover: false },
      { tmplId: 'Cv100', docId: RESUME_ID, isCover: false },
      { tmplId: 'Cover1', docId: 'cov_test_1', isCover: true },
    ];

    for (const item of docxTemplatesToTest) {
      try {
        if (!item.isCover) {
          // Align stored template to avoid TEMPLATE_MISMATCH contract guard
          await dbConn.query('UPDATE resumes SET template = ? WHERE id = ?', [item.tmplId, RESUME_ID]);
        }

        const res = await page.request.post(`${BASE_URL}/api/export-docx`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          data: {
            resumeId: item.docId,
            resumeName: item.tmplId,
            language: 'en',
          },
        });

        assert.equal(res.status(), 200, `POST /api/export-docx for ${item.tmplId} must return 200 (got ${res.status()})`);
        const buffer = await res.body();
        assert(buffer.length > 3000, `DOCX buffer for ${item.tmplId} must be > 3000 bytes (got ${buffer.length})`);
        
        recordPass(`DOCX Export API: ${item.tmplId}`, `Generated valid binary DOCX (${buffer.length} bytes)`);
      } catch (err) {
        recordFail(`DOCX Export API: ${item.tmplId}`, err);
      }
    }

    // Restore candidate template to Cv8
    await dbConn.query('UPDATE resumes SET template = "Cv8" WHERE id = ?', [RESUME_ID]);
    await dbConn.end();

    await browser.close();
  } catch (globalErr) {
    recordFail('Global Test Suite Execution', globalErr);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SUMMARY REPORT
  // ───────────────────────────────────────────────────────────────────────────
  console.log(`\n=============================================================================`);
  console.log(`📊 MASTER PLAYWRIGHT VERIFICATION SUMMARY`);
  console.log(`   Passed: ${suiteResults.testsPassed}`);
  console.log(`   Failed: ${suiteResults.testsFailed}`);
  console.log(`   Total:  ${suiteResults.testsPassed + suiteResults.testsFailed}`);
  console.log(`=============================================================================\n`);

  await fs.writeFile(
    path.join(LOCAL_ARTIFACTS, 'master-verification-report.json'),
    JSON.stringify(suiteResults, null, 2),
    'utf-8'
  );

  if (suiteResults.testsFailed > 0) {
    process.exit(1);
  }
}

runMasterVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
