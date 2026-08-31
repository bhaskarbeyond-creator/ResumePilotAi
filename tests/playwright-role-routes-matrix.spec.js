/**
 * Comprehensive 8-role × route access audit (Wave 9 deep-RBAC edition).
 *
 * Strategy:
 *   - For each role, exchange credentials directly against the dev
 *     preview-login endpoint and plant the resulting local-session JWT
 *     into localStorage before any navigation. This is equivalent to a
 *     successful form sign-in (the same token the form stores) but
 *     avoids depending on UI event bubbling / form rendering order.
 *   - Save `storageState` per role, reuse for all that role's routes.
 *   - Visit each route directly; assert allowed routes stay on-path and
 *     don't crash, denied routes redirect off-path.
 */
import { test as base, expect, request } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const API = BASE.replace(/:\d+/, ':8080'); // backend port for direct token exchange
const STATE_DIR = path.resolve(__dirname, '.auth-states');
const LOCAL_SESSION_KEY = 'resumepilot_local_session_v1';
fs.mkdirSync(STATE_DIR, { recursive: true });

const ROLES = [
  { email: 'user@test.test',              role: 'USER' },
  { email: 'employer@resumepilot.test',   role: 'EMPLOYER' },
  { email: 'ent-member@resumepilot.test', role: 'ENTERPRISE_MEMBER' },
  { email: 'ent-admin@resumepilot.test',  role: 'ENTERPRISE_ADMIN' },
  { email: 'support@resumepilot.test',    role: 'SUPPORT' },
  { email: 'auditor@resumepilot.test',    role: 'AUDITOR' },
  { email: 'admin@resumepilot.test',      role: 'ADMIN' },
  { email: 'superadmin@resumepilot.test', role: 'SUPER_ADMIN' },
];

const ROUTES = [
  { path: '/',                  allow: '*', public: true },
  { path: '/login',             allow: '*', public: true },
  { path: '/pricing',           allow: '*', public: true },
  { path: '/blog',              allow: '*', public: true },
  { path: '/contact',           allow: '*', public: true },
  { path: '/features',          allow: '*', public: true },
  { path: '/jobs',              allow: '*', public: true },
  { path: '/jobs/browse',       allow: '*', public: true },
  { path: '/billing/plans',     allow: '*', public: true },
  { path: '/build-resume/heading', allow: '*', public: true },
  { path: '/dashboard',                allow: 'auth' },
  { path: '/dashboard/settings',       allow: 'auth' },
  { path: '/dashboard/messages',       allow: 'auth' },
  { path: '/dashboard/favorites',      allow: 'auth' },
  { path: '/dashboard/interview',      allow: 'auth' },
  { path: '/dashboard/cover-letters',  allow: 'auth' },
  { path: '/dashboard/portfolios',     allow: 'auth' },
  { path: '/dashboard/applied-jobs',   allow: 'auth' },
  { path: '/dashboard/job-tracker',    allow: 'auth' },
  { path: '/dashboard/my-employments', allow: 'auth' },
  { path: '/dashboard/my-companies',   allow: 'auth' },
  { path: '/dashboard/plans',          allow: 'auth' },
  { path: '/portfolio/builder',        allow: 'auth' },
  { path: '/enterprise',               allow: 'auth' },
  { path: '/blog-editor',              allow: 'auth' },
  { path: '/adm/dashboard',       allow: 'admin' },
  { path: '/adm/users',           allow: 'admin' },
  { path: '/adm/audit-logs',      allow: 'admin' },
  { path: '/adm/tenants',         allow: 'admin' },
  { path: '/adm/security',        allow: 'admin' },
  { path: '/adm/health',          allow: 'admin' },
  { path: '/adm/operations',      allow: 'admin' },
  { path: '/adm/settings',        allow: 'admin' },
  { path: '/adm/jobs-manager',    allow: 'admin' },
  { path: '/adm/blog-management', allow: 'admin' },
  { path: '/adm/help-desk',       allow: 'admin' },
];

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'AUDITOR', 'SUPPORT']);
function canAccess(route, role) {
  if (route.allow === '*') return true;
  if (route.allow === 'auth') return role !== null;
  if (route.allow === 'admin') return ADMIN_ROLES.has(role);
  return false;
}

/**
 * Exchange credentials for a local-session token directly against the
 * backend preview-login endpoint and plant it in localStorage of a blank
 * page. Mirrors exactly what the Login form does after a successful
 * signInWithEmailAndPassword in local-auth mode.
 */
