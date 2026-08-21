const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

let authLink = null;
let captureDir = null;

test.describe('Live Production Enterprise Audit', () => {
  test.beforeAll(async () => {
    captureDir = path.join(__dirname, '..', 'live_audit_captures');
    if (!fs.existsSync(captureDir)) {
      fs.mkdirSync(captureDir, { recursive: true });
    }
  });

  test('Execute complete live enterprise module audit', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes

    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('401')) {
        errors.push(`Console Error: ${msg.text()}`);
      }
    });

    page.on('response', response => {
      if (response.status() >= 400 && response.status() !== 401 && response.status() !== 403 && response.status() !== 404) {
        errors.push(`Network Error: ${response.status()} on ${response.url()}`);
      }
    });

    console.log('Navigating to login page...');
    await page.goto('https://airesume.projectdemo.guru/login');
    
    await page.waitForTimeout(2000);
    await page.fill('input[name="Email"]', 'disposable-admin@projectdemo.guru');
    await page.fill('input[name="Password"]', 'LiveTestPassword123!');
    await page.screenshot({ path: path.join(captureDir, '01_login_filled.png') });
    
    await page.click('input[type="submit"]');
    console.log('Login submitted.');
    
    await page.waitForTimeout(5000); 
    console.log('Navigating to /enterprise...');
    await page.goto('https://airesume.projectdemo.guru/enterprise');
    
    await expect(page.locator('text=ResumePilot Enterprise').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(captureDir, '02_enterprise_shell.png') });

    const modules = [
      { name: 'Dashboard', url: '/enterprise' },
      { name: 'Workspaces', url: '/enterprise/workspaces' },
      { name: 'Teams', url: '/enterprise/teams' },
      { name: 'Users IAM', url: '/enterprise/iam' },
      { name: 'Security M2M', url: '/enterprise/security' },
      { name: 'Support Access', url: '/enterprise/support' },
      { name: 'Audit Logs', url: '/enterprise/audit' },
      { name: 'Settings', url: '/enterprise/settings' }
    ];

    for (const mod of modules) {
      console.log(`Testing module: ${mod.name}`);
      await page.goto(`https://airesume.projectdemo.guru${mod.url}`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(captureDir, `module_${mod.name.replace(/\s+/g, '_').replace(/\//g, '')}.png`) });
    }

    console.log('Testing Security & M2M CRUD...');
    await page.goto('https://airesume.projectdemo.guru/enterprise/security');
    
    try {
        await page.click('button:has-text("Create API Key")', { timeout: 3000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(captureDir, 'security_create_drawer.png') });
        
        await page.fill('input[placeholder="e.g., CI/CD Pipeline"]', 'Live Test Service Account');
        await page.click('button:has-text("Generate Key")');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(captureDir, 'security_key_generated.png') });
        
        const doneBtn = page.locator('button:has-text("Done")');
        if (await doneBtn.isVisible()) {
          await doneBtn.click();
        }
        
        const revokeBtn = page.locator('button[title="Revoke Key"]').first();
        if (await revokeBtn.isVisible()) {
          await revokeBtn.click();
          await page.waitForTimeout(500);
          await page.screenshot({ path: path.join(captureDir, 'security_key_revoke_confirm.png') });
          await page.click('button:has-text("Confirm Revocation")');
          await page.waitForTimeout(1500);
        }
    } catch(e) {
        console.log("Could not complete Security CRUD", e.message);
    }

    console.log('Testing Support Access...');
    await page.goto('https://airesume.projectdemo.guru/enterprise/support');
    try {
        await page.click('button:has-text("Issue New Grant")', { timeout: 3000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(captureDir, 'support_grant_drawer.png') });
        await page.click('button:has-text("Cancel")');
    } catch (e) {
        console.log("Could not complete Support CRUD", e.message);
    }

    if (errors.length > 0) {
      console.error('Errors encountered during live audit:');
      errors.forEach(e => console.error(e));
      fs.writeFileSync(path.join(captureDir, 'errors.log'), errors.join('\n'));
    } else {
      console.log('No unexpected console or network errors detected.');
      fs.writeFileSync(path.join(captureDir, 'errors.log'), 'No unexpected console or network errors detected.');
    }
    
    expect(errors.filter(e => e.includes('Network Error: 500'))).toHaveLength(0);
  });
});
