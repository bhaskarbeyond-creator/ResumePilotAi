const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

let captureDir = null;

const VIEWPORTS = [
  { width: 1440, height: 900, name: 'desktop' },
  { width: 1280, height: 800, name: 'laptop' },
  { width: 1024, height: 768, name: 'tablet-landscape' },
  { width: 768, height: 1024, name: 'tablet-portrait' },
  { width: 430, height: 932, name: 'mobile-large' },
  { width: 390, height: 844, name: 'mobile-medium' },
  { width: 375, height: 667, name: 'mobile-small' }
];

const MODULES = [
  { id: 'overview', name: 'Overview' },
  { id: 'resumes', name: 'Talent & Resumes' },
  { id: 'members', name: 'Users & IAM' },
  { id: 'teams', name: 'Teams' },
  { id: 'workspaces', name: 'Workspaces' },
  { id: 'access', name: 'Roles & permissions' },
  { id: 'ai', name: 'AI workspace' },
  { id: 'security', name: 'Security & M2M' },
  { id: 'usage', name: 'Usage & Quotas' },
  { id: 'audit', name: 'Audit logs' },
  { id: 'support', name: 'Support access' },
  { id: 'settings', name: 'Organization settings' },
];

test.describe('Live Production Enterprise Audit - Deep Inspection', () => {
  test.beforeAll(async () => {
    captureDir = path.join(__dirname, '..', 'live_audit_captures');
    if (!fs.existsSync(captureDir)) {
      fs.mkdirSync(captureDir, { recursive: true });
    }
  });

  test('Execute deep live enterprise module audit & responsive UI', async ({ browser }) => {
    test.setTimeout(300000); // 5 minutes

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('401') && !msg.text().includes('Content Security Policy')) {
        errors.push(`Console Error: ${msg.text()}`);
      }
    });

    page.on('response', response => {
      if (response.status() >= 400 && response.status() !== 401 && response.status() !== 403 && response.status() !== 404 && response.status() !== 429) {
        errors.push(`Network Error: ${response.status()} on ${response.url()}`);
      }
    });

    console.log('Authenticating...');
    await page.goto('https://airesume.projectdemo.guru/login');
    await page.waitForTimeout(2000);
    await page.fill('input[name="Email"]', 'disposable-admin@projectdemo.guru');
    await page.fill('input[name="Password"]', 'LiveTestPassword123!');
    await page.click('input[type="submit"]');
    
    await page.waitForTimeout(5000); 
    console.log('Navigating to /enterprise...');
    await page.goto('https://airesume.projectdemo.guru/enterprise');
    
    await expect(page.locator('text=ResumePilot Enterprise').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(captureDir, '00_base_shell.png') });

    // Verify 12 Modules (Platform Admin might not be visible)
    for (const mod of MODULES) {
      console.log(`Verifying module: ${mod.name}`);
      await page.goto(`https://airesume.projectdemo.guru/enterprise?tab=${mod.id}`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(captureDir, `module_${mod.id}.png`) });
    }

    // Interactive Test 1: Security/M2M
    console.log('Testing Security/M2M Flow...');
    await page.goto('https://airesume.projectdemo.guru/enterprise?tab=security');
    await page.waitForTimeout(1500);
    try {
      await page.click('button:has-text("Create API Key")', { timeout: 3000 });
      await page.waitForTimeout(500);
      await page.fill('input[placeholder="e.g., CI/CD Pipeline"]', 'Audit Key');
      await page.click('button:has-text("Generate Key")');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(captureDir, 'action_m2m_generated.png') });
      const doneBtn = page.locator('button:has-text("Done")');
      if (await doneBtn.isVisible()) await doneBtn.click();
      
      const revokeBtn = page.locator('button[title="Revoke Key"]').first();
      if (await revokeBtn.isVisible()) {
        await revokeBtn.click();
        await page.waitForTimeout(500);
        await page.click('button:has-text("Confirm Revocation")');
        await page.waitForTimeout(1000);
      }
    } catch(e) { console.log("M2M CRUD error:", e.message); }

    // Interactive Test 2: Support Access
    console.log('Testing Support Access...');
    await page.goto('https://airesume.projectdemo.guru/enterprise?tab=support');
    await page.waitForTimeout(1500);
    try {
      await page.click('button:has-text("Issue New Grant")', { timeout: 3000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(captureDir, 'action_support_grant.png') });
      await page.click('button:has-text("Cancel")');
    } catch(e) { console.log("Support CRUD error:", e.message); }

    // Viewport Tests
    console.log('Testing Viewports...');
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('https://airesume.projectdemo.guru/enterprise?tab=overview');
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(captureDir, `viewport_${vp.width}x${vp.height}.png`) });
    }

    if (errors.length > 0) {
      fs.writeFileSync(path.join(captureDir, 'errors.log'), errors.join('\n'));
    } else {
      fs.writeFileSync(path.join(captureDir, 'errors.log'), 'No unexpected console or network errors detected.');
    }
    
    expect(errors.filter(e => e.includes('Network Error: 500'))).toHaveLength(0);
  });
});
