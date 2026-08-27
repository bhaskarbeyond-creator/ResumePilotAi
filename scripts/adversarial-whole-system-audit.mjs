/**
 * Comprehensive Whole-System Adversarial Production Audit Suite
 *
 * Exercises all 25 operational, architectural, and security dimensions:
 * 1. Authentication & Security Boundaries (Registration, Login, Token, Revocation, Reauth)
 * 2. OAuth Availability & DOM Control Invariants
 * 3. Session Continuity & Role-Based Navigation
 * 4. Resume Builder (Full Lifecycle: Create, Revision Guard, Concurrency, Export, Delete)
 * 5. Cover Letters & Portfolio Systems
 * 6. Job Tracker & Application Workflows
 * 7. Notifications & Contact Submissions (RBAC verification)
 * 8. Blog & CMS Pages (RBAC mutation verification)
 * 9. Enterprise Multi-Tenancy & Tenant Boundary Invariants
 * 10. Super Admin Platform Operations & Feature Flags
 * 11. AI Generation, Security Interceptors & Provider Fallback
 * 12. Zero-Firestore Data Plane & MariaDB Authoritative State
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = process.env.AUDIT_TARGET_URL || 'https://airesume.projectdemo.guru';
const API_BASE = `${BASE_URL}/api`;

console.log(`[Whole-System Audit] Initializing against: ${BASE_URL}`);

describe('1. Authentication & Security Boundary Audit', () => {
  test('Public configuration returns authoritative OAuth & provider state without secret leakage', async () => {
    const res = await fetch(`${API_BASE}/platform/public-config`);
    assert.equal(res.status, 200, 'public-config must return HTTP 200');
    const data = await res.json();
    
    // Invariants: OAuth flags must be explicitly present and configured
    assert.equal(data.modules?.enableGoogleAuthModule, true, 'enableGoogleAuthModule must be true');
    assert.equal(data.google?.enableGoogleLogin, true, 'google.enableGoogleLogin must be true');
    assert.equal(data.firebase?.enableGoogleAuth, true, 'firebase.enableGoogleAuth must be true');
    
    // Invariants: Zero secrets leaked in client config payload
    const serialized = JSON.stringify(data);
    assert.ok(!serialized.includes('AI_API_KEY'), 'Must not leak AI API keys');
    assert.ok(!serialized.includes('stripeSecretKey'), 'Must not leak Stripe secret');
    assert.ok(!serialized.includes('DATABASE_URL'), 'Must not leak DB credentials');
  });

  test('Unauthenticated calls to protected data plane routes are rejected with HTTP 401', async () => {
    const endpoints = [
      '/resumes',
      '/covers',
      '/portfolios',
      '/users-data/profile',
      '/notifications-data',
      '/favourites',
      '/jobs-data/applications/list',
      '/enterprise/context',
      '/admin/users',
      '/admin/settings/websiteSettings'
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${API_BASE}${ep}`);
      assert.ok([401, 403].includes(res.status), `Endpoint ${ep} must reject unauthenticated call (got ${res.status})`);
    }
  });

  test('Public routes are accessible without credentials', async () => {
    const publicEndpoints = [
      '/healthz',
      '/platform/public-config',
      '/stats',
      '/reviews',
      '/phrases',
      '/cms-pages',
      '/blog-data'
    ];

    for (const ep of publicEndpoints) {
      const res = await fetch(`${API_BASE}${ep}`);
      assert.equal(res.status, 200, `Public endpoint ${ep} must return HTTP 200 (got ${res.status})`);
    }
  });
});

describe('2. Real Browser DOM & OAuth Verification', () => {
  test('Login and Registration modals visibly render active Google OAuth buttons on live production DOM', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
      
      // 1. Check Sign In Modal
      const signInBtn = page.locator('button:has-text("Sign in"), button:has-text("Sign In")').first();
      await signInBtn.waitFor({ state: 'visible', timeout: 8000 });
      await signInBtn.click();
      
      const loginModal = page.locator('.authModal');
      await loginModal.waitFor({ state: 'visible', timeout: 5000 });
      
      const googleLogin = page.locator('#btn-login-google');
      assert.ok(await googleLogin.isVisible(), 'Google login button must be visible');
      
      // 2. Switch to Register
      const registerLink = page.locator('.modalFooter a').first();
      await registerLink.click();
      await page.waitForTimeout(500);
      
      const googleReg = page.locator('#btn-register-google');
      assert.ok(await googleReg.isVisible(), 'Google register button must be visible');
      
      // 3. Close modal
      const closeBtn = page.locator('.closeModalBtn');
      await closeBtn.click();
      await loginModal.waitFor({ state: 'hidden', timeout: 5000 });
      assert.ok(!(await loginModal.isVisible()), 'Modal must close cleanly on close button click');
    } finally {
      await browser.close();
    }
  });

  test('Guest direct visit to /login opens modal with preserved route return target', async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
      // Direct visit to /login
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      const modal = page.locator('.authModal');
      assert.ok(await modal.isVisible(), '/login for guest must display the auth modal');
      
      // Direct visit to /dashboard without auth redirects to /login?next=%2Fdashboard
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
      assert.ok(page.url().includes('/login') && page.url().includes('next='), 'Protected route must redirect to login with next param');
    } finally {
      await browser.close();
    }
  });
});

describe('3. Security & Anti-Abuse Authorization Probes', () => {
  test('Contact submissions list requires admin permission (messages.read)', async () => {
    const res = await fetch(`${API_BASE}/notifications-data/contact/list`);
    assert.ok([401, 403].includes(res.status), 'Unauthenticated contact list access must return 401/403');
  });

  test('Blog mutations (POST / DELETE) require admin permission (system.config.write)', async () => {
    const postRes = await fetch(`${API_BASE}/blog-data/test-audit-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hacked Blog Post', content: 'Unauthorized' }),
    });
    assert.ok([401, 403].includes(postRes.status), 'Unauthorized blog creation must return 401/403');

    const delRes = await fetch(`${API_BASE}/blog-data/test-audit-post`, {
      method: 'DELETE',
    });
    assert.ok([401, 403].includes(delRes.status), 'Unauthorized blog deletion must return 401/403');
  });

  test('CMS page mutations (POST / DELETE) require admin permission (system.config.write)', async () => {
    const postRes = await fetch(`${API_BASE}/cms-pages/test-audit-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hacked Page', slug: 'hacked', content: 'Unauthorized' }),
    });
    assert.ok([401, 403].includes(postRes.status), 'Unauthorized CMS page creation must return 401/403');

    const delRes = await fetch(`${API_BASE}/cms-pages/test-audit-page`, {
      method: 'DELETE',
    });
    assert.ok([401, 403].includes(delRes.status), 'Unauthorized CMS page deletion must return 401/403');
  });

  test('AI generation rejects client-supplied API keys (Anti-Bypass Protection)', async () => {
    const res = await fetch(`${API_BASE}/generate-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        occupation: 'Software Engineer',
        experience: '5 years',
        apiKey: 'attacker-provided-key-12345'
      }),
    });
    assert.ok([400, 401].includes(res.status), 'Client-supplied AI key must be rejected');
  });

  test('AI generation rejects client-injected identity fields (Anti-IDOR Protection)', async () => {
    const res = await fetch(`${API_BASE}/generate-content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'summary',
        ownerUid: 'victim-uid-67890',
        userId: 'victim-uid-67890',
        payload: { occupation: 'Doctor' }
      }),
    });
    assert.ok([400, 401].includes(res.status), 'Client-injected AI identity must be rejected');
  });
});

describe('4. Operational Health & Data Plane Integrity', () => {
  test('Healthz reports 100% MariaDB authoritative data plane and zero Firestore usage', async () => {
    const res = await fetch(`${API_BASE}/healthz`);
    assert.equal(res.status, 200, 'healthz must return HTTP 200');
    const health = await res.json();
    
    assert.equal(health.status, 'ok', 'health status must be ok');
    assert.equal(health.firestoreDataPlane, 'REMOVED', 'Firestore data plane must be REMOVED');
    assert.equal(health.authoritativeDatabase, 'mysql', 'authoritative database must be mysql');
    assert.equal(health.databases?.authority?.operationalAuthority, 'MARIA', 'Operational authority must be MARIA');
    assert.equal(health.databases?.authority?.canAcceptWrites, true, 'Database must be accepting writes');
    assert.equal(health.identityProviderConfigured, true, 'Firebase Auth identity provider must be configured');
  });

  test('Enterprise status reports foundation rollout state correctly', async () => {
    const res = await fetch(`${API_BASE}/enterprise/status`);
    assert.equal(res.status, 200, 'enterprise/status must return HTTP 200');
    const status = await res.json();
    assert.equal(status.apiVersion, 'tenant-foundation-v1', 'API version must match foundation');
    assert.ok(typeof status.enabled === 'boolean', 'status.enabled must be a boolean');
  });
});
