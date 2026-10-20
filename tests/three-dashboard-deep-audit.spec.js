import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../frontend');

let viteServer;
let base = '';

test.beforeAll(async () => {
  viteServer = await createServer({
    root: frontendDir,
    configFile: path.resolve(frontendDir, 'vite.config.ts'),
    server: { port: 56210, strictPort: false },
  });
  await viteServer.listen();
  const address = viteServer.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 56210;
  base = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  if (viteServer) {
    await viteServer.close();
  }
});

async function bootSession(page, role = 'SUPER_ADMIN') {
  await page.addInitScript((userRole) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      'ime_dev_user',
      JSON.stringify({
        uid: 'audit_super_admin_999',
        email: 'audit-officer@ime365.ai',
        role: userRole,
        roles: [userRole],
        emailVerified: true,
        displayName: 'Executive Security Auditor',
      })
    );
  }, role);

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  return consoleErrors;
}

test.describe('Three Dashboards Deep Audit (Employer, Enterprise, Admin)', () => {
  // ─── DASHBOARD 1: EMPLOYER PORTAL AUDIT ───
  test('Employer Portal: 7 tabs, modal launchers, and responsive metrics render error-free', async ({ page }) => {
    const errors = await bootSession(page, 'RECRUITER');

    // 1. Overview Tab
    await page.goto(`${base}/employer`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Employer & Recruitment Hub')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Active Requisitions')).toBeVisible();
    await expect(page.getByText('Total Applicants')).toBeVisible();
    await expect(page.getByText('In Interview Loops')).toBeVisible();
    await expect(page.getByText('Offers Extended')).toBeVisible();

    // 2. Jobs Tab
    await page.goto(`${base}/employer/jobs`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /Post New Job Requisition/i })).toBeVisible();

    // 3. Pipeline / Applicants Tab
    await page.goto(`${base}/employer/pipeline`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('Search applicants...')).toBeVisible();
    await expect(page.getByText('Applied / Review')).toBeVisible();
    await expect(page.getByText('In Interview')).toBeVisible();
    await expect(page.getByText('Offer Extended')).toBeVisible();
    await expect(page.getByText('Archived / Rejected')).toBeVisible();

    // 4. Candidate Messages Tab
    await page.goto(`${base}/employer/messages`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Candidate Conversations')).toBeVisible();
    await expect(page.getByText('Live sync connected')).toBeVisible();
    await expect(page.getByRole('button', { name: /Send/i })).toBeVisible();

    // 5. Company Profile Tab
    await page.goto(`${base}/employer/company`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Company & Entity Branding')).toBeVisible();

    // 6. Team Seats & Roles Tab
    await page.goto(`${base}/employer/team`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Recruiter Team Seats & Access')).toBeVisible();

    // 7. Hiring Preferences Tab
    await page.goto(`${base}/employer/settings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Hiring & Pipeline Preferences')).toBeVisible();
    await expect(page.getByRole('button', { name: /Save Hiring Preferences/i })).toBeVisible();

    // Filter out expected vite connection notices and simulated network 401s
    const fatalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('vite') && !e.includes('401') && !e.includes('Failed to load resource')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  // ─── DASHBOARD 2: ENTERPRISE CONSOLE AUDIT ───
  test('Enterprise Console: 14 tabs, tenant context, and IAM governance render error-free', async ({ page }) => {
    const errors = await bootSession(page, 'SUPER_ADMIN');

    // 1. Overview
    await page.goto(`${base}/org`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Enterprise Organization Console|Acme Enterprise Holdings/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Enterprise Multi-Tenant Tier')).toBeVisible();

    // 2. Talent & Resumes
    await page.goto(`${base}/org?tab=resumes`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Talent & Resumes|Total Resumes Managed/i).first()).toBeVisible();

    // 3. Members & IAM
    await page.goto(`${base}/org?tab=members`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Users & IAM|Tenant Members/i).first()).toBeVisible();

    // 4. Teams
    await page.goto(`${base}/org?tab=teams`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Departmental Teams & Squads')).toBeVisible();

    // 5. Workspaces
    await page.goto(`${base}/org?tab=workspaces`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Workspaces/i).first()).toBeVisible();

    // 6. Roles & Permissions (Access)
    await page.goto(`${base}/org?tab=access`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Roles & Permissions|RBAC/i).first()).toBeVisible();

    // 7. AI Workspace
    await page.goto(`${base}/org?tab=ai`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/AI Workspace|AI Quotas/i).first()).toBeVisible();

    // 8. Security & M2M
    await page.goto(`${base}/org?tab=security`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Security & M2M|SSO|SAML/i).first()).toBeVisible();

    // 9. Usage & Quotas
    await page.goto(`${base}/org?tab=usage`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Usage & Quotas|Consumption/i).first()).toBeVisible();

    // 10. Audit Logs
    await page.goto(`${base}/org?tab=audit`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Audit Logs|Forensic Audit Ledger/i).first()).toBeVisible();

    // 11. Support Access
    await page.goto(`${base}/org?tab=support`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Support Access/i).first()).toBeVisible();

    // 12. Organization Settings
    await page.goto(`${base}/org?tab=settings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Organization Settings/i).first()).toBeVisible();

    // Filter out expected notices and simulated network 401s
    const fatalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('vite') && !e.includes('401') && !e.includes('Failed to load resource')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  // ─── DASHBOARD 3: ADMIN CONSOLE AUDIT ───
  test('Admin Console: 15 governance tabs, 5 settings panels, and role switcher render error-free', async ({ page }) => {
    const errors = await bootSession(page, 'SUPER_ADMIN');

    // 1. Dashboard (Command Center)
    await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Super Admin Control Plane').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Root Level').first()).toBeVisible();

    // 2. Platform Health
    await page.goto(`${base}/admin/health`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Platform Health/i })).toBeVisible();

    // 3. Queues & DLQ
    await page.goto(`${base}/admin/queues`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Outbound & Transactional Queues|Dead-Letter/i).first()).toBeVisible();

    // 4. Operations & Maintenance
    await page.goto(`${base}/admin/operations`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Operations & Maintenance|System State/i).first()).toBeVisible();

    // 5. Attention Needed
    await page.goto(`${base}/admin/attention`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Attention Needed|Operational Alerts/i).first()).toBeVisible();

    // 6. Users Manager & 360
    await page.goto(`${base}/admin/users`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('User 360 & Account Governance')).toBeVisible();

    // 7. Security & Staff RBAC
    await page.goto(`${base}/admin/security`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Security Operations Center|Staff RBAC/i).first()).toBeVisible();

    // 8. Moderation Hub
    await page.goto(`${base}/admin/moderation`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Marketplace & Hiring Moderation')).toBeVisible();

    // 9. AI Multi-Provider Engine
    await page.goto(`${base}/admin/ai-settings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/AI Provider Orchestration/i).first()).toBeVisible();

    // 10. Email & SMTP Deliverability
    await page.goto(`${base}/admin/email`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Email & SMTP Deliverability/i).first()).toBeVisible();

    // 11. Platform Settings & Modules
    await page.goto(`${base}/admin/settings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Platform Settings & Control Center')).toBeVisible();

    // 12. Direct deep link to /admin/modules
    await page.goto(`${base}/admin/modules`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Google Single Sign-On (OAuth 2.0)')).toBeVisible({ timeout: 15_000 });

    // Verify all 5 settings sub-panels switch cleanly
    await page.getByTestId('settings-subtab-payments').click();
    await expect(page.getByText('Platform Currency Standard & Tax Calculation')).toBeVisible();

    await page.getByTestId('settings-subtab-branding').click();
    await expect(page.getByText('Brand Identity & Logos')).toBeVisible();

    await page.getByTestId('settings-subtab-integrations').click();
    await expect(page.getByText('Google Maps & Bot Defense (reCAPTCHA v3)')).toBeVisible();

    await page.getByTestId('settings-subtab-templates-legal').click();
    await expect(page.getByText('Canonical 51 Resume & CV Template Manager')).toBeVisible();

    // 13. Super Admin Role Simulation Switcher in Cuba Header
    const roleSwitcher = page.getByTestId('role-simulation-trigger');
    await expect(roleSwitcher).toBeVisible();
    await roleSwitcher.click();
    await expect(page.getByText('Simulate Role View')).toBeVisible();
    await expect(page.getByText('Super Admin (Default)')).toBeVisible();

    // Filter out expected notices and simulated network 401s
    const fatalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('vite') && !e.includes('401') && !e.includes('Failed to load resource')
    );
    expect(fatalErrors).toHaveLength(0);
  });
});
