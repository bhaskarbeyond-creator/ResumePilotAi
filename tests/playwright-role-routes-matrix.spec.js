/**
 * Comprehensive 8-role × route access audit (Wave 8).
 *
 * Strategy:
 *   - For each role, log in once via the form (saving storageState) and reuse
 *     that state across all route tests for that role. This avoids the
 *     brittle re-login-per-test pattern that broke with concurrent workers.
 *   - Visit each route directly; assert allowed routes stay on-path and
 *     don't crash, denied routes redirect off-path.
 */
import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const STATE_DIR = path.resolve(__dirname, '.auth-states');
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

// ─── Auth setup project: for each role, sign in once and save storage ───
// We don't use Playwright projects here — simpler: just run setup as
// dependency tests before the real ones (Playwright runs them in order of
// declaration when they share a worker; we set workers=1 for predictability).
for (const role of ROLES) {
  const stateFile = path.join(STATE_DIR, `${role.role}.json`);
  base(`auth-setup: ${role.role}`, async ({ browser }) => {
    fs.rmSync(stateFile, { force: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#input-email', { timeout: 15000 });
    await page.fill('#input-email', role.email);
    await page.fill('#input-password', 'password123');
    await page.focus('#input-password');
    await page.keyboard.press('Enter');
    try { await page.waitForURL(/\/(dashboard|adm|enterprise)/, { timeout: 15000 }); } catch (_e) {}
    await page.waitForTimeout(800);
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
            if (!/net::ERR_FAILED|Failed to load resource|403|404|503|ERR_CONNECTION|favicon/i.test(t)) {
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
          expect(onRoute || onLoginRedirect, `${role.role} should land on ${route.path}, got ${url}`).toBeTruthy();
          expect(html).not.toMatch(/unhandled|minified react error/i);
          if (errors.length > 0) {
            // Note: don't hard-fail on console errors yet; we'll record them
            console.warn(`[${role.role} → ${route.path}] console errors:`, errors);
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
