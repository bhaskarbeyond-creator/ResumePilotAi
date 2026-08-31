/**
 * Playwright Role × Dashboard × Page × Action matrix.
 *
 * Uses the local-auth preview-login flow (VITE_LOCAL_AUTH=true) to sign in as
 * each of the 8 roles and verifies that:
 *   - role-appropriate navigation surfaces appear;
 *   - protected admin/super/enterprise/employer routes are reachable or
 *     correctly blocked (403, redirect-to-login, or safe error) based on role;
 *   - cross-role direct-URL navigation does not expose privileged UI;
 *   - the UI never crashes (no React error overlay, no infinite spinner).
 *
 * Tests that require MySQL-populated seed data or external providers (payment
 * sandboxes, Firebase) are marked ENVIRONMENT_BLOCKED where appropriate.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const API = process.env.PLAYWRIGHT_API_URL || 'http://localhost:8080';

const ROLES = [
  { id: 'user', email: 'user@test.test', expected: { canAdmin: false, canEnterprise: false, canEmployer: false } },
  { id: 'employer', email: 'employer@resumepilot.test', expected: { canAdmin: false, canEnterprise: false, canEmployer: true } },
  { id: 'enterprise_member', email: 'ent-member@resumepilot.test', expected: { canAdmin: false, canEnterprise: true, canEmployer: false } },
  { id: 'enterprise_admin', email: 'ent-admin@resumepilot.test', expected: { canAdmin: false, canEnterprise: true, canEmployer: false, isEntAdmin: true } },
  { id: 'support', email: 'support@resumepilot.test', expected: { canAdmin: true, canEnterprise: false, canEmployer: false, isSupport: true } },
  { id: 'auditor', email: 'auditor@resumepilot.test', expected: { canAdmin: true, canEnterprise: false, canEmployer: false, isAuditor: true } },
  { id: 'admin', email: 'admin@resumepilot.test', expected: { canAdmin: true, canEnterprise: false, canEmployer: false } },
  { id: 'super_admin', email: 'superadmin@resumepilot.test', expected: { canAdmin: true, canEnterprise: false, canEmployer: false, isSuper: true } },
];

async function signIn(page, email) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  // Wait for auth form to be visible
  await page.waitForSelector('#input-email', { timeout: 10000 });
  await page.fill('#input-email', email);
  await page.fill('#input-password', 'password123');
  await page.focus('#input-password');
  await page.keyboard.press('Enter');
  // Wait until navigation lands (either /dashboard, error, or maintenance gate)
  try {
    await page.waitForURL(/\/(dashboard|login|adm|enterprise)/, { timeout: 10000 });
  } catch (_e) { /* fall through */ }
  await page.waitForTimeout(800);
}

async function assertNoCrash(page) {
  const html = await page.locator('#root').innerHTML();
  expect(html).not.toMatch(/unhandled|runtime error|minified react error/i);
}

async function assertNoInfiniteSpinner(page) {
  const text = await page.locator('body').innerText();
  // "Service temporarily unavailable" is a valid fail-closed state when a subsystem is down.
  // "Loading..." persisting indefinitely is a defect.
  if (/Service temporarily unavailable|Scheduled maintenance/i.test(text)) return;
  // The page should not be ONLY a spinner (body has some textual content)
  expect(text.length).toBeGreaterThan(50);
}

