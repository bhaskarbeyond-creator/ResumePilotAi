/**
 * REAL DOM CONTROL CENSUS
 *
 * Discovers actual interactive controls that render in a real Chromium + React
 * application, instead of the AST/regex source-code census. It boots the real
 * Vite app, seeds a deterministic auth session (or anonymous), crawls routes,
 * and records the visible interactive DOM controls with an independent signature.
 *
 * This is intentionally different from `full-control-audit-engine.mjs` / the
 * 2,052 synthetic ledger: every control listed here actually rendered in the
 * browser DOM at the time of the crawl.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs';
import crypto from 'node:crypto';

const API_KEY = process.env.VITE_FIREBASE_KEY || 'demo-browser-api-key';

function jwt(overrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({
    iss: 'https://securetoken.google.com/fixture', aud: 'fixture', auth_time: now,
    user_id: 'test-user', sub: 'test-user', iat: now, exp: now + 3600,
    email: 'user@test.com', email_verified: true,
    firebase: { identities: { email: ['user@test.com'] }, sign_in_provider: 'password' },
    ...overrides,
  })).toString('base64url');
  return `${header}.${claims}.mock_signature`;
}

const ROUTES = {
  ANONYMOUS: ['/', '/features', '/pricing', '/blog', '/jobs', '/templates', '/contact', '/about', '/login', '/register', '/portfolios', '/billing/plans'],
  USER: ['/dashboard', '/build-resume', '/build-resume/heading', '/build-resume/employment', '/build-resume/education', '/build-resume/skills', '/build-resume/languages', '/build-resume/projects', '/build-resume/certifications', '/build-resume/extras', '/build-resume/summary', '/create-resume', '/create-resume/heading', '/interviews', '/coverletter', '/cover-letter', '/portfolio/builder', '/account', '/applied-jobs'],
  ADMIN: ['/adm', '/adm/users', '/adm/ai-settings', '/adm/settings', '/adm/blog', '/adm/audit', '/adm/security', '/adm/email', '/adm/payments', '/adm/subscriptions', '/adm/firebase', '/adm/social-auth', '/adm/maintenance', '/adm/features'],
};

function mockBackend() {
  return async (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname;
    const json = (o) => route.fulfill({ json: o });
    if (p === '/api/settings/public' || p === '/api/settings') return json({ settings: { siteName: 'ResumePilot AI', tagline: 'Build Your Career', primaryColor: '#6366f1', enableBlog: true, enableJobs: true, enablePortfolio: true, enableEmployer: true, enableEnterprise: true, enableSubscriptions: true, maintenanceMode: false } });
    if (p === '/api/service-availability') return json({ services: { resumeBuilder: true, interviewCoach: true, portfolioBuilder: true, coverLetter: true, blog: true, jobs: true, employer: true, enterprise: true, subscriptions: true, payments: true } });
    if (p.startsWith('/api/blog')) return json({ posts: [{ id: 'p1', title: 'Resume Tips', slug: 'resume-tips', excerpt: 'Tips', author: 'Admin', createdAt: '2026-08-01', category: 'Career', coverImage: '' }], total: 1, post: { id: 'p1', title: 'Resume Tips', slug: 'resume-tips', content: '<p>Content</p>', author: 'Admin', createdAt: '2026-08-01' } });
    if (p.startsWith('/api/jobs') || p.startsWith('/api/public/jobs')) return json({ jobs: [{ id: 'j1', title: 'Frontend Dev', company: 'TechCo', location: 'Remote', type: 'Full-time', salary: '$120k', slug: 'frontend-dev' }], total: 1 });
    if (p.startsWith('/api/templates')) return json({ templates: Array.from({ length: 51 }, (_, i) => ({ id: `cv${i+1}`, name: `Template ${i+1}`, category: 'Professional', thumbnail: '' })) });
    if (p.startsWith('/api/subscriptions') || p.startsWith('/api/payments')) return json({ plans: [{ id: 'free', name: 'Free', price: 0, features: ['1 Resume'] }, { id: 'pro', name: 'Pro', price: 9.99, features: ['All Templates'] }] });
    if (p.startsWith('/api/generate') || p.startsWith('/api/ai/')) return json({ summary: 'AI content.', description: '• Achievement', content: 'Content', skills: ['Docker', 'React', 'Node'], certifications: ['AWS Solutions Architect'] });
    if (p.startsWith('/api/admin/users')) return json({ users: [{ uid: 'u1', email: 'user@test.com', displayName: 'User', role: 'user', status: 'active' }], total: 1 });
    if (p.startsWith('/api/admin/')) return json({ success: true, settings: {} });
    if (p.startsWith('/api/enterprise/')) return json({});
    if (p.startsWith('/api/user/')) return json({});
    if (p.startsWith('/api/portfolio')) return json({ portfolios: [], portfolio: {} });
    if (p.startsWith('/api/public/')) return json({});
    if (p.startsWith('/api/')) return json({});
    return route.continue();
  };
}

async function setupPage(browser, role) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', () => {});
  if (role !== 'ANONYMOUS') {
    const uid = role === 'ADMIN' ? 'test-superadmin' : 'test-user';
    const email = role === 'ADMIN' ? 'sa@test.com' : 'user@test.com';
    const claims = role === 'ADMIN' ? { admin: true, superAdmin: true } : {};
    const token = jwt({ user_id: uid, sub: uid, email, ...claims });
    await page.addInitScript(({ key, apiKey, token, uid, email }) => {
      const u = { uid, email, emailVerified: true, displayName: '',
        isAnonymous: false, stsTokenManager: { apiKey, refreshToken: 'fix', accessToken: token, expirationTime: Date.now() + 3600000 },
        createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]' };
      const p = JSON.stringify(u);
      localStorage.setItem(key, p); localStorage.setItem('user', uid);
      if (apiKey) localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, p);
      try { const r = indexedDB.open('firebaseLocalStorageDb', 1); r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('firebaseLocalStorage')) db.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' }); }; r.onsuccess = () => { const db = r.result; const tx = db.transaction('firebaseLocalStorage', 'readwrite'); tx.objectStore('firebaseLocalStorage').put({ fbase_key: key, value: u }); }; } catch {}
    }, { key: `firebase:authUser:${API_KEY}:[DEFAULT]`, apiKey: API_KEY, token, uid, email });
  }
  await page.route('**/securetoken.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', expires_in: '3600', token_type: 'Bearer' }) }));
  await page.route('**/identitytoolkit.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/*firestore.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/www.google-analytics.com/**', r => r.abort());
  await page.route('**/www.googletagmanager.com/**', r => r.abort());
  await page.route('**/maps.googleapis.com/**', r => r.abort());
  await page.route('**/api/**', mockBackend());
  return page;
}

