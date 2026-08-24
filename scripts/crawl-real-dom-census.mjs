/**
/**
 * AUTHORITATIVE REAL-DOM CONTROL CENSUS CRAWLER
 * 
 * Inspects the actual rendered React DOM in real Chromium across all routes and roles.
 * Discovers real rendered interactive controls with deterministic stable identities.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const gitSha = (() => {
  try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); }
  catch { return 'HEAD'; }
})();

function readEnvKey() {
  for (const file of ['.env', 'backend/.env']) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const m = content.match(/VITE_FIREBASE_KEY=([^\r\n]+)/);
      if (m) return m[1].trim();
    } catch {}
  }
  return 'demo-browser-api-key';
}
const API_KEY = process.env.VITE_FIREBASE_KEY || readEnvKey();

function makeMockJwt(overrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({
    iss: 'https://securetoken.google.com/ai-resume-builder-424cf',
    aud: 'ai-resume-builder-424cf',
    auth_time: now,
    user_id: 'test-user',
    sub: 'test-user',
    iat: now,
    exp: now + 3600,
    email: 'user@test.com',
    email_verified: true,
    firebase: { identities: { email: ['user@test.com'] }, sign_in_provider: 'password' },
    ...overrides,
  })).toString('base64url');
  return `${header}.${claims}.mock_signature`;
}

const ROLES = {
  ANONYMOUS: { uid: null, email: null, claims: {} },
  USER: { uid: 'usr-user-01', email: 'user@test.com', displayName: 'Standard Candidate', claims: {} },
  ADMIN: { uid: 'adm-admin-01', email: 'admin@test.com', displayName: 'Platform Admin', claims: { admin: true, role: 'ADMIN' } },
  SUPER_ADMIN: { uid: 'sup-admin-01', email: 'superadmin@test.com', displayName: 'Super Administrator', claims: { admin: true, superAdmin: true, role: 'SUPER_ADMIN', sign_in_second_factor: true, permissions: ['*'] } },
  ENTERPRISE_ADMIN: { uid: 'ent-admin-01', email: 'entadmin@test.com', displayName: 'Enterprise Admin', claims: { enterpriseAdmin: true, role: 'ENTERPRISE_ADMIN', permissions: ['*'] } },
  ENTERPRISE_MEMBER: { uid: 'ent-member-01', email: 'entmember@test.com', displayName: 'Enterprise Member', claims: { enterpriseMember: true, role: 'ENTERPRISE_MEMBER' } },
  EMPLOYER: { uid: 'emp-user-01', email: 'employer@test.com', displayName: 'Hiring Manager', claims: { employer: true, role: 'EMPLOYER' } },
  AUDITOR: { uid: 'aud-user-01', email: 'auditor@test.com', displayName: 'Compliance Auditor', claims: { auditor: true, readOnly: true, role: 'AUDITOR' } },
};

// Route definitions per role
const ROUTE_MATRIX = {
  ANONYMOUS: [
    '/',
    '/login',
    '/features',
    '/pricing',
    '/billing/plans',
    '/contact',
    '/jobs',
    '/jobs/portal',
    '/jobs/browse',
    '/jobs/categories',
    '/blog',
    '/blog/resume-tips',
    '/portfolios',
    '/portfolio/demo-user',
    '/shared/demo-resume',
    '/p/privacy',
    '/p/terms',
    '/export/Cv1/demo-resume/en',
    '/export/Cover1/demo-resume/en'
  ],
  USER: [
    '/',
    '/build-resume',
    '/cover-letter',
    '/dashboard',
    '/dashboard/settings',
    '/dashboard/messages',
    '/dashboard/favorites',
    '/dashboard/interview',
    '/dashboard/portfolios',
    '/dashboard/applied-jobs',
    '/dashboard/job-tracker',
    '/dashboard/job-matching',
    '/dashboard/plans',
    '/portfolio/builder'
  ],
  ADMIN: [
    '/adm/dashboard',
    '/adm/users',
    '/adm/settings',
    '/adm/messages',
    '/adm/reviews',
    '/adm/trustedby',
    '/adm/employer-applications',
    '/adm/jobs-manager',
    '/adm/company-management',
    '/adm/blog-management',
    '/adm/landing-pages',
    '/adm/phrases'
  ],
  SUPER_ADMIN: [
    '/adm/dashboard',
    '/adm/audit-logs',
    '/adm/queues',
    '/adm/tenants',
    '/adm/security',
    '/adm/operations',
    '/adm/attention',
    '/adm/health',
    '/adm/operators',
    '/adm/settings'
  ],
  ENTERPRISE_ADMIN: [
    '/enterprise',
    '/enterprise?tab=overview',
    '/enterprise?tab=resumes',
    '/enterprise?tab=members',
    '/enterprise?tab=teams',
    '/enterprise?tab=workspaces',
    '/enterprise?tab=access',
    '/enterprise?tab=ai',
    '/enterprise?tab=security',
    '/enterprise?tab=usage',
    '/enterprise?tab=email',
    '/enterprise?tab=audit',
    '/enterprise?tab=support',
    '/enterprise?tab=settings'
  ],
  ENTERPRISE_MEMBER: [
    '/enterprise?tab=overview',
    '/enterprise?tab=resumes',
    '/enterprise?tab=teams',
    '/enterprise?tab=workspaces'
  ],
  EMPLOYER: [
    '/dashboard/my-employments',
    '/dashboard/my-companies',
    '/jobs/portal'
  ],
  AUDITOR: [
    '/enterprise?tab=audit',
    '/adm/audit-logs'
  ]
};

function createMockBackend() {
  return async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    
    // Core settings
    if (path === '/api/settings/public' || path === '/api/settings') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          settings: {
            siteName: 'ResumePilot AI',
            tagline: 'AI Resume & Career Platform',
            primaryColor: '#6366f1',
            enableBlog: true,
            enableJobs: true,
            enablePortfolio: true,
            enableEmployer: true,
            enableEnterprise: true,
            enableSubscriptions: true,
            maintenanceMode: false,
            enableOpenrouter: true,
            openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free'
          }
        })
      });
    }
    
    if (path === '/api/service-availability' || path === '/api/healthz') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', firebaseAdminConfigured: true, services: { resumeBuilder: true, interviewCoach: true, portfolioBuilder: true, coverLetter: true, blog: true, jobs: true, employer: true, enterprise: true, subscriptions: true, payments: true } })
      });
    }
    
    // Blog
    if (path.startsWith('/api/blog')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          posts: [{ id: 'p1', title: 'Top 10 Resume Tips for 2026', slug: 'resume-tips', excerpt: 'Proven tips for tech resumes.', author: 'Career Team', createdAt: '2026-08-01', category: 'Career Strategy', coverImage: '' }],
          total: 1,
          post: { id: 'p1', title: 'Top 10 Resume Tips for 2026', slug: 'resume-tips', content: '<p>Standardizing resume layout with clean formatting is essential for ATS compatibility.</p>', author: 'Career Team', createdAt: '2026-08-01' }
        })
      });
    }
    
    // Jobs
    if (path.startsWith('/api/jobs') || path.startsWith('/api/public/jobs')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: [{ id: 'j1', title: 'Senior Full Stack Engineer', company: 'CloudScale Inc', location: 'San Francisco, CA (Remote)', type: 'Full-time', salary: '$160k - $210k', slug: 'senior-fullstack-engineer', description: 'Lead frontend and backend distributed systems.', requirements: 'Node.js, React, TypeScript, Cloud Architecture' }],
          total: 1,
          categories: ['Engineering', 'Design', 'Product', 'Marketing', 'Data']
        })
      });
    }
    
    // Templates
    if (path.startsWith('/api/templates')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          templates: Array.from({ length: 51 }, (_, i) => ({ id: `Cv${i+1}`, name: `Template ${i+1}`, category: i % 2 === 0 ? 'Modern' : 'Executive', thumbnail: `/resumesNew/Cv${i+1}.jpg` }))
        })
      });
    }
    
    // Subscriptions
    if (path.startsWith('/api/subscriptions') || path.startsWith('/api/payments')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plans: [
            { id: 'free', name: 'Starter', price: 0, interval: 'month', features: ['1 ATS Resume', 'PDF Export', 'Standard Templates'] },
            { id: 'pro', name: 'Pro Professional', price: 12, interval: 'month', features: ['Unlimited Resumes', 'All 51 Templates', 'DOCX High-Fidelity', 'AI Interview Coach', 'WebCV Studio'] },
            { id: 'enterprise', name: 'Enterprise Team', price: 49, interval: 'month', features: ['Multi-Tenant Workspaces', 'IAM Roles & RBAC', 'AI Governance Quotas', 'Audit Logs'] }
          ]
        })
      });
    }
    
    // AI Endpoints
    if (path.startsWith('/api/generate') || path.startsWith('/api/ai/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: 'Accomplished Software Engineer with 8+ years developing scalable distributed systems and high-traffic web applications.',
          description: '• Architected resilient microservices handling 10M+ daily events with 99.99% uptime\n• Optimized React rendering pipeline reducing initial paint time by 42%',
          content: 'Engineered high-throughput event processing pipelines using Node.js and Kafka.',
          skills: ['React.js', 'Node.js', 'TypeScript', 'GraphQL', 'Docker', 'PostgreSQL', 'Kubernetes', 'CI/CD'],
          certifications: ['AWS Certified Solutions Architect - Professional', 'Certified Kubernetes Administrator (CKA)'],
          analysis: { score: 94, keywordsFound: ['React', 'Node', 'TypeScript', 'Docker'], improvements: ['Add quantified business impact metrics in project 2'] }
        })
      });
    }
    
    // Admin & Platform
    if (path.startsWith('/api/admin/users')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: [
            { uid: 'u1', email: 'user@test.com', displayName: 'John Doe', role: 'user', status: 'active', createdAt: '2026-08-01' },
            { uid: 'u2', email: 'admin@test.com', displayName: 'Admin User', role: 'admin', status: 'active', createdAt: '2026-07-15' }
          ],
          total: 2
        })
      });
    }
    
    if (path.startsWith('/api/admin/ai-settings')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          settings: {
            activeProvider: 'gemini',
            providers: {
              gemini: { enabled: true, hasKey: true, model: 'gemini-1.5-flash' },
              nvidia: { enabled: true, hasKey: true, model: 'meta/llama-3.2-11b-vision-instruct' },
              openrouter: { enabled: true, hasKey: true, model: 'meta-llama/llama-3.3-70b-instruct:free' },
              openai: { enabled: false, hasKey: false, model: 'gpt-4o-mini' }
            }
          }
        })
      });
    }
    
    if (path.startsWith('/api/admin/ai/test')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, latency: 185, provider: 'gemini' }) });
    }
    
    if (path.startsWith('/api/admin/dashboard')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          stats: { totalUsers: 1240, activeUsers: 412, totalResumes: 3890, totalPortfolios: 680, serverUptime: '99.98%' }
        })
      });
    }
    
    // Enterprise Tenant Endpoints
    if (path === '/api/enterprise/status') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, tenantId: 'tenant-acme-corp' }) });
    }
    
    if (path.startsWith('/api/enterprise/tenants')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenants: [
            { id: 'tenant-acme-corp', slug: 'acme-corp', displayName: 'Acme Global Corp', plan: 'ENTERPRISE', status: 'ACTIVE', membersCount: 45, workspacesCount: 4 }
          ],
          currentTenant: { id: 'tenant-acme-corp', slug: 'acme-corp', displayName: 'Acme Global Corp', plan: 'ENTERPRISE', status: 'ACTIVE' }
        })
      });
    }
    
    if (path.startsWith('/api/enterprise/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          members: [
            { id: 'm1', email: 'entadmin@test.com', displayName: 'Enterprise Admin', role: 'ENTERPRISE_ADMIN', status: 'ACTIVE' },
            { id: 'm2', email: 'entmember@test.com', displayName: 'Team Member', role: 'ENTERPRISE_MEMBER', status: 'ACTIVE' }
          ],
          teams: [{ id: 't1', name: 'Engineering Talent', lead: 'Enterprise Admin', membersCount: 12 }],
          workspaces: [{ id: 'w1', name: 'Core Product', isDefault: true, teamsCount: 3 }],
          roles: [{ id: 'r1', name: 'Enterprise Admin', permissions: ['*'] }, { id: 'r2', name: 'Member', permissions: ['resource.create', 'resource.read'] }],
          aiConfig: { activeProvider: 'gemini', monthlyQuota: 500000, quotaUsed: 84200 },
          serviceAccounts: [{ id: 'sa-1', name: 'CI/CD Ingestion Worker', lastRotated: '2026-08-10' }],
          auditLogs: [{ id: 'a1', actor: 'entadmin@test.com', action: 'TENANT_MEMBER_INVITE', outcome: 'SUCCESS', timestamp: new Date().toISOString() }],
          usage: { tokenConsumption: 84200, computeUnits: 120, totalResumesCreated: 420 },
          resumes: [{ id: 'res-ent-1', title: 'Lead Systems Architect', candidate: 'Jane Smith', status: 'PUBLISHED', updatedAt: '2026-08-20' }]
        })
      });
    }
    
    // Portfolios
    if (path.startsWith('/api/portfolio') || path.startsWith('/api/public/portfolio')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          portfolios: [{ id: 'port-1', slug: 'demo-user', name: 'John Doe Portfolio', template: 'modern', public: true }],
          portfolio: { id: 'port-1', slug: 'demo-user', name: 'John Doe Portfolio', title: 'Senior Staff Engineer', bio: 'Building distributed cloud platforms.', projects: [{ title: 'ResumePilot Engine', description: 'Autonomous resume generation platform.' }], skills: ['React', 'Node.js', 'Go'] }
        })
      });
    }
    
    // Cover Letter
    if (path.startsWith('/api/cover-letter')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          coverLetters: [{ id: 'cov-1', title: 'Senior Engineer Application', recipient: 'Acme Hiring Team', body: 'I am writing to express my enthusiasm for the Senior Full Stack Engineer role.' }]
        })
      });
    }
    
    // General fallback for all other API paths
    if (path.startsWith('/api/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }
    
    return route.continue();
  };
}

async function setupBrowserPage(browser, roleName) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  
  const r = ROLES[roleName] || ROLES.ANONYMOUS;
  if (r.uid) {
    const token = makeMockJwt({ user_id: r.uid, sub: r.uid, email: r.email, ...r.claims });
    await page.addInitScript(({ key, apiKey, token, uid, email, displayName }) => {
      const u = {
        uid, email, emailVerified: true, displayName,
        isAnonymous: false,
        stsTokenManager: { apiKey, refreshToken: 'fixture-refresh', accessToken: token, expirationTime: Date.now() + 3600000 },
        createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
        apiKey, appName: '[DEFAULT]',
      };
      const p = JSON.stringify(u);
      localStorage.setItem(key, p);
      localStorage.setItem(`firebase:authUser:demo-browser-api-key:[DEFAULT]`, p);
      if (apiKey) localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, p);
      localStorage.setItem('user', uid);
      try {
        const req = indexedDB.open('firebaseLocalStorageDb', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) db.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('firebaseLocalStorage', 'readwrite');
          const store = tx.objectStore('firebaseLocalStorage');
          store.put({ fbase_key: key, value: u });
        };
      } catch {}
    }, { key: `firebase:authUser:${API_KEY}:[DEFAULT]`, apiKey: API_KEY, token, uid: r.uid, email: r.email, displayName: r.displayName || roleName });
    
    await page.route('**/securetoken.googleapis.com/**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ access_token: token, expires_in: '3600', token_type: 'Bearer', refresh_token: 'fixture-refresh', id_token: token, user_id: r.uid, project_id: 'fixture-project' }),
    }));
    await page.route('**/identitytoolkit.googleapis.com/**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ users: [{ localId: r.uid, email: r.email, emailVerified: true, displayName: r.displayName || roleName }] }),
    }));
  } else {
    // Clear auth
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  }
  
  await page.route('**/*firestore.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/www.google-analytics.com/**', route => route.abort());
  await page.route('**/www.googletagmanager.com/**', route => route.abort());
  await page.route('**/maps.googleapis.com/**', route => route.abort());
  await page.route('**/api/**', createMockBackend());
  
  return page;
}

// Extract rendered controls from page DOM
async function extractDOMControls(page, route, role) {
  return await page.evaluate(({ route, role, gitSha }) => {
    const controls = [];
    
    // Select all potential interactive elements in DOM
    const elements = Array.from(document.querySelectorAll(
      'button, input, textarea, select, a[href], [role="button"], [role="tab"], [role="switch"], [role="combobox"], [role="menuitem"], [role="checkbox"], [role="radio"], [contenteditable="true"]'
    ));
    
    function isElementVisible(el) {
      if (!el.offsetParent && el.offsetWidth === 0 && el.offsetHeight === 0) {
        // May be fixed position or SVG button
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
      }
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
    
    function getAccessibleName(el) {
      // 1. aria-label / aria-labelledby
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
      const labelledby = el.getAttribute('aria-labelledby');
      if (labelledby) {
        const labelEl = document.getElementById(labelledby);
        if (labelEl) return (labelEl.textContent || '').trim();
      }
      // 2. associated <label>
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return (label.textContent || '').trim();
      }
      const parentLabel = el.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        // remove the input itself from text
        Array.from(clone.querySelectorAll('input, select, textarea')).forEach(n => n.remove());
        const t = (clone.textContent || '').trim();
        if (t) return t;
      }
      // 3. title, placeholder, alt, value (for buttons/submits)
      if (el.getAttribute('title')) return el.getAttribute('title').trim();
      if (el.getAttribute('placeholder')) return el.getAttribute('placeholder').trim();
      if (el.getAttribute('alt')) return el.getAttribute('alt').trim();
      if (el.tagName === 'INPUT' && (el.type === 'submit' || el.type === 'button') && el.value) return el.value.trim();
      // 4. textContent
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
      if (text) return text.slice(0, 80);
      // 5. name / data-testid / id
      if (el.getAttribute('data-testid')) return el.getAttribute('data-testid');
      if (el.getAttribute('name')) return el.getAttribute('name');
      if (el.id) return el.id;
      return '';
    }
    
    function getDeterministicControlId(route, role, tagName, ariaRole, name, elIndex) {
      // Stable sanitized name token
      const cleanRoute = route.replace(/\//g, '_').replace(/[^a-zA-Z0-9_]/g, '').replace(/^_+/, '') || 'root';
      const cleanName = (name || `elem_${elIndex}`).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
      const roleTag = ariaRole || tagName.toLowerCase();
      return `DOM_${cleanRoute}_${roleTag}_${cleanName}`.toUpperCase();
    }
    
    let elIndex = 0;
    for (const el of elements) {
      elIndex++;
      const visible = isElementVisible(el);
      const disabled = Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true');
      const enabled = !disabled;
      
      // Only include elements that are rendered and visible, or explicitly part of the UI disabled state contract
      if (!visible && !disabled) continue;
      
      const tagName = el.tagName.toUpperCase();
      const ariaRole = el.getAttribute('role') || (
        tagName === 'BUTTON' ? 'button' :
        tagName === 'A' ? 'link' :
        tagName === 'INPUT' ? (el.type === 'checkbox' ? 'checkbox' : el.type === 'radio' ? 'radio' : 'textbox') :
        tagName === 'TEXTAREA' ? 'textbox' :
        tagName === 'SELECT' ? 'combobox' : 'generic'
      );
      
      const accessibleName = getAccessibleName(el);
      const rect = el.getBoundingClientRect();
      const boundingBox = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
      
      const testId = el.getAttribute('data-testid') || '';
      const inputName = el.getAttribute('name') || '';
      const inputType = el.getAttribute('type') || '';
      const inputId = el.id || '';
      const href = el.getAttribute('href') || '';
      
      // Compute Playwright locator
      let locator = '';
      if (testId) {
        locator = `[data-testid="${testId}"]`;
      } else if (inputId) {
        locator = `#${inputId}`;
      } else if (inputName) {
        locator = `${tagName.toLowerCase()}[name="${inputName}"]`;
      } else if (accessibleName && accessibleName.length < 50) {
        if (tagName === 'BUTTON' || ariaRole === 'button') {
          locator = `role=button[name="${accessibleName.replace(/"/g, '\\"')}"]`;
        } else if (tagName === 'A' || ariaRole === 'link') {
          locator = `role=link[name="${accessibleName.replace(/"/g, '\\"')}"]`;
        } else if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
          locator = `role=textbox[name="${accessibleName.replace(/"/g, '\\"')}"]`;
        } else {
          locator = `${tagName.toLowerCase()}:has-text("${accessibleName.replace(/"/g, '\\"')}")`;
        }
      } else if (href) {
        locator = `a[href="${href}"]`;
      } else {
        locator = `${tagName.toLowerCase()}:nth-of-type(${elIndex})`;
      }
      
      const parentTag = el.parentElement ? el.parentElement.tagName.toLowerCase() : 'body';
      const parentClass = el.parentElement ? (el.parentElement.className || '') : '';
      const parentContext = `${parentTag}${parentClass ? '.' + String(parentClass).split(' ')[0] : ''}`;
      
      const controlId = getDeterministicControlId(route, role, tagName, ariaRole, accessibleName || inputName || inputId, elIndex);
      
      const domFingerprint = `${tagName}|${ariaRole}|${accessibleName}|${inputName}|${inputType}|${parentContext}`;
      
      // Determine component context if identifiable from parent classes/structure
      let component = 'AppShell';
      const container = el.closest('[data-component], main, section, header, nav, footer, form, .dashboardMainContent, .admin__right, .enterprise-console');
      if (container) {
        if (container.getAttribute('data-component')) component = container.getAttribute('data-component');
        else if (container.classList.contains('enterprise-console') || route.startsWith('/enterprise')) component = 'EnterpriseConsole';
        else if (container.classList.contains('admin__right') || route.startsWith('/adm')) component = 'AdminConsole';
        else if (route.startsWith('/dashboard')) component = 'UserDashboard';
        else if (route.startsWith('/build-resume') || route.startsWith('/create-resume')) component = 'ResumeBuilder';
        else if (route.startsWith('/cover-letter') || route.startsWith('/coverletter')) component = 'CoverLetter';
        else if (route.startsWith('/portfolio')) component = 'PortfolioStudio';
        else if (route.startsWith('/jobs')) component = 'JobsPortal';
        else if (route.startsWith('/blog')) component = 'BlogPortal';
        else component = container.tagName.toLowerCase();
      }
      
      controls.push({
        controlId,
        route,
        role,
        component,
        tagName,
        ariaRole,
        accessibleName,
        label: accessibleName || inputName || testId || `${tagName} control`,
        locator,
        visible,
        enabled,
        disabled,
        boundingBox,
        parentContext,
        domFingerprint,
        discoveryTimestamp: new Date().toISOString(),
        gitSha
      });
    }
    
    return controls;
  }, { route, role, gitSha });
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  STARTING REAL-DOM CONTROL CENSUS CRAWL                     ║');
  console.log('║  Playwright + Chromium + Real React DOM Verification         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  // 1. Launch Vite Server
  const vite = await createServer({
    server: { port: 0, host: '127.0.0.1', strictPort: false },
    logLevel: 'error',
    define: {
      'import.meta.env.VITE_ENTERPRISE_TENANCY_ENABLED': JSON.stringify('true'),
      'import.meta.env.VITE_FIREBASE_KEY': JSON.stringify(API_KEY),
      'import.meta.env.VITE_FIREBASE_DOMAIN': JSON.stringify('fixture.firebaseapp.com'),
      'import.meta.env.VITE_FIREBASE_DATABASE_URL': JSON.stringify('https://fixture-default-rtdb.firebaseio.com'),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('fixture-project'),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify('fixture.appspot.com'),
      'import.meta.env.VITE_FIREBASE_SENDER_ID': JSON.stringify('000000000000'),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify('1:000000000000:web:fixture'),
    },
  });
  const server = await vite.listen();
  const base = `http://127.0.0.1:${server.config.server.port}`;
  console.log(`[Vite] Server running at ${base}`);
  
  // 2. Launch Chromium
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage']
  });
  
  const allDiscoveredControls = [];
  const routeAuditLog = [];
  
  try {
    for (const [roleName, routes] of Object.entries(ROUTE_MATRIX)) {
      console.log(`\n── Crawling Role Surface: ${roleName} (${routes.length} routes) ──`);
      const page = await setupBrowserPage(browser, roleName);
      
      for (const route of routes) {
        const fullUrl = `${base}${route}`;
        const startTime = Date.now();
        let status = 'SUCCESS';
        let renderedCount = 0;
        
        try {
          await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
          // Allow React hydration and rendering
          await page.waitForTimeout(600);
          
          const controls = await extractDOMControls(page, route, roleName);
          renderedCount = controls.length;
          allDiscoveredControls.push(...controls);
          console.log(`  ✓ [${roleName}] ${route.padEnd(35)} → ${renderedCount} rendered controls (${Date.now() - startTime}ms)`);
        } catch (err) {
          status = 'ERROR: ' + err.message;
          console.log(`  ✗ [${roleName}] ${route.padEnd(35)} → Failed: ${err.message}`);
        }
        
        routeAuditLog.push({
          role: roleName,
          route,
          status,
          renderedControls: renderedCount,
          durationMs: Date.now() - startTime,
          timestamp: new Date().toISOString()
        });
      }
      
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  
  // 3. Deduplicate and reconcile control identities
  console.log('\n── Reconciling Discovered Real-DOM Controls ──');
  console.log(`Total raw DOM control findings collected: ${allDiscoveredControls.length}`);
  
  const uniqueControlSignatures = new Map();
  
  for (const ctrl of allDiscoveredControls) {
    // Unique signature key: route + tagName + ariaRole + accessibleName + locator
    const sigKey = `${ctrl.route}::${ctrl.tagName}::${ctrl.ariaRole}::${ctrl.accessibleName}::${ctrl.locator}`;
    
    if (!uniqueControlSignatures.has(sigKey)) {
      uniqueControlSignatures.set(sigKey, {
        controlId: ctrl.controlId,
        route: ctrl.route,
        component: ctrl.component,
        tagName: ctrl.tagName,
        ariaRole: ctrl.ariaRole,
        accessibleName: ctrl.accessibleName,
        label: ctrl.label,
        locator: ctrl.locator,
        boundingBox: ctrl.boundingBox,
        parentContext: ctrl.parentContext,
        domFingerprint: ctrl.domFingerprint,
        visibleForRoles: new Set([ctrl.role]),
        hiddenForRoles: new Set(),
        disabledForRoles: new Set(ctrl.disabled ? [ctrl.role] : []),
        authorizedRoles: new Set([ctrl.role]),
        unauthorizedRoles: new Set(),
        gitSha: ctrl.gitSha,
        discoveryTimestamp: ctrl.discoveryTimestamp
      });
    } else {
      const existing = uniqueControlSignatures.get(sigKey);
      existing.visibleForRoles.add(ctrl.role);
      existing.authorizedRoles.add(ctrl.role);
      if (ctrl.disabled) existing.disabledForRoles.add(ctrl.role);
    }
  }
  
  const allRolesList = Object.keys(ROLES);
  const reconciledUniqueControls = Array.from(uniqueControlSignatures.values()).map((c, index) => {
    // Convert sets to sorted arrays
    const visibleArr = Array.from(c.visibleForRoles);
    const hiddenArr = allRolesList.filter(r => !c.visibleForRoles.has(r));
    const disabledArr = Array.from(c.disabledForRoles);
    const authorizedArr = Array.from(c.authorizedRoles);
    const unauthorizedArr = allRolesList.filter(r => !c.authorizedRoles.has(r));
    
    const cleanContext = (c.parentContext || 'ctx').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 25);
    const cleanName = (c.accessibleName || c.label || 'elem').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30);
    const cleanRoute = (c.route || 'root').replace(/[^a-zA-Z0-9_]/g, '_');
    const stableKey = `DOM_${cleanRoute}_${c.tagName}_${cleanContext}_${cleanName}_${String(index + 1).padStart(4, '0')}`.toUpperCase();

    return {
      controlId: `CTRL_DOM_${String(index + 1).padStart(4, '0')}`,
      stableKey,
      route: c.route,
      component: c.component,
      tagName: c.tagName,
      ariaRole: c.ariaRole,
      accessibleName: c.accessibleName,
      label: c.label,
      locator: c.locator,
      boundingBox: c.boundingBox,
      parentContext: c.parentContext,
      domFingerprint: c.domFingerprint,
      visibleForRoles: visibleArr,
      hiddenForRoles: hiddenArr,
      disabledForRoles: disabledArr,
      authorizedRoles: authorizedArr,
      unauthorizedRoles: unauthorizedArr,
      gitSha: c.gitSha,
      discoveryTimestamp: c.discoveryTimestamp
    };
  });
  
  console.log(`Unique Real-DOM Controls discovered: ${reconciledUniqueControls.length}`);
  
  // Group by route
  const byRoute = {};
  for (const c of reconciledUniqueControls) {
    byRoute[c.route] = (byRoute[c.route] || 0) + 1;
  }
  console.log('\nControl count by route:');
  for (const [route, count] of Object.entries(byRoute)) {
    console.log(`  ${route.padEnd(35)} : ${count} unique controls`);
  }
  
  // Save Real DOM Census Output
  const censusResult = {
    censusVersion: '1.0.0-REAL-DOM',
    censusTimestamp: new Date().toISOString(),
    gitSha,
    methodology: 'PLAYWRIGHT_CHROMIUM_REAL_REACT_DOM_CRAWL',
    summary: {
      totalRawRenderedObservations: allDiscoveredControls.length,
      totalUniqueRenderedControls: reconciledUniqueControls.length,
      totalRoutesCrawled: Object.keys(byRoute).length,
      rolesAudited: Object.keys(ROLES)
    },
    routeAuditLog,
    controls: reconciledUniqueControls
  };
  
  fs.writeFileSync('test-results/REAL_DOM_CONTROL_CENSUS.json', JSON.stringify(censusResult, null, 2), 'utf8');
  console.log('\n[Census] Saved real DOM control census to test-results/REAL_DOM_CONTROL_CENSUS.json');
}

main().catch(err => {
  console.error('Census error:', err);
  process.exit(1);
});
