/**
 * Reusable Real-Browser Test Harness
 * 
 * Provides: Vite dev server, Playwright Chromium launch, Firebase auth seeding,
 * API route intercepts, role-based session management, evidence collection,
 * and check/assert infrastructure for real DOM interactions.
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { rejectFirebaseDataPlaneRequests } from './firebase-data-plane-guard.mjs';
import fs from 'node:fs';
import path from 'node:path';

// ── Firebase API key discovery ──
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
export const API_KEY = process.env.VITE_FIREBASE_KEY || readEnvKey();

// ── Mock JWT generator ──
export function makeMockJwt(overrides = {}) {
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
    email: 'test@example.com',
    email_verified: true,
    firebase: { identities: { email: ['test@example.com'] }, sign_in_provider: 'password' },
    ...overrides,
  })).toString('base64url');
  return `${header}.${claims}.mock_signature`;
}

// ── Role definitions ──
export const ROLES = {
  ANONYMOUS: { uid: null, email: null, claims: {} },
  USER: { uid: 'test-user', email: 'user@test.com', claims: {} },
  ADMIN: { uid: 'test-admin', email: 'admin@test.com', claims: { admin: true } },
  SUPER_ADMIN: { uid: 'test-superadmin', email: 'superadmin@test.com', claims: { admin: true, superAdmin: true } },
  ENTERPRISE_ADMIN: { uid: 'ent-admin', email: 'entadmin@test.com', claims: { enterpriseAdmin: true } },
  ENTERPRISE_MEMBER: { uid: 'ent-member', email: 'entmember@test.com', claims: { enterpriseMember: true } },
  EMPLOYER: { uid: 'test-employer', email: 'employer@test.com', claims: { employer: true } },
  AUDITOR: { uid: 'test-auditor', email: 'auditor@test.com', claims: { auditor: true, readOnly: true } },
};

// ── Evidence collector ──
export class EvidenceCollector {
  constructor() {
    this.records = [];
    this.startTime = Date.now();
    this.metrics = { clicks: 0, fills: 0, selects: 0, checks: 0, navigations: 0, assertions: 0, reloads: 0 };
  }

  record(controlId, data) {
    this.records.push({
      controlId,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  click() { this.metrics.clicks++; }
  fill() { this.metrics.fills++; }
  select() { this.metrics.selects++; }
  check() { this.metrics.checks++; }
  navigate() { this.metrics.navigations++; }
  assert() { this.metrics.assertions++; }
  reload() { this.metrics.reloads++; }

  summary() {
    return {
      totalRecords: this.records.length,
      passed: this.records.filter(r => r.result === 'PASS').length,
      failed: this.records.filter(r => r.result === 'FAIL').length,
      duration: Date.now() - this.startTime,
      metrics: { ...this.metrics },
    };
  }

  save(filepath) {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify({ records: this.records, summary: this.summary() }, null, 2));
  }
}

// ── Vite dev server launcher ──
export async function createViteServer(extraDefines = {}) {
  const vite = await createServer({
    server: { port: 0, host: '127.0.0.1', strictPort: false },
    logLevel: 'error',
    define: {
      'import.meta.env.VITE_ENTERPRISE_TENANCY_ENABLED': JSON.stringify('true'),
      'import.meta.env.VITE_FIREBASE_KEY': JSON.stringify(API_KEY),
      'import.meta.env.VITE_FIREBASE_DOMAIN': JSON.stringify('fixture.firebaseapp.com'),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('fixture-project'),
      'import.meta.env.VITE_FIREBASE_SENDER_ID': JSON.stringify('000000000000'),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify('1:000000000000:web:fixture'),
      ...extraDefines,
    },
  });
  const server = await vite.listen();
  const port = server.config.server.port;
  return { vite, server, base: `http://127.0.0.1:${port}`, port };
}

// ── Browser launcher ──
export async function launchBrowser() {
  return chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'],
  });
}

// ── Firebase auth session seeding ──
export function getAuthInitScript(role) {
  const r = ROLES[role] || ROLES.USER;
  if (!r.uid) return null; // ANONYMOUS
  const token = makeMockJwt({ user_id: r.uid, sub: r.uid, email: r.email, ...r.claims });
  return {
    fn: ({ key, apiKey, token, uid, email, displayName }) => {
      const userObj = {
        uid, email, emailVerified: true, displayName,
        isAnonymous: false,
        stsTokenManager: { apiKey, refreshToken: 'fixture-refresh', accessToken: token, expirationTime: Date.now() + 3600000 },
        createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
        apiKey, appName: '[DEFAULT]',
      };
      const payload = JSON.stringify(userObj);
      localStorage.setItem(key, payload);
      localStorage.setItem(`firebase:authUser:demo-browser-api-key:[DEFAULT]`, payload);
      if (apiKey) localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, payload);
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
          store.put({ fbase_key: key, value: userObj });
        };
      } catch {}
    },
    args: {
      key: `firebase:authUser:${API_KEY}:[DEFAULT]`,
      apiKey: API_KEY,
      token,
      uid: r.uid,
      email: r.email,
      displayName: role,
    },
  };
}

// ── Standard Firebase/Firestore route intercepts ──
export async function setupFirebaseIntercepts(page) {
  const token = makeMockJwt();
  await page.route('**/securetoken.googleapis.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ access_token: token, expires_in: '3600', token_type: 'Bearer', refresh_token: 'fixture-refresh', id_token: token, user_id: 'test-user', project_id: 'fixture-project' }),
  }));
  await page.route('**/identitytoolkit.googleapis.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ users: [{ localId: 'test-user', email: 'test@example.com', emailVerified: true, displayName: 'Test User', providerUserInfo: [] }] }),
  }));
  await rejectFirebaseDataPlaneRequests(page);
  await page.route('**/googleapis.com/identitytoolkit/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/www.google-analytics.com/**', route => route.abort());
  await page.route('**/www.googletagmanager.com/**', route => route.abort());
  await page.route('**/maps.googleapis.com/**', route => route.abort());
}

// ── Page factory with role setup ──
export async function createAuthenticatedPage(browser, role, _viteBase) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const authScript = getAuthInitScript(role);
  if (authScript) {
    await page.addInitScript(authScript.fn, authScript.args);
  }
  await setupFirebaseIntercepts(page);
  return page;
}