function normalize(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

async function censusRoute(page, base, route, role) {
  await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const out = [];
    const label = (el) => {
      if (!el) return '';
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      if (el.getAttribute('data-testid')) return el.getAttribute('data-testid');
      if (el.getAttribute('name')) return el.getAttribute('name');
      if (el.getAttribute('placeholder')) return el.getAttribute('placeholder');
      if (el.tagName === 'BUTTON' || el.tagName === 'A') return (el.innerText || el.textContent || '').trim();
      return el.value || el.id || el.type || '';
    };
    const push = (el, ctlType) => {
      const tag = el.tagName.toLowerCase();
      const l = label(el);
      // ignore generic decorative/noise in some bundles
      out.push({ tag, type: ctlType, label: String(l).slice(0, 120) });
    };
    document.querySelectorAll('button, input, textarea, select, a[href], [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="option"]').forEach((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      if (!visible) return;
      const tag = el.tagName.toLowerCase();
      if (tag === 'button' || el.getAttribute('role') === 'button') return push(el, 'BUTTON');
      if (tag === 'input') {
        const t = el.type || 'text';
        if (t === 'checkbox') return push(el, 'CHECKBOX');
        if (t === 'radio') return push(el, 'RADIO');
        return push(el, 'INPUT[' + t.toUpperCase() + ']');
      }
      if (tag === 'textarea') return push(el, 'TEXTAREA');
      if (tag === 'select') return push(el, 'SELECT');
      if (tag === 'a' && el.getAttribute('href')) return push(el, 'LINK');
      const role = el.getAttribute('role');
      if (role === 'tab') return push(el, 'TAB');
      if (role === 'switch') return push(el, 'TOGGLE');
      if (role === 'menuitem') return push(el, 'MENU');
      if (role === 'option') return push(el, 'OPTION');
    });
    return out;
  });
}

async function main() {
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

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'],
      ...(process.env.PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH ? { env: { ...process.env, LD_LIBRARY_PATH: process.env.PLAYWRIGHT_CHROMIUM_LD_LIBRARY_PATH } } : {}),
    });
  } catch (e) {
    console.log('SKIPPED', e.message.split('\n')[0]);
    await vite.close();
    process.exit(0);
  }

  const records = [];
  for (const [role, routes] of Object.entries(ROUTES)) {
    const page = await setupPage(browser, role);
    for (const route of routes) {
      const controls = await censusRoute(page, base, route, role);
      for (const c of controls) {
        records.push({ role, route, ...c, signature: `${c.tag}|${c.type}|${c.label}` });
      }
    }
    await page.close();
  }

  const byRole = {};
  for (const role of Object.keys(ROUTES)) byRole[role] = records.filter(r => r.role === role).length;

  const byType = {};
  for (const r of records) byType[r.type] = (byType[r.type] || 0) + 1;

  const distinct = new Set(records.map(r => r.signature));
  const byRoute = {};
  for (const r of records) {
    const key = `${r.role}|${r.route}`;
    byRoute[key] = (byRoute[key] || 0) + 1;
  }

  const result = {
    timestamp: new Date().toISOString(),
    gitSha: (() => { try { return require('node:child_process').execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return 'UNKNOWN'; } })(),
    method: 'REAL_DOM_CENSUS',
    notes: 'Controls that actually rendered in real Chromium DOM during a deterministic crawl. NOT the AST/regex source census.',
    counts: {
      routesCrawled: Object.values(ROUTES).flat().length,
      domControlsObserved: records.length,
      distinctControlSignatures: distinct.size,
      byRole,
      byType,
      byRoute,
    },
    records,
  };
  fs.writeFileSync('test-results/REAL_DOM_CONTROL_CENSUS.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.counts, null, 2));
  await browser.close();
  await vite.close();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
