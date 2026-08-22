import { test, expect } from '@playwright/test';

const LIVE_URL = 'https://airesume.projectdemo.guru';
const TEST_TIMEOUT = 120000;
const SLOW_MO = 500; 

test.describe('Super Admin Live Production Forensic Audit', () => {
  test.setTimeout(TEST_TIMEOUT);
  test.use({ actionTimeout: 15000, navigationTimeout: 30000 });

  let page;
  let context;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('Phase 1: Authenticate and Verify MFA Bypass / Admin Boundaries', async () => {
    await page.goto(`${LIVE_URL}/adm/login`);
    
    // Login
    await page.fill('input[type="email"]', 'bhaskar.beyond@gmail.com');
    await page.fill('input[type="password"]', 'Bhaskar@1998');
    await page.click('button:has-text("Sign in")');

    // Wait for Dashboard
    await page.waitForURL('**/adm/dashboard');
    await expect(page.locator('text=Super Admin Command Center')).toBeVisible();
    
    // Verify Security Constraints
    const securityPanel = page.locator('text=Active Super Admin Session');
    await expect(securityPanel).toBeVisible();
  });

  test('Phase 2: Users Module CRUD', async () => {
    await page.click('a[href="/adm/users"]');
    await expect(page.locator('text=Global Users Registry')).toBeVisible();
    
    // Read: Verify users populate
    await page.waitForSelector('table tbody tr');
    const userCount = await page.locator('table tbody tr').count();
    expect(userCount).toBeGreaterThan(0);
    
    // Search for test user (if exists, skip creation, else we would create, but for safety in prod, we will just read/filter)
    await page.fill('input[placeholder="Search users..."]', 'bhaskar.beyond@gmail.com');
    await page.waitForTimeout(1000);
    await expect(page.locator('table tbody tr')).toContainText('bhaskar.beyond@gmail.com');
  });

  test('Phase 3: Tenants Module CRUD', async () => {
    await page.click('a[href="/adm/tenants"]');
    await expect(page.locator('text=Enterprise Tenants Registry')).toBeVisible();
    
    // The provision button must be visible because ENTERPRISE_TENANCY_ENABLED=true
    await expect(page.locator('button:has-text("Provision Tenant")')).toBeVisible();
    
    // Create Disposable Tenant
    const testTenantSlug = `test-tenant-${Date.now()}`;
    await page.click('button:has-text("Provision Tenant")');
    await expect(page.locator('h3:has-text("Provision Enterprise Tenant")')).toBeVisible();
    
    await page.fill('input[placeholder="Acme Corp"]', 'Forensic Audit Test Tenant');
    await page.fill('input[placeholder="acme-corp"]', testTenantSlug);
    await page.click('button:has-text("Provision & Initialize")');
    
    // Wait for creation to complete
    await expect(page.locator('text=Tenant provisioned successfully')).toBeVisible({ timeout: 15000 });
    
    // Search
    await page.fill('input[placeholder="Search tenants..."]', testTenantSlug);
    await page.waitForTimeout(1000);
    await expect(page.locator('table tbody tr')).toContainText('Forensic Audit Test Tenant');
    
    // Suspend
    await page.click('button:has-text("Suspend")');
    await expect(page.locator('text=Suspend Organization')).toBeVisible();
    await page.click('button:has-text("Suspend")');
    await expect(page.locator('text=Tenant lifecycle updated')).toBeVisible();
    
    // Reactivate
    await page.click('button:has-text("Reactivate")');
    await expect(page.locator('text=Reactivate Organization')).toBeVisible();
    await page.click('button:has-text("Reactivate")');
    await expect(page.locator('text=Tenant lifecycle updated')).toBeVisible();
    
    // Decommission (Cleanup)
    await page.click('button:has-text("Decommission")');
    await expect(page.locator('h3:has-text("Decommission Tenant")')).toBeVisible();
    await page.fill('input[placeholder="Reason for decommissioning"]', 'Forensic audit cleanup');
    await page.click('button:has-text("Confirm Permanent Decommission")');
    await expect(page.locator('text=Tenant permanently decommissioned')).toBeVisible({ timeout: 15000 });
  });

  test('Phase 4: Security & Audit Modules', async () => {
    // Check Security Policies
    await page.click('a[href="/adm/security"]');
    await expect(page.locator('text=Security & MFA Policies')).toBeVisible();
    
    // Check Audit Logs
    await page.click('a[href="/adm/audit-logs"]');
    await expect(page.locator('text=Platform Audit Logs')).toBeVisible();
    await page.waitForSelector('table tbody tr');
    
    // The decommission event we just ran should be near the top
    await expect(page.locator('table tbody')).toContainText('tenant_decommissioned');
  });

  test('Phase 5: Queues & Error Handling', async () => {
    await page.click('a[href="/adm/queues"]');
    await expect(page.locator('text=Platform Queues & DLQ')).toBeVisible();
    // Verify tabs render
    await expect(page.locator('button:has-text("DLQ Messages")')).toBeVisible();
  });
});
