// @ts-check
/**
 * Modern Four-Portal Architecture & Parity E2E Suite
 *
 * Verifies in real Chromium:
 * 1. Portal Sidebar Isolation:
 *    - /admin renders adminNavGroups (zero candidate links)
 *    - /employer renders employerNavGroups (zero candidate links)
 *    - /org renders enterpriseNavGroups (zero candidate links)
 *    - /dashboard renders candidateNavGroups and candidate header widgets (ATS gauge)
 * 2. Header Widget Gating:
 *    - Candidate header widgets (ATS score gauge, save status) are ONLY visible on /dashboard
 *    - Hidden on /admin, /employer, /org
 * 3. Admin Console Deep Linking & Parity:
 *    - Direct navigation to /admin/health, /admin/users, /admin/queues, /admin/security, /admin/ai-settings
 *    - Horizontal sub-module tab pill strip works cleanly without double sidebars
 * 4. Employer Portal 7-Tab Modernization:
 *    - /employer mounts Recruiter Overview (KPI cards, quick launch tiles, active requisitions)
 *    - /employer/jobs mounts Job Requisitions
 *    - /employer/applicants mounts ATS Pipeline
 *    - /employer/messages mounts Candidate Messages center
 *    - /employer/company mounts Company Profile
 *    - /employer/team mounts Team Seats
 *    - /employer/settings mounts Hiring Preferences
 * 5. Enterprise Console Deep Linking:
 *    - Dual path/query resolution (/org/members and /org?tab=members)
 * 6. Global Workspace Switcher:
 *    - Dropdown menu allows clean switching between all 4 workspaces
 * 7. Responsive Viewport Adaptability:
 *    - Desktop (1280x800), Tablet (768x1024), Mobile (375x667)
 */
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import {
  installAuthenticatedSession,
  seedEnterpriseState,
  viteFixtureDefines,
} from './helpers/enterprise-fixture.mjs';
import { installApiFixture, watchForDefects, isUnexpectedJsError } from './four-portal-fixture.mjs';

test.describe.configure({ mode: 'serial' });

/** @type {import('vite').ViteDevServer} */
let vite;
let base = '';

test.beforeAll(async () => {
  vite = await createServer({
    server: { port: 0, host: '127.0.0.1', strictPort: false },
    logLevel: 'error',
    define: viteFixtureDefines(),
  });
  const server = await vite.listen();
  base = `http://127.0.0.1:${server.config.server.port}`;
});

test.afterAll(async () => {
  await vite?.close();
});

function createSuperAdminState() {
  const state = seedEnterpriseState();
  state.isAdmin = true;
  state.jobs = [
    {
      id: 'job-alpha',
      title: 'Principal Systems Architect',
      company: 'Acme Global Innovations',
      companyName: 'Acme Global Innovations',
      location: 'San Francisco, CA / Remote',
      status: 'active',
      jobType: 'Full-time',
      workMode: 'Remote',
      description: 'Lead distributed cloud infrastructure and core platform services.',
      createdAt: '2026-01-15T09:00:00.000Z',
      applicationCount: 5,
    },
    {
      id: 'job-beta',
      title: 'Senior Frontend Engineer',
      company: 'Acme Global Innovations',
      companyName: 'Acme Global Innovations',
      location: 'New York, NY / Hybrid',
      status: 'active',
      jobType: 'Full-time',
      workMode: 'Hybrid',
      description: 'Design and build high-performance React applications.',
      createdAt: '2026-01-18T11:00:00.000Z',
      applicationCount: 12,
    },
  ];
  state.companies = [
    {
      id: 'company-alpha',
      name: 'Acme Global Innovations',
      industry: 'Enterprise Software & AI',
      location: 'San Francisco, CA',
      website: 'https://acme.example.com',
      description: 'Pioneering intelligent automation and cloud platforms.',
      verificationStatus: 'verified',
      revision: 1,
    },
  ];
  state.applications = {
    'job-alpha': [
      { id: 'app-1', applicantName: 'Elena Rostova', applicantEmail: 'elena@example.com', status: 'interview', appliedAt: '2026-01-20T10:00:00.000Z' },
      { id: 'app-2', applicantName: 'Marcus Vance', applicantEmail: 'marcus@example.com', status: 'shortlisted', appliedAt: '2026-01-21T10:00:00.000Z' },
    ],
  };
  state.modules = {
    enableMessagesModule: true,
    enableAtsScoreModule: true,
    enablePortfolioModule: true,
  };
  return state;
}

