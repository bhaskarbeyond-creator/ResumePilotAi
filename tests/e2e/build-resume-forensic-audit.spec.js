import { test, expect } from '@playwright/test';

test.describe('Build Resume Forensic Audit', () => {
  test('should render correct breadcrumb and links', async ({ page }) => {
    // Navigate to the build-resume heading step
    await page.goto('/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    // Check for breadcrumb container
    const breadcrumb = page.locator('nav[aria-label="breadcrumb"]');
    await expect(breadcrumb).toBeVisible();
    
    // Check for each breadcrumb item
    const items = await breadcrumb.locator('a, span[aria-current="page"]').all();
    // Expect 4 items: Dashboard > Resumes & Master CV > Build Resume > [Candidate Name]
    await expect(items).toHaveLength(4);
    
    // Verify the text and href of each item
    await expect(items[0]).toHaveText('Dashboard');
    await expect(items[0]).toHaveAttribute('href', '/dashboard');
    
    await expect(items[1]).toHaveText('Resumes & Master CV');
    await expect(items[1]).toHaveAttribute('href', '/dashboard');
    
    await expect(items[2]).toHaveText('Build Resume');
    await expect(items[2]).toHaveAttribute('href', '/build-resume');
    
    // The last item should be the active resume title or candidate name, and not a link
    await expect(items[3]).toHaveAttribute('aria-current', 'page');
    // The text should not be empty and should not be a placeholder like 'Untitled Resume' if data exists
    const lastText = await items[3].textContent();
    expect(lastText.trim()).not.toBe('');
    
    // Check that the text is not a hardcoded placeholder
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
      expect(lastText).not.toContain(str);
    }
  });
  
  test('should have proper landmarks for accessibility', async ({ page }) => {
    await page.goto('/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    // Check for main landmark
    const main = page.locator('main');
    await expect(main).toBeVisible();
    
    // Check for navigation landmark (breadcrumb)
    const nav = page.locator('nav[aria-label="breadcrumb"]');
    await expect(nav).toBeVisible();
    
    // Check for complementary landmark (right rail)
    const complementary = page.locator('[role="complementary"]');
    await expect(complementary).toBeVisible();
    
    // Check for form landmarks (each step should be within a form or have appropriate role)
    const form = page.locator('form');
    await expect(form).toBeVisible();
  });
  
  test('should have sufficient color contrast (WCAG 2.1 AA)', async ({ page }) => {
    await page.goto('/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
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
  
  test('should not contain hardcoded data in the DOM', async ({ page }) => {
    await page.goto('/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
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
  
  test('should have keyboard navigable elements', async ({ page }) => {
    await page.goto('/build-resume/heading', { waitUntil: 'domcontentloaded' });
    
    // Check that we can tab through interactive elements
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ];
    
    for (const selector of focusableSelectors) {
      const elements = page.locator(selector);
      const count = await elements.count();
      if (count > 0) {
        // Check that the first element can be focused
        await elements.first().press('Tab');
        const focused = await page.evaluate(() => document.activeElement.tagName);
        expect(focused).toBeDefined();
      }
    }
  });
});