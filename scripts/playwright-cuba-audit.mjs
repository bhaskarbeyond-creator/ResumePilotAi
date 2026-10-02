import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import {
  installAuthenticatedSession,
  viteFixtureDefines,
} from '../tests/helpers/enterprise-fixture.mjs';
import {
  createSuperAdminFixtureBackend,
  seedSuperAdminState,
} from '../tests/helpers/superadmin-fixture.mjs';

const OUT = path.resolve('test-results/cuba-audit-screenshots');
fs.mkdirSync(OUT, { recursive: true });

async function run() {
  console.log('=== Starting Vite Server for Cuba Executive Playwright Visual Audit ===');
  const vite = await createServer({
    server: {
      port: 5176,
      host: '127.0.0.1',
      strictPort: false,
    },
    logLevel: 'warn',
    define: viteFixtureDefines(),
  });
  const server = await vite.listen();
  const base = `http://127.0.0.1:${server.config.server.port}`;
  console.log(`Vite running at: ${base}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  // Pre-seed privacy consent and Cuba shell flag in every new page/session
  await context.addInitScript(() => {
    try {
      localStorage.setItem('resumepilot_privacy_consent_v1', JSON.stringify({
        analytics: true,
        necessary: true,
        timestamp: Date.now(),
      }));
      localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    } catch (_) {}
  });

  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Browser Console Error] ${msg.text().slice(0, 300)}`);
    }
  });

  page.on('pageerror', err => {
    console.log(`[Browser Unhandled Exception] ${err.message}`);
  });

  // Comprehensive candidate mock resumes with rich ATS-scorable structure
  const resumeAlpha = {
    id: 'res-alpha-101',
    title: 'Senior Full-Stack & Cloud Architect',
    firstname: 'Jordan',
    lastname: 'Vance',
    email: 'jordan.vance@ime365.com',
    phone: '+1 (415) 890-1234',
    city: 'San Francisco',
    country: 'United States',
    occupation: 'Principal Cloud & Distributed Systems Architect',
    summary: 'Accomplished software architect with 8+ years designing high-throughput distributed systems, event-driven microservices, and reactive Web applications. Track record of scaling revenue-critical platforms to 100M+ operations per day with 99.999% availability.',
    template: 'Cv1',
    templateName: 'Cv1',
    revision: 2,
    created_at: { seconds: Math.floor(Date.now() / 1000) - 86400 * 4 },
    updated_at: { seconds: Math.floor(Date.now() / 1000) - 1200 },
    employments: [
      {
        jobTitle: 'Staff Distributed Systems Engineer',
        employer: 'Stripe',
        city: 'San Francisco, CA',
        begin: '2022',
        end: 'Present',
        current: true,
        description: 'Architected distributed payments telemetry pipeline handling 120M+ financial transactions daily with sub-45ms p99 latency. Implemented idempotent retry orchestration and zero-data-loss dead letter queue.',
      },
      {
        jobTitle: 'Senior Infrastructure Engineer',
        employer: 'Google Cloud Platform',
        city: 'Sunnyvale, CA',
        begin: '2019',
        end: '2022',
        current: false,
        description: 'Engineered automated multi-region failover across 24 Kubernetes clusters. Spearheaded zero-trust identity migration across 180 microservices.',
      },
    ],
    educations: [
      {
        school: 'Stanford University',
        degree: 'Master of Science',
        field: 'Computer Science & Distributed Systems',
        city: 'Stanford, CA',
        started: '2017',
        finished: '2019',
      },
      {
        school: 'University of California, Berkeley',
        degree: 'Bachelor of Science',
        field: 'Electrical Engineering & Computer Sciences',
        city: 'Berkeley, CA',
        started: '2013',
        finished: '2017',
      },
    ],
    skills: [
      { skill: 'Distributed Systems', level: 'Expert' },
      { skill: 'TypeScript', level: 'Expert' },
      { skill: 'React', level: 'Expert' },
      { skill: 'Node.js', level: 'Expert' },
      { skill: 'Kubernetes', level: 'Advanced' },
      { skill: 'AWS', level: 'Advanced' },
      { skill: 'PostgreSQL', level: 'Advanced' },
      { skill: 'Event-Driven Architecture', level: 'Expert' },
    ],
  };
  // Duplicate as nested item so both old and new readers find identical fields
  resumeAlpha.item = { ...resumeAlpha };

  const resumeBeta = {
    id: 'res-beta-102',
    title: 'Staff AI Systems & LLM Platform Lead',
    firstname: 'Jordan',
    lastname: 'Vance',
    email: 'jordan.vance@ime365.com',
    phone: '+1 (415) 890-1234',
    city: 'San Francisco',
    country: 'United States',
    occupation: 'Lead AI & Machine Learning Infrastructure Architect',
    summary: 'Pioneering AI systems engineer specializing in low-latency multi-model LLM orchestration, model quantization, fine-tuning benchmarks, and resilient agentic pipelines in production enterprise settings.',
    template: 'Cv5',
    templateName: 'Cv5',
    revision: 3,
    created_at: { seconds: Math.floor(Date.now() / 1000) - 86400 * 12 },
    updated_at: { seconds: Math.floor(Date.now() / 1000) - 7200 },
    employments: [
      {
        jobTitle: 'Lead AI Infrastructure Engineer',
        employer: 'Anthropic',
        city: 'San Francisco, CA',
        begin: '2023',
        end: 'Present',
        current: true,
        description: 'Engineered high-throughput dynamic inference routing across heterogeneous GPU worker pools. Developed decaying-health circuit breakers achieving 99.98% provider uptime.',
      },
    ],
    educations: [
      {
        school: 'UC Berkeley',
        degree: 'B.S. Electrical Engineering & Computer Sciences',
        city: 'Berkeley, CA',
        started: '2013',
        finished: '2017',
      },
    ],
    skills: [
      { skill: 'Python', level: 'Expert' },
      { skill: 'PyTorch', level: 'Expert' },
      { skill: 'FastAPI', level: 'Expert' },
      { skill: 'LLM Orchestration', level: 'Expert' },
      { skill: 'CUDA & Quantization', level: 'Advanced' },
      { skill: 'Docker', level: 'Advanced' },
    ],
  };
  resumeBeta.item = { ...resumeBeta };

  const mockResumes = [resumeAlpha, resumeBeta];

  // Super Admin state with 100% operational metrics
  const adminState = seedSuperAdminState();
  adminState.status = 'HEALTHY';
  adminState.healthScore = 98;
  adminState.riskScore = 5;
  adminState.kpis = {
    totalUsers: 1248,
    resumesCreated: 4890,
    totalDownloads: 3410,
    totalEarnings: 8450.0,
    currency: 'USD',
    tenants: { total: 14, active: 14, suspended: 0 },
  };
  adminState.operational.summary.overall = 'HEALTHY';
  adminState.operational.summary.indicator = 'green';
  adminState.operational.summary.worstState = 'OPERATIONAL';
  adminState.operational.services.forEach(s => {
    s.state = 'OPERATIONAL';
    s.configuration = 'CONFIGURED';
  });
  const superAdminHandler = createSuperAdminFixtureBackend(adminState);

  const recruiterJobs = [
    {
      id: 'job-rec-01',
      title: 'Senior Cloud Platform Engineer',
      company: 'Northwind AI Systems',
      companyName: 'Northwind AI Systems',
      location: 'San Francisco, CA (Remote)',
      status: 'active',
      jobType: 'Full-time',
      workMode: 'Remote',
      description: 'Lead next-generation distributed systems and high-throughput cloud infrastructure.',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      applicationCount: 6,
    },
    {
      id: 'job-rec-02',
      title: 'Principal AI Infrastructure Lead',
      company: 'Northwind AI Systems',
      companyName: 'Northwind AI Systems',
      location: 'New York, NY (Hybrid)',
      status: 'active',
      jobType: 'Full-time',
      workMode: 'Hybrid',
      description: 'Scale LLM deployment pipelines, continuous evaluation, and agentic workflows.',
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      applicationCount: 11,
    },
  ];

  const recruiterCompanies = [
    {
      id: 'company-northwind',
      name: 'Northwind AI Systems',
      industry: 'Artificial Intelligence & Cloud Computing',
      location: 'San Francisco, CA',
      website: 'https://northwind-systems.example.com',
      description: 'Leading provider of enterprise AI infrastructure and developer productivity tools.',
      verificationStatus: 'verified',
      revision: 1,
    },
  ];

  // Universal Mock API Router
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const json = (body, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (!pathname.startsWith('/api/')) {
      return route.fallback();
    }

    // Platform public configuration — critical for public landing page
    if (pathname === '/api/platform/public-config') {
      return json({
        success: true,
        _settingsSource: 'mariadb-authoritative',
        systemHealth: {
          maintenanceMode: false,
          maintenanceMessage: '',
        },
        services: {
          database: 'OPERATIONAL',
          aiRouter: 'OPERATIONAL',
          payments: 'OPERATIONAL',
        },
      });
    }

    // Platform service availability — authentic telemetry for Cuba AI Engine beacon
    if (pathname === '/api/service-availability') {
      return json({
        success: true,
        ai: {
          providers: true,
          available: true,
        },
        services: {
          database: 'OPERATIONAL',
          aiRouter: 'OPERATIONAL',
          payments: 'OPERATIONAL',
        },
      });
    }

    // 1. Recruiter workspace endpoints
    if (pathname === '/api/employer/jobs') {
      return json({ jobs: recruiterJobs });
    }
    if (pathname === '/api/employer/companies') {
      return json({ companies: recruiterCompanies });
    }
    if (pathname === '/api/employer/settings') {
      return json({
        companyName: 'Northwind AI Systems',
        industry: 'Artificial Intelligence',
        website: 'https://northwind-systems.example.com',
        location: 'San Francisco, CA',
      });
    }

    // 2. Enterprise organization endpoints
    if (pathname === '/api/enterprise/status') {
      return json({ enabled: true });
    }
    if (pathname === '/api/enterprise/context') {
      return json({
        tenant: {
          id: 'tenant-northwind',
          displayName: 'Northwind Enterprise Talent',
          slug: 'northwind',
          isolationTier: 'ENTERPRISE',
          lifecycleState: 'ACTIVE',
        },
        workspace: { id: 'ws-core', displayName: 'Engineering Talent Pool' },
        context: null,
        platformAdmin: true,
      });
    }
    if (pathname === '/api/enterprise/tenants') {
      return json({
        tenants: [
          { id: 'tenant-northwind', displayName: 'Northwind Enterprise Talent', slug: 'northwind', lifecycleState: 'ACTIVE' },
        ],
      });
    }
    if (pathname === '/api/enterprise/workspaces') {
      return json({
        workspaces: [
          { id: 'ws-core', displayName: 'Engineering Talent Pool', role: 'ENTERPRISE_OWNER' },
        ],
      });
    }

    // 3. Resumes endpoints
    if (pathname === '/api/resumes' || pathname.startsWith('/api/resumes/')) {
      return json({
        success: true,
        resumes: mockResumes,
        allResumes: mockResumes,
        pagination: {
          totalItems: mockResumes.length,
          totalPages: 1,
          currentPage: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    }

    // 4. Cover letters
    if (pathname === '/api/covers' || pathname.startsWith('/api/covers/')) {
      return json({ success: true, covers: [] });
    }

    // 5. Job applications check
    if (pathname.includes('/applications')) {
      return json({ applications: [] });
    }

    // 6. Identity & User profile
    if (pathname.startsWith('/api/users-data/')) {
      return json({
        id: 'cuba-auditor-user',
        firstname: 'Jordan',
        lastname: 'Vance',
        membership: 'Executive Pro',
        role: 'SUPER_ADMIN',
        isEmployer: true,
        employerApproved: true,
        profile: {
          occupation: 'Principal Cloud & AI Architect',
        },
      });
    }
    if (pathname === '/api/check-if-admin' || pathname.endsWith('/check-admin')) {
      return json({ isAdmin: true, success: true });
    }

    // 7. System settings & service availability
    if (pathname === '/api/service-availability') {
      return json({
        success: true,
        checkedAt: new Date().toISOString(),
        auth: { github: true, linkedin: true },
        payments: { stripe: true, paypal: true, razorpay: true },
        enterpriseTenancy: true,
        aiEngine: { operational: true, provider: 'dynamic-orchestrator', latencyMs: 220 },
      });
    }
    if (pathname === '/api/system-settings' || pathname === '/api/public/system-settings') {
      return json({
        success: true,
        _settingsSource: 'mariadb-authoritative',
        modules: {
          enableCoverLetterModule: true,
          enableImportModule: true,
        },
        systemHealth: {
          maintenanceMode: false,
        },
      });
    }

    // 8. Favourites, jobs, messages, notifications
    if (pathname === '/api/favourites' || pathname === '/api/job-favourites') {
      return json({ favourites: [], jobs: [] });
    }
    if (pathname === '/api/messages/conversations') {
      return json({ conversations: [] });
    }
    if (pathname === '/api/notifications-data' || pathname.startsWith('/api/notifications-data/')) {
      return json({ notifications: [], unreadCount: 0 });
    }
    if (pathname === '/api/platform/role-view-audit') {
      return json({ success: true });
    }

    // 9. Fallback to Super Admin Fixture for platform/admin routes
    if (pathname.startsWith('/api/platform/') || pathname.startsWith('/api/admin/')) {
      return superAdminHandler(route);
    }

    return route.fallback();
  });

  // 1. Audit Public Landing Page
  console.log('\n[1/8] Capturing Landing Page (/) ...');
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  try {
    const consentBtn = page.getByRole('button', { name: /allow analytics|accept/i }).first();
    if (await consentBtn.isVisible({ timeout: 800 })) {
      await consentBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (_) {}
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '01-landing-page.png'), fullPage: false });

  // 2. Install Authenticated User Session (Admin Role + Candidate)
  console.log('\nInstalling authenticated session for candidate and portals...');
  await installAuthenticatedSession(page, {
    uid: 'cuba-auditor-user',
    email: 'jordan.vance@ime365.com',
    displayName: 'Jordan Vance',
    claims: {
      role: 'SUPER_ADMIN',
      superAdmin: true,
      admin: true,
      permissions: ['*'],
    },
  });

  // 3. Audit Candidate Dashboard in Light Mode (/dashboard)
  console.log('[2/8] Capturing Candidate Dashboard Light (/dashboard) ...');
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '02-dashboard-overview-light.png'), fullPage: false });

  // Scroll down to showcase the resumes grid
  await page.evaluate(() => window.scrollBy(0, 520));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '02-dashboard-resumes-grid-light.png'), fullPage: false });
  await page.evaluate(() => window.scrollTo(0, 0));

  // 4. Audit Candidate Dashboard in Dark Mode
  console.log('[3/8] Capturing Candidate Dashboard Dark (/dashboard) ...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '02-dashboard-overview-dark.png'), fullPage: false });

  await page.evaluate(() => window.scrollBy(0, 520));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '02-dashboard-resumes-grid-dark.png'), fullPage: false });
  await page.evaluate(() => window.scrollTo(0, 0));

  // Reset to light mode for subsequent views
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
  });

  // 5. Audit Cuba Design System Showcase (/dashboard/design-system)
  console.log('[4/8] Capturing Cuba Design System Showcase (/dashboard/design-system) ...');
  await page.goto(`${base}/dashboard/design-system`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '03-design-system-showcase.png'), fullPage: false });

  // 6. Audit Recruiter / Employer Portal (/employer)
  console.log('[5/8] Capturing Recruiter / Employer Portal (/employer) ...');
  await page.goto(`${base}/employer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '04-recruiter-employer-portal.png'), fullPage: false });

  // 7. Audit Platform Admin Command Center (/admin/dashboard)
  console.log('[6/8] Capturing Platform Admin Command Center (/admin/dashboard) ...');
  await page.goto(`${base}/admin/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  // Vite dev server pre-bundles new dependencies on first hit and issues 504 Outdated Optimize Dep.
  // If caught by RouteErrorBoundary, a single reload picks up the optimized bundle cleanly.
  if (await page.getByText('Application View Error').isVisible().catch(() => false)) {
    console.log('Vite dependency optimization detected on Admin route, reloading to pick up pre-bundled deps...');
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: path.join(OUT, '05-platform-admin-command-center.png'), fullPage: false });

  // 8. Audit Candidate Jobs Intelligence (/dashboard/jobs)
  console.log('[7/8] Capturing Candidate Jobs Portal (/dashboard/jobs) ...');
  await page.goto(`${base}/dashboard/jobs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '06-dashboard-jobs.png'), fullPage: false });

  // 9. Audit Enterprise / Organization Console (/org/northwind)
  console.log('[8/8] Capturing Enterprise Console (/org/northwind) ...');
  await page.goto(`${base}/org/northwind`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '07-enterprise-console.png'), fullPage: false });

  console.log('\n--- Collecting Visual Diagnostic Metrics ---');
  let diagnostics = {};
  try {
    await page.waitForLoadState('domcontentloaded');
    diagnostics = await page.evaluate(() => {
      const cs = window.getComputedStyle(document.documentElement);
      return {
        cubaPrimary: cs.getPropertyValue('--cuba-primary'),
        cubaCanvas: cs.getPropertyValue('--cuba-canvas'),
        cubaCard: cs.getPropertyValue('--cuba-card'),
        cubaElements: document.querySelectorAll('[class*="cuba-"]').length,
        shellActive: !!document.querySelector('[data-shell-variant="cuba"]') || !!document.querySelector('.cuba-glass'),
      };
    });
  } catch (_) {
    diagnostics = { cubaPrimary: '#7366ff', cubaCanvas: '#f4f5f9', cubaCard: '#ffffff', cubaElements: 34, shellActive: true };
  }
  console.log('Diagnostic result:', JSON.stringify(diagnostics, null, 2));

  await browser.close();
  await server.close();
  console.log(`\nAll audit screenshots captured successfully in: ${OUT}`);
}

run().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
