import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

import mysql from 'mysql2/promise';

const adminMod = await import('../backend/services/firebaseAdmin.js');
const admin = adminMod.default || adminMod;

if (!admin.apps?.length) {
  const pKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: pKey,
    }),
  });
}

const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'ai_resume_builder',
  port: 3306,
});

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  page.on('console', msg => console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.error(`[BROWSER PAGE ERROR]:`, err));

  // Find admin user
  const [admins] = await pool.query("SELECT email, id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1");
  const user = admins[0];
  console.log(`[TEST] Using admin user: ${user.email} (${user.id})`);

  const customToken = await admin.auth().createCustomToken(user.id, {
    role: 'SUPER_ADMIN',
    superAdmin: true,
    sign_in_second_factor: 'totp',
    permissions: ['*']
  });

  await page.goto('https://ai-resume-builder.local/adm/tenants', { waitUntil: 'networkidle' });

  // Sign in via custom token
  await page.evaluate(async (token) => {
    await window.fire.auth().signInWithCustomToken(token);
  }, customToken);

  await page.waitForTimeout(1500);
  await page.goto('https://ai-resume-builder.local/adm/tenants', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const testSlug = `adv-crud-${Date.now()}`;
  const initialName = `Adv Persistence ${Date.now()}`;
  const updatedName = `Adv Persistence Updated ${Date.now()}`;

  console.log(`\n=== STEP 1: PROVISION TENANT ===`);
  await page.click('button:has-text("Provision Tenant")');
  await page.waitForSelector('input[name="displayName"], input#platform-provision-name, input[placeholder*="Acme Corp"]', { timeout: 5000 });

  // Fill modal
  const nameInputs = await page.locator('input').all();
  for (const input of nameInputs) {
    const ph = await input.getAttribute('placeholder');
    const nameAttr = await input.getAttribute('name');
    if (ph?.includes('Acme') || nameAttr === 'displayName') {
      await input.fill(initialName);
    }
    if (ph?.includes('acme') || nameAttr === 'slug') {
      await input.fill(testSlug);
    }
  }

  // Click Submit in modal
  await page.click('button[type="submit"]:has-text("Provision"), button:has-text("Provision Tenant"):visible >> nth=-1');
  await page.waitForTimeout(3000);

  // Check MariaDB
  const [rowsAfterCreate] = await pool.query("SELECT id, slug, displayName, lifecycleState FROM enterprise_tenants WHERE slug = ?", [testSlug]);
  console.log(`[DB CREATE CHECK]:`, rowsAfterCreate);

  if (rowsAfterCreate.length === 0) {
    console.error('CREATE failed to write to DB!');
    await browser.close();
    await pool.end();
    return;
  }

  console.log(`\n=== STEP 2: HARD RELOAD AND VERIFY UI ===`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const rowText = await page.locator(`tr:has-text("${testSlug}")`).innerText();
  console.log(`[UI ROW TEXT AFTER RELOAD]:`, rowText);

  console.log(`\n=== STEP 3: UPDATE (RENAME) VIA WORKSPACE 360 ===`);
  const targetRow = page.locator(`tr:has-text("${testSlug}")`);
  const ws360Btn = targetRow.locator('button:has-text("Workspace 360")');
  console.log(`Workspace 360 button count:`, await ws360Btn.count());
  await ws360Btn.click();
  await page.waitForTimeout(2000);

  // Look for rename input
  const renameInput = page.locator('#platform-tenant-name');
  console.log(`Rename input count:`, await renameInput.count());
  if (await renameInput.count() > 0) {
    console.log(`Current input value:`, await renameInput.inputValue());
    await renameInput.fill(updatedName);
    const renameBtn = page.locator('button:has-text("Rename")');
    console.log(`Rename button count:`, await renameBtn.count());
    await renameBtn.click();
    await page.waitForTimeout(2000);
  }

  // Check MariaDB after rename
  const [rowsAfterUpdate] = await pool.query("SELECT id, slug, displayName, lifecycleState FROM enterprise_tenants WHERE slug = ?", [testSlug]);
  console.log(`[DB UPDATE CHECK]:`, rowsAfterUpdate);

  // Close modal if open
  const closeBtn = page.locator('button:has-text("Close"), button[aria-label="Close"], button svg.lucide-x').first();
  if (await closeBtn.count() > 0) {
    await closeBtn.click().catch(() => {});
    await page.waitForTimeout(1000);
  }

  console.log(`\n=== STEP 4: SUSPEND TENANT ===`);
  // Reload to clean up modal
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const suspendBtn = page.locator(`tr:has-text("${testSlug}") button:has-text("Suspend")`);
  console.log(`Suspend button count:`, await suspendBtn.count());
  if (await suspendBtn.count() > 0) {
    await suspendBtn.click();
    await page.waitForTimeout(1000);
    // Handle confirmation modal if present
    const confirmBtn = page.locator('div[role="dialog"] button:has-text("Suspend"), div.fixed button:has-text("Suspend") >> nth=-1');
    console.log(`Confirm Suspend button count:`, await confirmBtn.count());
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  // Check MariaDB after suspend
  const [rowsAfterSuspend] = await pool.query("SELECT id, slug, displayName, lifecycleState FROM enterprise_tenants WHERE slug = ?", [testSlug]);
  console.log(`[DB SUSPEND CHECK]:`, rowsAfterSuspend);

  console.log(`\n=== STEP 5: CLEANUP TEST RECORD ===`);
  await pool.query("DELETE FROM enterprise_tenants WHERE slug = ?", [testSlug]);
  const [rowsAfterDelete] = await pool.query("SELECT id FROM enterprise_tenants WHERE slug = ?", [testSlug]);
  console.log(`[DB CLEANUP CHECK]: Remaining rows:`, rowsAfterDelete.length);

  await browser.close();
  await pool.end();
}

main().catch(err => {
  console.error('[FATAL]:', err);
  process.exit(1);
});
