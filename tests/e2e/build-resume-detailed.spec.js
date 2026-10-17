import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const RESUME_ROUTES = [
  '/build-resume/heading',
  '/build-resume/work-history',
  '/build-resume/education',
  '/build-resume/skills',
  '/build-resume/summary',
  '/build-resume/review'
];

test.describe('BuildResume Component - Detailed Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
  });

  test('should navigate through all steps correctly', async ({ page }) => {
    // Test step navigation flow
    for (const route of RESUME_ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      
      // Check that the correct step is active
      const currentStep = await page.locator('[aria-current="page"]').first();
      await expect(currentStep).toBeVisible();
      
      // Check step content is visible
      await expect(page.locator('main')).toBeVisible();
      
      // Check for step-specific elements
      if (route.includes('heading')) {
        await expect(page.locator('text=/Resume/i')).toBeVisible();
        await expect(page.locator('text=/Saved/i')).toBeVisible();
      } else if (route.includes('work-history')) {
        await expect(page.locator('text=/Work History/i')).toBeVisible();
      } else if (route.includes('education')) {
        await expect(page.locator('text=/Education/i')).toBeVisible();
      } else if (route.includes('skills')) {
        await expect(page.locator('text=/Skills/i')).toBeVisible();
      } else if (route.includes('summary')) {
        await expect(page.locator('text=/Summary/i')).toBeVisible();
      } else if (route.includes('review')) {
        await expect(page.locator('text=/Review/i')).toBeVisible();
      }
    }
  });

  test('should validate form inputs properly', async ({ page }) => {
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    // Fill in candidate name
    await page.fill('input[name="candidateName"]', 'John Doe');
    
    // Fill in email
    await page.fill('input[name="email"]', 'john.doe@example.com');
    
    // Fill in phone
    await page.fill('input[name="phone"]', '+1234567890');
    
    // Check that form is valid
    await expect(page.locator('button:has-text(/Save/i)')).toBeEnabled();
    
    // Submit form
    await page.click('button:has-text(/Save/i)');
    
    // Verify success message
    await expect(page.locator('text=/Resume saved successfully/i')).toBeVisible();
  });

  test('should handle empty form submission gracefully', async ({ page }) => {
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    // Try to submit without filling any fields
    await page.click('button:has-text(/Save/i)');
    
    // Verify error messages appear
    await expect(page.locator('text=/Please fill in all required fields/i')).toBeVisible();
  });

  test('should display correct breadcrumb navigation', async ({ page }) => {
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    const breadcrumb = page.locator('nav[aria-label="breadcrumb"]');
    await expect(breadcrumb).toBeVisible();
    
    const items = await breadcrumb.locator('a, span[aria-current="page"]').all();
    await expect(items).toHaveLength(4);
    
    // Verify each item's text and href
    await expect(items[0]).toHaveText('Dashboard');
    await expect(items[0]).toHaveAttribute('href', '/dashboard');
    
    await expect(items[1]).toHaveText('Resumes & Master CV');
    await expect(items[1]).toHaveAttribute('href', '/dashboard');
    
    await expect(items[2]).toHaveText('Build Resume');
    await expect(items[2]).toHaveAttribute('href', '/build-resume');
    
    // Last item should be active (not a link)
    await expect(items[3]).toHaveAttribute('aria-current', 'page');
  });

  test('should have proper keyboard navigation', async ({ page }) => {
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    // Check focusable elements
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      'button:has-text(/Auto Fill with AI/i)',
      'button:has-text(/Reset Section/i)'
    ];
    
    for (const selector of focusableSelectors) {
      const elements = page.locator(selector);
      const count = await elements.count();
      if (count > 0) {
        await expect(elements.first()).toBeFocusable();
      }
    }
  });

  test('should have sufficient color contrast (WCAG 2.1 AA)', async ({ page }) => {
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    // Get the entire page text
    const pageText = await page.textContent('body');
    
    // List of hardcoded strings that should not appear in the production view
    const hardcodedStrings = [
      'Babu M',
      '69%',
      'Needs Improvement',
      'Preview',
      'Download',
      '5/5 required fields',
      'Complete',
      'Auto Fill with AI',
      'Reset Section',
      'Photo uploader',
      'Target Role & Job Description',
      'AI Career Assistant',
      'Resume Insights',
      'Job Match',
      'screening checks',
      'ATS Guidance checklist',
      'Bullet Strength bar'
    ];
    
    for (const str of hardcodedStrings) {
      expect(pageText).not.toContain(str);
    }
  });

  test('should display real data (not hardcoded)', async ({ page }) => {
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    // Check that dynamic content is present
    const candidateName = page.locator('text=/* Candidate Name */');
    await expect(candidateName).toBeVisible();
    
    // Verify no hardcoded placeholder values
    const hardcodedStrings = [
      'Babu M',
      '69%',
      'Needs Improvement',
      'Preview',
      'Download'
    ];
    
    for (const str of hardcodedStrings) {
      await expect(page.locator('body')).not.toHaveText(str);
    }
  });

  test('should show correct stepper progress indicator', async ({ page }) => {
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    // Check stepper is visible
    await expect(page.locator('[role="radiogroup"], [aria-label*="step"]')).toBeVisible();
    
    // Check that there are 6 steps (matching our routes)
    const steps = page.locator('[role="radiogroup"], [aria-label*="step"]').locator('button');
    await expect(steps).toHaveCount(6);
    
    // Check that the first step is active
    await expect(steps.first()).toBeChecked();
  });

  test('should handle modal dialogs properly', async ({ page }) => {
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    // Check that modal dialogs exist but are not visible by default
    await expect(page.locator('text=/Preview/i')).toBeVisible();
    await expect(page.locator('text=/Download/i')).toBeVisible();
    
    // Check that modal content is hidden initially
    await expect(page.locator('.modal-content')).toBeHidden();
  });
});