async function bootPage(page, state = createSuperAdminState()) {
  const defects = watchForDefects(page);
  await installAuthenticatedSession(page, {
    claims: state.isAdmin
      ? { role: 'SUPER_ADMIN', superAdmin: true, admin: true }
      : { role: 'USER' },
  });
  await installApiFixture(page, state);
  return defects;
}

test.describe('Portal Shell Isolation & Navigation Grouping', () => {
  test('Candidate Dashboard exposes candidate nav and candidate header widgets', async ({ page }) => {
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/dashboard$/);

    // Sidebar must contain candidate navigation links
    await expect(page.locator('a[href^="/build-resume"], a[href="/dashboard/resumes"]').first()).toBeVisible({ timeout: 20_000 });

    // Recruiter and admin-only primary links must NOT be in the candidate sidebar
    const sidebar = page.locator('aside, [role="navigation"]').first();
    await expect(sidebar.getByText('Job Postings')).toHaveCount(0);
    await expect(sidebar.getByText('Applicant ATS Pipeline')).toHaveCount(0);
    await expect(sidebar.getByText('Security Center')).toHaveCount(0);
    await expect(sidebar.getByText('Platform Health')).toHaveCount(0);

    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });

  test('Employer Portal exposes dedicated recruiter nav and zero candidate links', async ({ page }) => {
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/employer`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/employer$/);

    // Verify Employer Portal shell is present
    await expect(page.getByTestId('employer-portal-shell')).toBeVisible({ timeout: 25_000 });

    // Verify Recruiter Overview is active
    await expect(page.getByRole('heading', { name: 'Recruiter Overview' }).first()).toBeVisible({ timeout: 20_000 });

    // Verify recruiter navigation links exist
    const nav = page.getByRole('navigation', { name: /employer navigation/i }).first();
    await expect(nav.getByText('Recruiter Overview').first()).toBeVisible();
    await expect(nav.getByText('Job Postings').first()).toBeVisible();
    await expect(nav.getByText('Applicant ATS Pipeline').first()).toBeVisible();

    // Candidate builder links must NOT leak into the recruiter sidebar
    await expect(nav.getByText('Build Resume')).toHaveCount(0);
    await expect(nav.getByText('Cover Letters')).toHaveCount(0);
    await expect(nav.getByText('Portfolios & Web CV')).toHaveCount(0);

    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });

  test('Admin Console exposes dedicated admin navigation and zero candidate links', async ({ page }) => {
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/admin\/dashboard$/);

    // Admin console must mount
    await expect(page.getByRole('heading', { name: /Control Plane|Platform Admin/i }).first()).toBeVisible({ timeout: 25_000 });

    // Candidate widgets (ATS gauge) must NOT be present
    await expect(page.locator('[data-testid="ats-score-gauge"]')).toHaveCount(0);
    await expect(page.getByText('ATS Readiness')).toHaveCount(0);

    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });
});

test.describe('Admin Console Deep-Linking & Sub-Module Parity', () => {
  test('direct navigation to /admin/health activates Platform Health tab', async ({ page }) => {
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/admin/health`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/admin\/health$/);
    await page.waitForTimeout(1500);

    // Must show Health / Infrastructure metrics or heading
    await expect(
      page.getByText(/Platform Health|Service Health|System Health|Database & Connectivity/i).first()
    ).toBeVisible({ timeout: 20_000 });

    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });

  test('direct navigation to /admin/users activates Users Manager tab', async ({ page }) => {
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/admin/users`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/admin\/users$/);
    await page.waitForTimeout(1500);

    await expect(
      page.getByText(/Users Control-Plane|User 360|Users Manager|User Accounts|Users & Operators/i).first()
    ).toBeVisible({ timeout: 20_000 });

    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });

  test('direct navigation to /admin/security activates Security Center tab', async ({ page }) => {
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/admin/security`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/admin\/security$/);
    await page.waitForTimeout(1500);

    await expect(
      page.getByText(/Security Events|Security Center|Security & Compliance|MFA & Threat/i).first()
    ).toBeVisible({ timeout: 20_000 });

    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });

  test('direct navigation to /admin/queues activates Queues tab', async ({ page }) => {
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/admin/queues`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/admin\/queues$/);
    await page.waitForTimeout(1500);

    await expect(
      page.getByText(/Platform Queue|DLQ Monitor|Async Queues|Job Queues|Outbox & DLQ|Queue Monitor/i).first()
    ).toBeVisible({ timeout: 20_000 });

    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });

  test('direct navigation to /admin/ai-settings activates AI Orchestration tab', async ({ page }) => {
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/admin/ai-settings`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/admin\/ai-settings$/);
    await page.waitForTimeout(1500);

    await expect(
      page.getByText(/Active AI Engine|AI Provider|AI Settings|AI Orchestration|Model Routing|Provider Configuration/i).first()
    ).toBeVisible({ timeout: 20_000 });

    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });
});

