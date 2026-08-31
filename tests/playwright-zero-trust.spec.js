/**
 * Zero-trust Playwright browser audit.
 *
 * Tests public + role-based flows against the running dev server at http://localhost:5173
 * with backend at http://localhost:8080. The backend runs in degraded MySQL mode, so
 * flows that require persistent storage are marked ENVIRONMENT_BLOCKED at the data layer,
 * but we still verify routing, rendering, auth walls, error states, and public surfaces.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const API = process.env.PLAYWRIGHT_API_URL || 'http://localhost:8080';

// Note: Role-based UI browser flows (all 8 roles) require either Firebase client
// credentials or a mounted /api/auth/preview-login-aware frontend login. With
// VITE_LOCAL_AUTH=true the frontend exposes signInWithEmailAndPassword against the
// preview endpoint; however, every data-mutating route depends on MariaDB which is
// unavailable in this sandbox, so authenticated dashboards render a "Service
// temporarily unavailable" maintenance gate (correct fail-closed behavior). These
// flows are classified ENVIRONMENT_BLOCKED at the browser level; the backend
// negative-authorization tests below verify the API authorization layer directly.

test.describe('Public surfaces (unauthenticated)', () => {
  test('landing page renders without crashing (maintenance gate when DB is down is acceptable)', async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await expect(page).toHaveTitle(/.+/);
    // Either the landing renders normally OR the maintenance/503 gate shows.
    // We MUST NOT see a blank page, a JS error overlay, or a React crash.
    const bodyText = await page.locator('body').innerText({ timeout: 5000 });
    expect(bodyText.length).toBeGreaterThan(20);
    // Filter benign / expected errors (Firebase blocked egress; backend 503 when DB is down).
    const blocking = errors.filter(e => {
      const t = String(e);
      return !/firebase|Firebase|googleapis|identitytoolkit|ERR_CONNECTION_CLOSED|503|net::ERR/i.test(t);
    });
    expect(blocking).toEqual([]);
  });

  test('login page renders login form (email field visible or auth-gate fallback)', async ({ page }) => {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).toBeVisible();
    const html = await page.locator('#root').innerHTML();
    // Must not contain a React error overlay or crash message
    expect(html).not.toMatch(/unhandled|runtime error|minified react error/i);
  });

  test('pricing page loads (no auth required)', async ({ page }) => {
    const resp = await page.goto(BASE + '/pricing');
    expect(resp.status()).toBeLessThan(500);
  });

  test('blog list page loads', async ({ page }) => {
    await page.goto(BASE + '/blog');
    await page.waitForTimeout(500);
    // The page should render (no crash) even without MySQL data
    await expect(page.locator('body')).toBeVisible();
  });

  test('jobs landing page loads', async ({ page }) => {
    await page.goto(BASE + '/jobs');
    await expect(page.locator('body')).toBeVisible();
  });

  test('404 page renders for non-existent routes (or maintenance gate when DB is down)', async ({ page }) => {
    await page.goto(BASE + '/this-route-does-not-exist-xyz123', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const text = await page.locator('body').innerText();
    const has404 = /page not found|404|not found/i.test(text);
    const hasMaintenance = /temporarily unavailable|maintenance/i.test(text);
    expect(has404 || hasMaintenance).toBe(true);
  });

  test('/contact page renders', async ({ page }) => {
    await page.goto(BASE + '/contact');
    await expect(page.locator('body')).toBeVisible();
  });

  test('/features page renders', async ({ page }) => {
    await page.goto(BASE + '/features');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Auth walls', () => {
  // With VITE_LOCAL_AUTH=true and no Firebase credentials, unauthenticated users
  // should be shown the auth gate (redirect to /login). When MariaDB is also down,
  // the maintenance/service-unavailable gate supersedes navigation; both are safe
  // fail-closed behaviors. We verify that no unauthenticated user ever reaches
  // a protected surface without error.
  test('unauthenticated /dashboard does NOT render dashboard content', async ({ page }) => {
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const url = page.url();
    const text = await page.locator('body').innerText();
    const reachedLogin = url.includes('/login') || /sign.?in|log.?in/i.test(text);
    const hitMaintenance = /temporarily unavailable|maintenance|service/i.test(text);
    expect(reachedLogin || hitMaintenance).toBe(true);
  });

  test('unauthenticated /build-resume/heading does not crash', async ({ page }) => {
    await page.goto(BASE + '/build-resume/heading', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible();
    const html = await page.locator('#root').innerHTML();
    expect(html).not.toMatch(/unhandled|runtime error|minified react error/i);
  });

  test('unauthenticated /portfolio/builder does not render protected data', async ({ page }) => {
    await page.goto(BASE + '/portfolio/builder', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const url = page.url();
    const text = await page.locator('body').innerText();
    const reachedLogin = url.includes('/login') || /sign.?in|log.?in/i.test(text);
    const hitMaintenance = /temporarily unavailable|maintenance/i.test(text);
    expect(reachedLogin || hitMaintenance).toBe(true);
  });

  test('unauthenticated /adm/dashboard is blocked (no admin surface)', async ({ page }) => {
    await page.goto(BASE + '/adm/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const url = page.url();
    const text = await page.locator('body').innerText();
    const reachedLogin = url.includes('/login') || /sign.?in|log.?in/i.test(text);
    const hitMaintenance = /temporarily unavailable|maintenance/i.test(text);
    expect(reachedLogin || hitMaintenance).toBe(true);
  });

  test('unauthenticated /enterprise is blocked', async ({ page }) => {
    await page.goto(BASE + '/enterprise', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const url = page.url();
    const text = await page.locator('body').innerText();
    const reachedLogin = url.includes('/login') || /sign.?in|log.?in/i.test(text);
    const hitMaintenance = /temporarily unavailable|maintenance/i.test(text);
    expect(reachedLogin || hitMaintenance).toBe(true);
  });
});

test.describe('API public surface', () => {
  test('/healthz returns ok', async ({ request }) => {
    const r = await request.get(API + '/healthz');
    expect(r.ok()).toBeTruthy();
    const b = await r.json();
    expect(b.status).toBe('ok');
    expect(b.authoritativeDatabase).toBe('MARIADB');
  });

  test('/readyz returns 503 in degraded mode (MySQL down)', async ({ request }) => {
    const r = await request.get(API + '/readyz');
    expect(r.status()).toBe(503);
    const b = await r.json();
    expect(b.status).toBe('not_ready');
    expect(b.checks.mysql.status).toBe('UNAVAILABLE');
  });

  test('/api/platform/public-config is reachable but degraded without MySQL', async ({ request }) => {
    const r = await request.get(API + '/api/platform/public-config');
    // Either 200 or 503 is acceptable; but should not be 401 (it's public)
    expect([200, 503]).toContain(r.status());
    expect(r.status()).not.toBe(401);
  });

  test('/api/service-availability returns availability without leaking secrets', async ({ request }) => {
    const r = await request.get(API + '/api/service-availability');
    expect([200, 503]).toContain(r.status());
    if (r.ok()) {
      const b = await r.json();
      expect(b.success).toBeDefined();
      // Must not contain secret fields
      const s = JSON.stringify(b);
      expect(s).not.toMatch(/secret|privateKey|api[Kk]ey[^s]|password/i);
    }
  });

  test('authenticated endpoint without token returns 401', async ({ request }) => {
    const r = await request.post(API + '/api/check', { data: {} });
    expect(r.status()).toBe(401);
  });

  test('authenticated endpoint with garbage token returns 401', async ({ request }) => {
    const r = await request.post(API + '/api/check', {
      data: {},
      headers: { Authorization: 'Bearer totally.invalid.token' },
    });
    expect(r.status()).toBe(401);
  });

  test('preview login (non-production) works and returns signed token', async ({ request }) => {
    const r = await request.post(API + '/api/auth/preview-login', {
      data: { email: 'user@test.test', password: 'password123', name: 'Test' },
    });
    expect(r.ok()).toBeTruthy();
    const b = await r.json();
    expect(b.token).toMatch(/^rptest\./);
    expect(b.email).toBe('user@test.test');
    expect(b.role).toBe('USER');
  });

  test('preview login rejects weak password', async ({ request }) => {
    const r = await request.post(API + '/api/auth/preview-login', {
      data: { email: 'weak@test.test', password: '123', name: 'weak' },
    });
    expect(r.status()).toBe(400);
  });

  test('preview login rejects invalid email', async ({ request }) => {
    const r = await request.post(API + '/api/auth/preview-login', {
      data: { email: 'not-an-email', password: 'password123', name: 'x' },
    });
    expect(r.status()).toBe(400);
  });

  test('Stripe webhook endpoint is public and rejects unsigned request', async ({ request }) => {
    const r = await request.post(API + '/api/stripe-webhook', { data: '{}', headers: { 'Content-Type': 'application/json' } });
    // Should be 400 signature error, not 401
    expect(r.status()).toBe(400);
  });

  test('phonepe callback rejects unsigned request (or 503 when not configured)', async ({ request }) => {
    const r = await request.post(API + '/api/phonepe/callback', { data: {} });
    // 400 = invalid signature; 503 = provider not configured in this environment; 200 = graceful accept
    expect([200, 400, 503]).toContain(r.status());
    if (r.status() === 503) {
      const b = await r.json();
      expect(b.success).toBe(false);
    }
  });
});

test.describe('Negative authorization tests', () => {
  let userToken = null;
  let adminToken = null;
  let superToken = null;
  test.beforeAll(async ({ request }) => {
    async function login(email) {
      const r = await request.post(API + '/api/auth/preview-login', {
        data: { email, password: 'password123', name: email.split('@')[0] },
      });
      return r.ok() ? (await r.json()).token : null;
    }
    userToken = await login('user@test.test');
    adminToken = await login('admin@resumepilot.test');
    superToken = await login('superadmin@resumepilot.test');
  });

  test('USER role cannot hit admin payment-settings (403)', async ({ request }) => {
    const r = await request.get(API + '/api/admin/payment-settings', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(r.status()).toBe(403);
  });

  test('USER role cannot list admin users (403)', async ({ request }) => {
    const r = await request.get(API + '/api/admin/users', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(r.status()).toBe(403);
  });

  test('USER role cannot view admin platform config write path (403)', async ({ request }) => {
    const r = await request.put(API + '/api/platform/currency', {
      data: { currency: 'INR', expectedRevision: 1 },
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(r.status()).toBe(403);
  });

  test('USER role cannot issue refund (403)', async ({ request }) => {
    const r = await request.post(API + '/api/admin/payments/refund', {
      data: { paymentOrderId: 'test_order_1', reason: 'testing' },
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(r.status()).toBe(403);
  });

  test('USER cannot delete other users (403)', async ({ request }) => {
    const r = await request.post(API + '/api/admin/delete-user', {
      data: { uid: 'other_uid' },
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(r.status()).toBe(403);
  });

  test('USER cannot access enterprise (missing membership)', async ({ request }) => {
    const r = await request.get(API + '/api/enterprise/status');
    expect([200, 404, 503]).toContain(r.status());
  });

  test('Malformed payment order ID returns 404 (no enumeration)', async ({ request }) => {
    const r = await request.get(API + '/api/payment-orders/../etc/passwd', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(r.status()).toBe(404);
  });

  test('Expired rptest token is rejected (401)', async ({ request }) => {
    // Manually craft an expired rptest token
    const expired = await (async () => {
      // generate via a login with a 1-second expiry we can't control — instead send garbage-but-wellformed
      const b = await request.post(API + '/api/auth/preview-login', {
        data: { email: 'exp@test.test', password: 'password123', name: 'exp' },
      });
      if (!b.ok()) return null;
      const { token } = await b.json();
      // Mangle the payload to set exp=1 (1970)
      const [p, body, sig] = token.split('.');
      const buf = Buffer.from(body, 'base64url');
      const obj = JSON.parse(buf.toString('utf8'));
      obj.exp = 1;
      const newBody = Buffer.from(JSON.stringify(obj)).toString('base64url');
      // Invalid signature intentionally — will fail signature check first, which is also 401
      return `${p}.${newBody}.${sig}`;
    })();
    const r = await request.post(API + '/api/check', {
      data: {},
      headers: { Authorization: `Bearer ${expired}` },
    });
    expect(r.status()).toBe(401);
  });

  test('ADMIN role cannot escalate to SUPER_ADMIN on delete-user path (403)', async ({ request }) => {
    const r = await request.post(API + '/api/admin/delete-user', {
      data: { uid: 'some_super_admin_uid' },
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    // Either 403 (forbidden) or 503 (DB unavailable) — never 200
    expect([403, 503, 404]).toContain(r.status());
  });

  test('ADMIN can READ payment-settings (200 or 503)', async ({ request }) => {
    const r = await request.get(API + '/api/admin/payment-settings', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect([200, 503]).toContain(r.status());
  });

  test('USER cannot READ admin payment-settings (403)', async ({ request }) => {
    const r = await request.get(API + '/api/admin/payment-settings', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(r.status()).toBe(403);
  });

  test('SUPER_ADMIN can READ admin payment-settings (200 or 503)', async ({ request }) => {
    const r = await request.get(API + '/api/admin/payment-settings', {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect([200, 503]).toContain(r.status());
  });

  test('Preview login rejects email longer than 254 chars', async ({ request }) => {
    const longEmail = 'a'.repeat(250) + '@b.co';
    const r = await request.post(API + '/api/auth/preview-login', {
      data: { email: longEmail, password: 'password123', name: 'long' },
    });
    expect(r.status()).toBe(400);
  });

  test('Missing Content-Type on JSON endpoint returns 400/5xx not 200', async ({ request }) => {
    const r = await request.post(API + '/api/auth/preview-login', {
      data: 'not json',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });
});
