// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Enterprise Console UI/UX Playwright E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // For this demonstration, we'll navigate to the localhost enterprise portal
    // Assuming the dev server is running on http://localhost:5173
    await page.goto('/enterprise');
  });

  test('should render the enterprise navigation sidebar with all modules', async ({ page }) => {
    // The sidebar should be visible
    const sidebar = page.locator('.enterprise-sidebar');
    await expect(sidebar).toBeVisible();

    // Check for the brand logo
    await expect(page.locator('.enterprise-brand-logo')).toBeVisible();

    // Verify all module navigation links are present
    const navLinks = page.locator('.enterprise-nav-item');
    await expect(navLinks).toHaveCount(7);

    // Verify the links by text content
    const expectedModules = [
      'Overview & Usage',
      'IAM & Roles',
      'Data & Resumes',
      'AI Administration',
      'Security & M2M',
      'Settings & Support',
      'Platform Admin'
    ];
    for (const mod of expectedModules) {
      await expect(page.locator(`.enterprise-nav-item:has-text("${mod}")`)).toBeVisible();
    }
  });

  test('should allow navigating between tabs and render respective components', async ({ page }) => {
    // Click on IAM & Roles
    await page.locator('.enterprise-nav-item:has-text("IAM & Roles")').click();
    await expect(page.locator('.enterprise-tab-title:has-text("Identity & Access Management")')).toBeVisible();

    // Click on AI Administration
    await page.locator('.enterprise-nav-item:has-text("AI Administration")').click();
    await expect(page.locator('.enterprise-tab-title:has-text("AI Provider Governance")')).toBeVisible();
    
    // Click on Settings & Support
    await page.locator('.enterprise-nav-item:has-text("Settings & Support")').click();
    await expect(page.locator('.enterprise-tab-title:has-text("Organization Settings")')).toBeVisible();
  });

  test('Overview & Usage should render the modernized usage cards', async ({ page }) => {
    await page.locator('.enterprise-nav-item:has-text("Overview & Usage")').click();
    await expect(page.locator('.enterprise-tab-title:has-text("Usage & Quota Analytics")')).toBeVisible();
    
    // Verify the grid styling is applied
    const metricsGrid = page.locator('.enterprise-usage-bars-grid');
    await expect(metricsGrid.first()).toBeVisible();
    
    // Verify the new layout and progress bar rendering
    const cards = page.locator('.enterprise-card');
    await expect(cards).not.toHaveCount(0);
  });

  test('Security & M2M should render the modernized API key generation and Service Accounts UI', async ({ page }) => {
    await page.locator('.enterprise-nav-item:has-text("Security & M2M")').click();
    await expect(page.locator('.enterprise-tab-title:has-text("Service Accounts & M2M Security")')).toBeVisible();

    // The Generate button should be styled as enterprise-button-primary
    const generateBtn = page.locator('button:has-text("Generate Service Key")');
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toHaveClass(/enterprise-button-primary/);
  });

  test('Settings & Support should render the danger zone', async ({ page }) => {
    await page.locator('.enterprise-nav-item:has-text("Settings & Support")').click();
    
    const dangerZone = page.locator('h3:has-text("Tenant Lifecycle & Danger Zone")');
    await expect(dangerZone).toBeVisible();
    await expect(dangerZone).toHaveCSS('color', 'rgb(239, 68, 68)'); // red color from CSS
  });
});