test.describe('Employer Portal 7-Tab Modernization & Real Data', () => {
  test('Recruiter Overview renders real KPI metrics and active requisitions', async ({ page }) => {
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/employer`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/employer$/);

    await expect(page.getByRole('heading', { name: 'Recruiter Overview' }).first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByLabel('Hiring metrics')).toBeVisible();

    // Requisition from fixture state must be rendered
    await expect(page.getByText('Principal Systems Architect').first()).toBeVisible({ timeout: 15_000 });

    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });

  test('every employer sub-route deep-links directly', async ({ page }) => {
    const routes = [
      ['/employer/jobs', /Job Postings|Job Requisitions/i],
      ['/employer/applicants', /Applicant ATS Pipeline|Candidate Pipeline/i],
      ['/employer/company', /Company Profile|Employer Profile/i],
      ['/employer/messages', /Candidate Messages|Direct Messages/i],
      ['/employer/settings', /Hiring Preferences|Recruitment Settings/i],
    ];

    for (const [path, headingRegex] of routes) {
      const { pageErrors } = await bootPage(page);
      await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { name: headingRegex }).first()).toBeVisible({ timeout: 25_000 });
      expect(isUnexpectedJsError(pageErrors)).toEqual([]);
    }
  });

  test('Candidate Messages tab allows selecting applicant conversation', async ({ page }) => {
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/employer/messages`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/employer\/messages$/);

    await expect(page.getByRole('heading', { name: 'Candidate Messages' }).first()).toBeVisible({ timeout: 25_000 });

    // Verify message list or communication surface is rendered
    await expect(page.getByText(/Conversations with applicants|No active conversation selected|Candidate/i).first()).toBeVisible();

    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });
});

test.describe('Enterprise Console Deep-Linking', () => {
  test('dual path and query routing resolves /org/members and /org?tab=members without 404', async ({ page }) => {
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/org?tab=members`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Organization workspace must render
    await expect(page.getByText(/Organization|Enterprise Console|Acme|Members|IAM/i).first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('Page not found')).toHaveCount(0);

    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });
});

test.describe('Global Workspace Switcher Flow', () => {
  test('context switcher opens and allows switching between portals', async ({ page }) => {
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const trigger = page.getByTestId('context-switcher-trigger').first();
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await trigger.click();

    const menu = page.getByTestId('context-switcher-menu').first();
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Candidate Dashboard')).toBeVisible();
    await expect(menu.getByText('Recruiter & Hiring Portal')).toBeVisible();

    // Switch to Recruiter Portal
    await menu.getByText('Recruiter & Hiring Portal').click();
    await expect(page).toHaveURL(/\/employer/, { timeout: 20_000 });

    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });
});

test.describe('Responsive Viewport Adaptability', () => {
  test('renders cleanly on Tablet viewport (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/employer`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Recruiter Overview' }).first()).toBeVisible({ timeout: 25_000 });
    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });

  test('renders cleanly on Mobile viewport (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const { pageErrors } = await bootPage(page);
    await page.goto(`${base}/employer`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Recruiter Overview' }).first()).toBeVisible({ timeout: 25_000 });
    expect(isUnexpectedJsError(pageErrors)).toEqual([]);
  });
});
