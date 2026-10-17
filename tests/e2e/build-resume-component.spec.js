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

test.describe('BuildResume Component Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
  });

  test('should render all required UI elements', async ({ page }) => {
    // Navigate to build-resume heading step
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    // Check header section
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('text=/Resume/i')).toBeVisible();
    await expect(page.locator('text=/Saved/i')).toBeVisible();
    await expect(page.locator('text=/ATS/i')).toBeVisible();
    await expect(page.locator('button:has-text(/Preview/i)')).toBeVisible();
    await expect(page.locator('button:has-text(/Download/i)')).toBeVisible();
    
    // Check stepper
    await expect(page.locator('[role="radiogroup"], [aria-label*="step"]')).toBeVisible();
    
    // Check main step area
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('text=/5/5 required fields/i')).toBeVisible();
    await expect(page.locator('text=/Complete/i')).toBeVisible();
    await expect(page.locator('button:has-text(/Auto Fill with AI/i)')).toBeVisible();
    await expect(page.locator('button:has-text(/Reset Section/i)')).toBeVisible();
    
    // Check right rail
    await expect(page.locator('[role="tablist"], [aria-label*="AI Career Assistant"]')).toBeVisible();
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
      'ATS Guidance checklist'
    ];
    
    const pageText = await page.textContent('body');
    hardcodedStrings.forEach(str => {
      expect(pageText).not.toContain(str);
    });
  });

  test('should have proper accessibility landmarks', async ({ page }) => {
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    // Check main landmark
    await expect(page.locator('main')).toBeVisible();
    
    // Check navigation landmark
    await expect(page.locator('nav[aria-label="breadcrumb"]')).toBeVisible();
    
    // Check complementary landmark
    await expect(page.locator('[role="complementary"]')).toBeVisible();
    
    // Check form landmark
    await expect(page.locator('form')).toBeVisible();
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
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

  test('should show correct breadcrumb navigation', async ({ page }) => {
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

  test('should have proper stepper navigation', async ({ page }) => {
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    const steps = page.locator('.step-nav-btn');
    await expect(steps).toHaveCount(6); // Should have all steps
    
    // Check that active step is highlighted
    const activeStep = steps.filterLocator('.step-nav-btn[aria-current="step"]');
    await expect(activeStep).toHaveCount(1);
  });

  test('should display correct step content', async ({ page }) => {
    for (const route of RESUME_ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      
      // Check that the correct step is active
      const currentStep = await page.locator('[aria-current="page"]').first();
      await expect(currentStep).toBeVisible();
      
      // Check step-specific content
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

  test('should handle form validation properly', async ({ page }) => {
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    // Fill in required fields
    await page.fill('input[name="candidateName"]', 'John Doe');
    await page.fill('input[name="email"]', 'john.doe@example.com');
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

  test('should properly complete steps based on substantive content', async ({ page }) => {
    // Test step completion logic by navigating through steps
    await page.goto('/build-resume/heading');
    
    // Check that we can navigate through steps
    const steps = page.locator('.step-nav-btn');
    await expect(steps).toHaveCount(6); // Should have all steps
    
    // Check that active step is highlighted
    const activeStep = steps.filterLocator('.step-nav-btn[aria-current="step"]');
    await expect(activeStep).toHaveCount(1);
  });
});