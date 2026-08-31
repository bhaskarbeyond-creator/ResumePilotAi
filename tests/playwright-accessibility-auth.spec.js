/**
 * Wave 11 accessibility run — uses API token planting (no form-fill login).
 * Mirrors tests/playwright-role-routes-matrix.spec.js plantSession logic.
 */
import { test, expect, request } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const API = process.env.PLAYWRIGHT_API_URL || 'http://localhost:8080';
const LOCAL_SESSION_KEY = 'resumepilot_local_session_v1';

async function plantSession(page, email, password = 'password123') {
  const api = await request.newContext();
  const resp = await api.post(`${API}/api/auth/preview-login`, {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ email, password }),
  });
  expect(resp.ok(), `preview-login for ${email} must succeed (status ${resp.status()})`).toBeTruthy();
  const data = await resp.json();
  expect(data.token, 'preview-login must return a token').toBeTruthy();
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
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

const PAGES = [
  // Unauthenticated
  { name: 'landing', path: '/', email: null },
  { name: 'login', path: '/login', email: null },
  { name: 'pricing', path: '/pricing', email: null },
  { name: 'contact', path: '/contact', email: null },
  { name: 'features', path: '/features', email: null },
  { name: '404', path: '/this-does-not-exist-xyz', email: null },
  // Authenticated USER
  { name: 'user-dashboard', path: '/dashboard', email: 'user@test.test' },
  { name: 'profile', path: '/profile', email: 'user@test.test' },
];

for (const { name, path, email } of PAGES) {
  test(`a11y: ${name}`, async ({ page }) => {
    if (email) await plantSession(page, email);
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .disableRules(['color-contrast'])
      .analyze();
    const serious = results.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    if (results.violations.length) {
      console.log(`\n[${name}] ${results.violations.length} violations:`);
      for (const v of results.violations) {
        const targets = v.nodes.slice(0,3).map(n => n.target.join(' ')).join('; ');
        console.log(`  [${v.impact}] ${v.id} — ${v.help} (nodes: ${v.nodes.length}) e.g. ${targets}`);
      }
    }
    console.log(`[${name}] serious=${serious.length}, other=${results.violations.length - serious.length}, passes=${results.passes.length}`);
    expect(results.passes.length).toBeGreaterThan(0);
  });
}
