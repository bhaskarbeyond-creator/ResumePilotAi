/**
 * Browser-level direct-URL/redirect IDOR tests plus API-level RBAC checks
 * using Playwright's `request` fixture with preview-login tokens.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const API  = process.env.PLAYWRIGHT_API_URL  || 'http://localhost:8080';

async function signIn(page, email, password = 'password123') {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#input-email', { timeout: 10000 });
  await page.fill('#input-email', email);
  await page.fill('#input-password', password);
  await page.focus('#input-password');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
}

async function loginToken(request, email) {
  const r = await request.post(API + '/api/auth/preview-login', {
    data: { email, password: 'password123', name: 'Test' },
  });
  expect(r.ok()).toBeTruthy();
  const b = await r.json();
  return b.token;
}

test.describe('Unauthenticated direct-URL navigation does not expose protected content', () => {
  const PROTECTED_PATHS = ['/dashboard', '/build-resume/heading', '/settings', '/billing/plans', '/profile'];
  for (const p of PROTECTED_PATHS) {
    test(`unauth access to ${p} does not render protected content`, async ({ page }) => {
      await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const html = await page.locator('#root').innerHTML();
      // These protected markers only appear when the user is authenticated
      // with a real dashboard loaded. (Login form / auth gate is acceptable.)
      expect(html).not.toMatch(/Resume Workspace/i);
    });
  }
});

test.describe('Cross-role API RBAC (preview-login tokens)', () => {
  test('USER token is rejected from /api/admin/*', async ({ request }) => {
    const tok = await loginToken(request, 'user@test.test');
    const r = await request.get(API + '/api/admin/users', { headers: { Authorization: `Bearer ${tok}` } });
    expect([401, 403, 404]).toContain(r.status());
  });
  test('USER token is rejected from /api/enterprise/admin', async ({ request }) => {
    const tok = await loginToken(request, 'user@test.test');
    const r = await request.get(API + '/api/enterprise/admin', { headers: { Authorization: `Bearer ${tok}` } });
    expect([401, 403, 404, 503]).toContain(r.status());
  });
  test('EMPLOYER token is rejected from /api/admin/users', async ({ request }) => {
    const tok = await loginToken(request, 'employer@resumepilot.test');
    const r = await request.get(API + '/api/admin/users', { headers: { Authorization: `Bearer ${tok}` } });
    expect([401, 403, 404]).toContain(r.status());
  });
  test('AUDITOR cannot POST to /api/admin/users (read-only)', async ({ request }) => {
    const tok = await loginToken(request, 'auditor@resumepilot.test');
    const r = await request.post(API + '/api/admin/users', {
      headers: { Authorization: `Bearer ${tok}` },
      data: { email: 'pwn@test.test', role: 'SUPER_ADMIN' },
    });
    expect([401, 403, 404, 405]).toContain(r.status());
  });
  test('forged token (bad signature) returns 401', async ({ request }) => {
    const tok = await loginToken(request, 'user@test.test');
    const forged = tok.slice(0, -3) + 'XXX';
    const r = await request.get(API + '/api/auth/me', { headers: { Authorization: `Bearer ${forged}` } });
    expect([401, 403]).toContain(r.status());
  });
});

test('USER cannot reach /adm/dashboard via direct browser URL after login', async ({ page }) => {
  await signIn(page, 'user@test.test');
  await page.goto(BASE + '/adm/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await expect(page).not.toHaveURL(/\/adm\/dashboard/);
});
