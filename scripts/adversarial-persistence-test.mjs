// scripts/adversarial-persistence-test.mjs
// Challenge 8: Database Mutation & Persistence Test
// Flow: CREATE -> MariaDB Check -> Hard Reload -> UPDATE -> MariaDB Check -> Hard Reload -> SUSPEND -> MariaDB Check -> Hard Reload -> CLEANUP -> MariaDB Check -> Hard Reload

import { chromium } from 'playwright';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const BASE_URL = 'https://ai-resume-builder.local';
const MYSQL_BIN = 'd:\\xampp\\mysql\\bin\\mysql.exe';
const DB_NAME = 'ai_resume_builder';

function queryMariaDb(sql) {
  try {
    const raw = execSync(`"${MYSQL_BIN}" -u root ${DB_NAME} -e "${sql.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return raw.trim();
  } catch (err) {
    throw new Error(`MariaDB Query Failed: ${err.message}`);
  }
}

// Initialize Firebase Admin for custom token generation
const svcPath = path.resolve('backend/conf/serviceAccountKey.json');
if (!admin.apps.length) {
  if (existsSync(svcPath)) {
    const svc = JSON.parse(readFileSync(svcPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(svc) });
  } else {
    admin.initializeApp({ projectId: 'ai-resume-builder-fe92d' });
  }
}

async function runPersistenceTest() {
  console.log('\n============================================================');
  console.log('🚀 CHALLENGE 8: DATABASE MUTATION & PERSISTENCE LIFECYCLE');
  console.log('============================================================\n');

  const customToken = await admin.auth().createCustomToken('superadmin-persistence-test', {
    role: 'SUPER_ADMIN',
    superAdmin: true,
    sign_in_second_factor: 'totp',
    email: 'superadmin@ai-resume-builder.local'
  });

  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--no-sandbox']
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const testSlug = `adv-persist-${Date.now().toString(36)}`;
  const initialName = `Adv Persist Corp ${Date.now().toString(36)}`;
  const updatedName = `Adv Persist Corp Updated ${Date.now().toString(36)}`;

  console.log(`[TARGET] Test Tenant Slug: ${testSlug}`);
  console.log(`[TARGET] Initial Name: ${initialName}`);
  console.log(`[TARGET] Updated Name: ${updatedName}`);

  try {
    // 1. Authenticate
    console.log('\n[PHASE 1] Super Admin Auth & Navigation...');
    await page.goto(`${BASE_URL}/adm/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (token) => {
      await window.fire.auth().signInWithCustomToken(token);
    }, customToken);
    await page.waitForTimeout(1500);

    // 2. Navigate to Tenants Registry
    console.log('[PHASE 2] Navigating to /adm/tenants...');
    await page.goto(`${BASE_URL}/adm/tenants`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Verify page loaded
    const pageTitle = await page.locator('h1').innerText();
    console.log(`[PASS] Page Title: ${pageTitle.trim()}`);

    // 3. CREATE / PROVISION TENANT
    console.log('\n[PHASE 3] Executing CREATE Tenant via UI...');
    await page.locator('button:has-text("Provision Tenant")').click();
    await page.waitForSelector('input[placeholder="e.g. Acme Corporation"]', { state: 'visible', timeout: 5000 });

    await page.fill('input[placeholder="e.g. Acme Corporation"]', initialName);
    await page.fill('input[placeholder="e.g. acme-corp"]', testSlug);
    
    // Submit Provision
    await page.locator('button:has-text("Create Organization")').click();
    await page.waitForTimeout(3000);

    // 4. Verify in MariaDB
    console.log('[PHASE 4] Verifying Row in MariaDB enterprise_tenants...');
    const dbRow1 = queryMariaDb(`SELECT id, slug, displayName, lifecycleState, isolationTier FROM enterprise_tenants WHERE slug = '${testSlug}'`);
    console.log(`[DB QUERY RESULT]\n${dbRow1}`);
    if (!dbRow1.includes(testSlug) || !dbRow1.includes('ACTIVE')) {
      throw new Error(`MariaDB verification failed: tenant ${testSlug} not found in ACTIVE state!`);
    }
    console.log('✅ [VERIFIED IN MARIADB] Row exists with state ACTIVE');

    // 5. Hard Reload & Check UI Rendering
    console.log('\n[PHASE 5] Hard Reloading Page & Verifying UI Rendering...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const rowLocator = page.locator(`tr:has-text("${testSlug}")`);
    await rowLocator.waitFor({ state: 'visible', timeout: 5000 });
    const rowText1 = await rowLocator.innerText();
    console.log(`[UI ROW TEXT]: ${rowText1.replace(/\s+/g, ' ')}`);
    if (!rowText1.includes(initialName) || !rowText1.includes('ACTIVE')) {
      throw new Error(`UI table verification failed for initial create!`);
    }
    console.log('✅ [VERIFIED IN UI] Row rendered correctly with displayName and ACTIVE badge after hard reload');

    // 6. UPDATE / RENAME TENANT
    console.log('\n[PHASE 6] Executing UPDATE (Rename) via Workspace 360 UI...');
    const wsButton = rowLocator.locator('button:has-text("Workspace 360")');
    await wsButton.click();
    await page.waitForSelector('#platform-tenant-name', { state: 'visible', timeout: 5000 });

    await page.fill('#platform-tenant-name', updatedName);
    await page.locator('button:has-text("Rename")').click();
    await page.waitForTimeout(2500);

    // 7. Verify in MariaDB
    console.log('[PHASE 7] Verifying UPDATE in MariaDB enterprise_tenants...');
    const dbRow2 = queryMariaDb(`SELECT id, slug, displayName, lifecycleState FROM enterprise_tenants WHERE slug = '${testSlug}'`);
    console.log(`[DB QUERY RESULT]\n${dbRow2}`);
    if (!dbRow2.includes(updatedName)) {
      throw new Error(`MariaDB verification failed: displayName was not updated to "${updatedName}"!`);
    }
    console.log('✅ [VERIFIED IN MARIADB] displayName successfully mutated in database');

    // Close Modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // 8. Hard Reload & Check UI Rendering
    console.log('\n[PHASE 8] Hard Reloading Page & Verifying Updated UI Rendering...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const rowLocator2 = page.locator(`tr:has-text("${testSlug}")`);
    await rowLocator2.waitFor({ state: 'visible', timeout: 5000 });
    const rowText2 = await rowLocator2.innerText();
    console.log(`[UI ROW TEXT]: ${rowText2.replace(/\s+/g, ' ')}`);
    if (!rowText2.includes(updatedName)) {
      throw new Error(`UI table verification failed for updated name!`);
    }
    console.log('✅ [VERIFIED IN UI] Updated displayName rendered correctly after hard reload');

    // 9. SUSPEND TENANT
    console.log('\n[PHASE 9] Executing SUSPEND via UI...');
    const suspendBtn = rowLocator2.locator('button:has-text("Suspend")');
    await suspendBtn.click();
    await page.waitForTimeout(2500);

    // 10. Verify in MariaDB
    console.log('[PHASE 10] Verifying SUSPENDED in MariaDB enterprise_tenants...');
    const dbRow3 = queryMariaDb(`SELECT id, slug, displayName, lifecycleState FROM enterprise_tenants WHERE slug = '${testSlug}'`);
    console.log(`[DB QUERY RESULT]\n${dbRow3}`);
    if (!dbRow3.includes('SUSPENDED')) {
      throw new Error(`MariaDB verification failed: lifecycleState was not changed to SUSPENDED!`);
    }
    console.log('✅ [VERIFIED IN MARIADB] lifecycleState is SUSPENDED in database');

    // 11. Hard Reload & Check UI Rendering
    console.log('\n[PHASE 11] Hard Reloading Page & Verifying SUSPENDED Badge...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const rowLocator3 = page.locator(`tr:has-text("${testSlug}")`);
    await rowLocator3.waitFor({ state: 'visible', timeout: 5000 });
    const rowText3 = await rowLocator3.innerText();
    console.log(`[UI ROW TEXT]: ${rowText3.replace(/\s+/g, ' ')}`);
    if (!rowText3.includes('SUSPENDED')) {
      throw new Error(`UI table verification failed for SUSPENDED badge!`);
    }
    console.log('✅ [VERIFIED IN UI] SUSPENDED badge rendered correctly after hard reload');

    // 12. CLEANUP & REVERT
    console.log('\n[PHASE 12] Cleaning up Test Record from MariaDB...');
    queryMariaDb(`DELETE FROM enterprise_tenants WHERE slug = '${testSlug}'`);
    const dbCheckFinal = queryMariaDb(`SELECT COUNT(*) FROM enterprise_tenants WHERE slug = '${testSlug}'`);
    console.log(`[DB COUNT AFTER CLEANUP]: ${dbCheckFinal}`);

    // 13. Final Reload Verification
    console.log('[PHASE 13] Hard Reloading Page & Confirming Record Eviction...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const rowCount = await page.locator(`tr:has-text("${testSlug}")`).count();
    if (rowCount !== 0) {
      throw new Error(`Cleanup failed: test tenant still visible in UI!`);
    }
    console.log('✅ [VERIFIED IN UI] Test tenant cleanly evicted from UI');

    console.log('\n============================================================');
    console.log('🏆 CHALLENGE 8 FULL LIFECYCLE 100% PASSED');
    console.log('  - CREATE -> MariaDB Checked -> Hard Reload Verified');
    console.log('  - UPDATE -> MariaDB Checked -> Hard Reload Verified');
    console.log('  - SUSPEND -> MariaDB Checked -> Hard Reload Verified');
    console.log('  - CLEANUP -> MariaDB Checked -> Hard Reload Verified');
    console.log('  - Zero console errors: ' + (consoleErrors.length === 0 ? 'TRUE' : 'FALSE (' + consoleErrors.join(', ') + ')'));
    console.log('============================================================\n');

  } finally {
    await browser.close();
  }
}

runPersistenceTest().catch(err => {
  console.error('\n❌ FATAL ERROR in Challenge 8:', err);
  process.exit(1);
});
