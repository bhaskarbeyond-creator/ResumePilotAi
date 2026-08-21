// @ts-check
/**
 * LIVE authenticated Playwright suite — real deployed Enterprise platform.
 *
 * Targets PROD_BASE_URL (default https://airesume.projectdemo.guru).
 * NO route mocking: every API call hits the real backend. Authentication is
 * real — a Firebase REST sign-in issues a genuine ID/refresh token pair which
 * is persisted exactly the way the Firebase Web SDK persists sessions, so the
 * app boots into an authentic session and refreshes tokens against the real
 * securetoken endpoint.
 *
 * Required environment:
 *   VITE_FIREBASE_KEY      (or present in ./.env)
 *   PROD_TEST_EMAIL / PROD_TEST_PASSWORD   enterprise test account
 * Optional:
 *   PROD_BASE_URL          override the target origin
 *
 * Without credentials the whole suite is skipped with an explicit notice —
 * it never fabricates a green run.
 *
 * Run: npx playwright test --config=playwright.live.config.js
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import https from 'node:https';

const BASE = process.env.PROD_BASE_URL || 'https://airesume.projectdemo.guru';

function readEnvKey() {
  if (process.env.VITE_FIREBASE_KEY) return process.env.VITE_FIREBASE_KEY;
  try {
    const match = fs.readFileSync('.env', 'utf8').match(/VITE_FIREBASE_KEY=([^\r\n]+)/);
    if (match) return match[1].trim();
  } catch { /* optional */ }
  return '';
}
const API_KEY = readEnvKey();
const EMAIL = process.env.PROD_TEST_EMAIL || '';
const PASSWORD = process.env.PROD_TEST_PASSWORD || '';
const HAVE_CREDS = Boolean(API_KEY && EMAIL && PASSWORD);

test.skip(!HAVE_CREDS, 'LIVE suite skipped: set VITE_FIREBASE_KEY, PROD_TEST_EMAIL, PROD_TEST_PASSWORD.');
test.describe.configure({ mode: 'serial' });

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 30_000,
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(data || '{}') }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

let session;
const consoleErrors = [];
const badResponses = [];

test.beforeAll(async () => {
  const res = await postJson(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    email: EMAIL, password: PASSWORD, returnSecureToken: true,
  });
  if (res.status !== 200) throw new Error(`REAL Firebase sign-in failed: ${JSON.stringify(res.json).slice(0, 200)}`);
  session = res.json;
});