for (const role of ROLES) {
  test.describe(`Role: ${role.id} (${role.email})`, () => {
    test.beforeEach(async ({ page }) => {
      await signIn(page, role.email);
    });

    test('lands on dashboard after login (or maintenance gate)', async ({ page }) => {
      await assertNoCrash(page);
      const url = page.url();
      await page.waitForTimeout(1500);
      const text = await page.locator('body').innerText();
      const onDashboard = url.includes('/dashboard') || /dashboard|workspace|overview/i.test(text);
      const maintenance = /temporarily unavailable|maintenance/i.test(text);
      expect(onDashboard || maintenance).toBe(true);
    });

    test('/adm/dashboard access matches role expectation', async ({ page }) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE + '/adm/dashboard', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await assertNoCrash(page);
      const text = await page.locator('body').innerText();
      const url = page.url();
      if (role.expected.canAdmin) {
        // Admin-capable roles should land somewhere in the admin console OR hit
        // a known degraded-services gate (IDENTITY_DIRECTORY_UNAVAILABLE) since
        // Firebase admin listUsers is unavailable in local mode. They must NOT
        // be silently returned to /login.
        const onAdmin = url.includes('/adm');
        const degraded = /unavailable|degraded|loading/i.test(text.toLowerCase());
        expect(onAdmin || degraded).toBe(true);
        expect(url.includes('/login')).toBe(false);
      } else {
        const blocked = /login|not authorized|forbidden|sign.?in/i.test(text.toLowerCase())
          || url.includes('/login') || !url.includes('/adm');
        expect(blocked).toBe(true);
      }
      expect(errors.filter(e => !/firebase|googleapis|ERR_CONNECTION_CLOSED/i.test(e))).toEqual([]);
    });

    test('/enterprise access matches role expectation', async ({ page }) => {
      await page.goto(BASE + '/enterprise', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await assertNoCrash(page);
      const text = await page.locator('body').innerText();
      const url = page.url();
      const text_lc = text.toLowerCase();
      const enterpriseUnavailable = /enterprise (is )?(unavailable|disabled)/i.test(text_lc);
      const denied = /forbidden|unauthorized|not authorized|access denied/i.test(text_lc);
      const atLogin = url.includes('/login');
      if (role.expected.canEnterprise) {
        // Enterprise users may see the console OR the "enterprise unavailable"
        // gate (when no tenant is provisioned in local mode). Both are valid.
        // They must NOT be redirected to /login or shown forbidden.
        const onEnt = url.includes('/enterprise');
        expect(atLogin || denied).toBe(false);
        expect(onEnt).toBe(true);
      } else {
        // Non-enterprise roles: must either be blocked (login/forbidden) OR
        // see the feature-disabled gate. They must NOT see an active tenant
        // management console.
        const showingEntConsole = /tenant|workspace|team|members/i.test(text_lc) && !enterpriseUnavailable;
        expect(showingEntConsole).toBe(false);
      }
    });

    test('/build-resume does not crash for any authenticated role', async ({ page }) => {
      await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await assertNoCrash(page);
      await assertNoInfiniteSpinner(page);
    });

    test('/billing/plans does not crash', async ({ page }) => {
      await page.goto(BASE + '/billing/plans', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await assertNoCrash(page);
    });

    test('/profile renders (or maintenance gate)', async ({ page }) => {
      await page.goto(BASE + '/profile', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await assertNoCrash(page);
    });
  });
}

test.describe('Cross-role isolation', () => {
  test('USER cannot access /adm/dashboard via direct URL after login', async ({ page }) => {
    await signIn(page, 'user@test.test');
    await page.goto(BASE + '/adm/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const text = await page.locator('body').innerText();
    expect(/platform health|administrator dashboard/i.test(text.toLowerCase())).toBe(false);
  });

  test('USER cannot access /enterprise admin via direct URL', async ({ page }) => {
    await signIn(page, 'user@test.test');
    await page.goto(BASE + '/enterprise', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const text = await page.locator('body').innerText();
    expect(/tenant management|enterprise admin/i.test(text.toLowerCase())).toBe(false);
  });
});

test.describe('Public unauthenticated security checks', () => {
  test('/adm/dashboard redirects or blocks unauthenticated user', async ({ page }) => {
    await page.goto(BASE + '/adm/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const url = page.url();
    const text = await page.locator('body').innerText();
    const blocked = url.includes('/login') || /sign.?in|login|forbidden|unauthorized/i.test(text.toLowerCase())
      || /temporarily unavailable/i.test(text);
    expect(blocked).toBe(true);
    expect(/platform health|administrator dashboard/i.test(text.toLowerCase())).toBe(false);
  });
});