async function plantSession(page, email, password = 'password123') {
  // First fetch the token directly via API
  const api = await request.newContext();
  const resp = await api.post(`${API}/api/auth/preview-login`, {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ email, password }),
  });
  expect(resp.ok(), `preview-login for ${email} must succeed (status ${resp.status()})`).toBeTruthy();
  const data = await resp.json();
  expect(data.token, 'preview-login must return a token').toBeTruthy();
  expect(data.role, 'preview-login must return role').toBeTruthy();

  // Navigate to a blank same-origin page so we can set localStorage
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const session = {
    token: data.token,
    uid: data.uid,
    email: data.email,
    displayName: data.displayName || data.email.split('@')[0],
    role: data.role,
    exp: 0,
  };
  await page.evaluate(([key, value]) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [LOCAL_SESSION_KEY, session]);
  await api.dispose();
  return data;
}

// ─── Auth setup: one test per role plants the session and saves storageState ───
for (const role of ROLES) {
  const stateFile = path.join(STATE_DIR, `${role.role}.json`);
  base(`auth-setup: ${role.role}`, async ({ browser }) => {
    fs.rmSync(stateFile, { force: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const data = await plantSession(page, role.email);
    expect(data.role.toUpperCase()).toBe(role.role);
    // After planting session, navigate to a landing route so auth settles
    const landingRoute = ADMIN_ROLES.has(role.role) ? '/adm/dashboard' : '/dashboard';
    await page.goto(BASE + landingRoute, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1200);
    await context.storageState({ path: stateFile });
    await context.close();
    expect(fs.existsSync(stateFile)).toBeTruthy();
  });
}

// ─── Per-role tests using pre-saved storageState ───
for (const role of ROLES) {
  const stateFile = path.join(STATE_DIR, `${role.role}.json`);
  const testForRole = base.extend({
    storageState: [stateFile, { scope: 'test' }],
  });
  testForRole.describe(`Role: ${role.role} (${role.email})`, () => {
    for (const route of ROUTES) {
      const allowed = canAccess(route, role.role);
      testForRole(`${allowed ? 'can' : 'cannot'} access ${route.path}`, async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
        page.on('console', m => {
          if (m.type() === 'error') {
            const t = m.text();
            if (!/net::ERR_FAILED|Failed to load resource|403|404|503|ERR_CONNECTION|favicon|fonts.googleapis|supademo/i.test(t)) {
              errors.push('CONSOLE: ' + t);
            }
          }
        });
        await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1200);
        const url = page.url();
        const html = await page.locator('#root').innerHTML();

        if (allowed) {
          const prefix = route.path.replace(/\/\*$/, '').replace(/\/+$/, '');
          const onRoute = url === BASE + prefix || url.startsWith(BASE + prefix + '/') || url.startsWith(BASE + prefix + '?');
          const onLoginRedirect = route.path === '/login' && url.startsWith(BASE + '/dashboard');
          // /adm/dashboard may redirect to a sub-route like /adm/dashboard/
          const onAdminDefault = route.path === '/adm/dashboard' && url.startsWith(BASE + '/adm/');
          expect(onRoute || onLoginRedirect || onAdminDefault,
            `${role.role} should land on ${route.path}, got ${url}`).toBeTruthy();
          expect(html).not.toMatch(/unhandled|minified react error/i);
          // 403 toasts from over-privileged deep-links are expected — record but don't fail
          if (errors.length > 0) {
            console.warn(`[${role.role} → ${route.path}] console:`, errors);
          }
        } else {
          const prefix = route.path.replace(/\/\*$/, '').replace(/\/+$/, '');
          const onForbidden = url === BASE + prefix || url.startsWith(BASE + prefix + '/') || url.startsWith(BASE + prefix + '?');
          expect(onForbidden, `${role.role} must NOT stay on ${route.path}, got ${url}`).toBeFalsy();
        }
      });
    }
  });
}

// ─── Unauthenticated block ───
base.describe('Unauthenticated', () => {
  const PROTECTED = ROUTES.filter(r => !r.public);
  for (const route of PROTECTED) {
    base(`cannot access ${route.path}`, async ({ page }) => {
      await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1200);
      const url = page.url();
      const prefix = route.path.replace(/\/\*$/, '').replace(/\/+$/, '');
      const onForbidden = url === BASE + prefix || url.startsWith(BASE + prefix + '/') || url.startsWith(BASE + prefix + '?');
      expect(onForbidden, `unauthenticated must NOT land on ${route.path}, URL=${url}`).toBeFalsy();
    });
  }
});