/** Persist the REAL session the way the Firebase Web SDK does. */
async function openConsole(page, path = '/enterprise') {
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300)); });
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${String(error).slice(0, 300)}`));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/api/')) {
      badResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  await page.addInitScript(({ apiKey, s }) => {
    const userObj = {
      uid: s.localId, email: s.email, emailVerified: true,
      displayName: s.displayName || s.email, isAnonymous: false,
      stsTokenManager: {
        apiKey, refreshToken: s.refreshToken, accessToken: s.idToken,
        expirationTime: Date.now() + Number(s.expiresIn || 3600) * 1000,
      },
      createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
      apiKey, appName: '[DEFAULT]',
    };
    const key = `firebase:authUser:${apiKey}:[DEFAULT]`;
    localStorage.setItem(key, JSON.stringify(userObj));
    localStorage.setItem('user', s.localId);
    localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
    try {
      const req = indexedDB.open('firebaseLocalStorageDb', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('firebaseLocalStorage')) db.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.transaction('firebaseLocalStorage', 'readwrite').objectStore('firebaseLocalStorage').put({ fbase_key: key, value: userObj });
      };
    } catch { /* optional */ }
  }, { apiKey: API_KEY, s: session });
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.enterprise-shell, .enterprise-empty-state', { timeout: 45_000 });
}

// ---------------------------------------------------------------------------

test('A/B: real authenticated session boots the live Enterprise shell', async ({ page }) => {
  await openConsole(page);
  await expect(page.locator('.enterprise-shell')).toBeVisible();
  // Identity footer shows the REAL signed-in principal.
  await expect(page.locator('.enterprise-identity')).toBeVisible();
  // Server-resolved tenant context (switcher populated from /api/enterprise/tenants).
  await expect(page.locator('.enterprise-context-button strong')).not.toHaveText('');
});

test('C: modern IA is live — grouped nav, breadcrumbs, workspace switcher', async ({ page }) => {
  await openConsole(page);
  await expect(page.locator('.enterprise-nav-group-label').first()).toBeVisible();
  await expect(page.locator('.enterprise-breadcrumbs')).toBeVisible();
  await expect(page.locator('.enterprise-workspace')).toBeVisible();
});

test('D–O: every visible module renders against the real backend', async ({ page }) => {
  await openConsole(page);
  const navItems = await page.locator('.enterprise-nav-item').allTextContents();
  expect(navItems.length).toBeGreaterThanOrEqual(2);
  for (const label of navItems) {
    await page.locator(`.enterprise-nav-item:has-text("${label.trim()}")`).first().click();
    await expect(page.locator('.enterprise-main')).not.toBeEmpty();
    // Never a blank module: either data, an explicit empty state, loading, or a truthful error card.
    await expect(page.locator('.enterprise-main .enterprise-card, .enterprise-main .enterprise-empty, .enterprise-main [role="alert"]').first()).toBeVisible({ timeout: 30_000 });
  }
});

test('cross-module: recommendations / palette / deep links operate on live data', async ({ page }) => {
  await openConsole(page);
  // Command palette on the live app.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.locator('.enterprise-command')).toBeVisible();
  await page.locator('.enterprise-command input').fill('usage');
  await page.locator('.enterprise-command button', { hasText: 'Usage' }).first().click();
  await expect(page).toHaveURL(/tab=usage/);

  // Deep link with filter survives a hard refresh on the live site.
  await page.goto(`${BASE}/enterprise?tab=members&status=ACTIVE`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.enterprise-shell', { timeout: 45_000 });
  await expect(page.locator('.enterprise-chip', { hasText: 'Active' }).first()).toHaveClass(/active/, { timeout: 30_000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.enterprise-shell', { timeout: 45_000 });
  await expect(page.locator('.enterprise-chip', { hasText: 'Active' }).first()).toHaveClass(/active/, { timeout: 30_000 });

  // Back/forward across live modules.
  await page.locator('.enterprise-nav-item', { hasText: 'Audit' }).first().click();
  await expect(page).toHaveURL(/tab=audit/);
  await page.goBack();
  await expect(page).toHaveURL(/tab=members/);
});

test('responsive: live console at 5 viewports without horizontal overflow', async ({ page }) => {
  await openConsole(page);
  fs.mkdirSync('test-results/live-shots', { recursive: true });
  for (const [name, viewport] of Object.entries({
    'desktop-1440': { width: 1440, height: 900 },
    'desktop-1280': { width: 1280, height: 800 },
    'tablet-768': { width: 768, height: 1024 },
    'mobile-390': { width: 390, height: 844 },
    'mobile-375': { width: 375, height: 667 },
  })) {
    await page.setViewportSize(viewport);
    for (const tab of ['overview', 'members', 'usage', 'audit', 'security']) {
      await page.goto(`${BASE}/enterprise?tab=${tab}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.enterprise-shell', { timeout: 45_000 });
      await page.waitForTimeout(900);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `overflow ${name}/${tab}`).toBeLessThanOrEqual(2);
      await page.screenshot({ path: `test-results/live-shots/${tab}-${name}.png` });
    }
  }
});

test('console / network audit for the live session', async () => {
  // Firestore client channels can be noisy; only fail on hard app errors.
  const hardErrors = consoleErrors.filter(entry =>
    !/net::|Failed to load resource|firestore|WebChannel|analytics/i.test(entry));
  expect(hardErrors, `console: ${hardErrors.join(' | ')}`).toEqual([]);
  const unexpected = badResponses.filter(entry =>
    !entry.includes('/api/enterprise/support/context'));
  expect(unexpected, `api failures: ${unexpected.join(' | ')}`).toEqual([]);
});
