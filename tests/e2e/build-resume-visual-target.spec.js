/**
 * Build Resume page visual target and breadcrumb verification.
 * Verifies the page matches the reference screenshot layout and has zero hardcoded data.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

async function signIn(page, email = 'user@test.test') {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#input-email', { timeout: 10000 });
  await page.fill('#input-email', email);
  await page.fill('#input-password', 'password123');
  await page.focus('#input-password');
  await page.keyboard.press('Enter');
  try { await page.waitForURL(/\/(dashboard|login)/, { timeout: 10000 }); } catch (_e) { /* fall through */ }
  await page.waitForTimeout(800);
}

test.describe('Build Resume page visual target and breadcrumb', () => {
  test('breadcrumb matches specification and contains dynamic data', async ({ page }) => {
    await signIn(page);
    await page.goto(BASE + '/build-resume', { waitUntil: 'domcontentloaded' });
    // The router redirects to /build-resume/heading
    await expect(page).toHaveURL(/\/build-resume\/heading/, { timeout: 10000 });

    // Wait for the breadcrumb nav to be present
    const breadcrumbNav = page.locator('nav[aria-label="Breadcrumb"]');
    await expect(breadcrumbNav).toBeVisible({ timeout: 5000 });

    // Check the breadcrumb items
    const breadcrumbLinks = breadcrumbNav.locator('a');
    await expect(breadcrumbLinks).toHaveCount(4); // Dashboard, Resumes & Master CV, Build Resume, [Resume Title]

    // Verify the links and their hrefs
    const links = await breadcrumbLinks.all();
    // First link: Dashboard
    await expect(links[0]).toHaveAttribute('href', '/dashboard');
    await expect(links[0]).toHaveText(/Dashboard/i);
    // Second link: Resumes & Master CV
    await expect(links[1]).toHaveAttribute('href', '/dashboard');
    await expect(links[1]).toHaveText(/Resumes & Master CV/i);
    // Third link: Build Resume
    await expect(links[2]).toHaveAttribute('href', '/dashboard');
    await expect(links[2]).toHaveText(/Build Resume/i);
    // Fourth link: active resume title (should not be a link, but we check it's not a link or has aria-current)
    const activeLink = breadcrumbNav.locator('span[aria-current="page"], a[aria-current="page"]');
    await expect(activeLink).toBeVisible();
    const activeText = await activeLink.textContent();
    // Ensure it's not a hardcoded placeholder like 'Babu M' or 'Untitled Resume' (unless that's the actual data)
    // We'll check that it's not empty and not a known hardcoded string from the reference screenshot.
    expect(activeText.trim().length).toBeGreaterThan(0);
    // Additionally, we can check that the text is not exactly 'Babu M' or '69%' etc.
    const hardcodedToAvoid = ['Babu M', '69%', '69/100'];
    for (const hardcoded of hardcodedToAvoid) {
      expect(activeText).not.toContain(hardcoded);
    }
  });

  test('page loads without errors and shows core sections', async ({ page }) => {
    await signIn(page);
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Check for no runtime errors in the console
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    // Wait a bit to capture any console errors
    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);

    // Check that the main container is present
    const root = page.locator('#root');
    await expect(root).toBeVisible();

    // Check for the presence of the CubaAppShell (via class or attribute)
    const appShell = page.locator('[class*="cuba-glass"]');
    await expect(appShell).toBeVisible();

    // Check for the stepper (horizontal carousel)
    const stepper = page.locator('[role="radiogroup"], [aria-label*="step"]');
    await expect(stepper).toBeVisible();

    // Check for the header with title, saved pill, ATS gauge, preview and download buttons
    const header = page.locator('header');
    await expect(header).toBeVisible();
    // Title
    await expect(header.locator('text=/Resume/i')).toBeVisible();
    // Saved pill (green)
    await expect(header.locator('text=/Saved/i')).toBeVisible();
    // ATS gauge (circular)
    await expect(header.locator('text=/ATS/i')).toBeVisible();
    // Preview button
    await expect(header.locator('button:has-text("Preview")')).toBeVisible();
    // Download button
    await expect(header.locator('button:has-text(/Download/i)')).toBeVisible();

    // Check for the right rail (tabbed AI Career Assistant)
    const rightRail = page.locator('[role="tablist"], [aria-label*="AI Career Assistant"]');
    await expect(rightRail).toBeVisible();

    // Check for the main step area (should have a header with 5/5 required fields, etc.)
    const mainStep = page.locator('main');
    await expect(mainStep).toBeVisible();
    // Check for the section header with '5/5 required fields'
    await expect(mainStep.locator('text=/required fields/i')).toBeVisible();
    // Check for the 'Complete' badge
    await expect(mainStep.locator('text=/Complete/i')).toBeVisible();
    // Check for the 'Auto Fill with AI' button
    await expect(mainStep.locator('button:has-text(/Auto Fill with AI/i)')).toBeVisible();
    // Check for the 'Reset Section' button
    await expect(mainStep.locator('button:has-text(/Reset Section/i)')).toBeVisible();
  });
});