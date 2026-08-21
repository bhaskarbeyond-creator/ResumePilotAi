// @ts-check
/**
 * AUTHENTICATED Playwright suite against the REAL backend.
 *
 * Unlike tests/enterprise-e2e.spec.js (which serves /api/enterprise/** from an
 * in-memory mock), this suite proxies every /api/** call to the actual Express
 * application (backend/index.js) running with the real enterprise middleware
 * chain, control plane, RBAC, M2M authentication and Firestore-shaped data
 * plane. Authentication is real end-to-end: a seeded Firebase-style session
 * produces a bearer token that the backend's middleware verifies.
 *
 * Evidence captured:
 *  - all 14 enterprise modules render from live backend data
 *  - resume CRUD through the UI persists in the real data plane
 *  - a service account created in the Security UI authenticates over x-api-key
 *    (M2M first-class), rotates, and revokes — each verified with real HTTP
 *  - a support grant created in the Support UI authorizes a real support
 *    session and stops authorizing once revoked
 *  - deep links, refresh, back/forward, command palette
 *  - responsive layouts at 7 breakpoints with screenshots
 */
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installAuthenticatedSession, viteFixtureDefines, makeMockJwt } from './helpers/enterprise-fixture.mjs';

const require = createRequire(import.meta.url);
const { startLiveEnterpriseBackend } = require('./helpers/enterprise-live-backend.cjs');

test.describe.configure({ mode: 'serial' });

const SHOTS = path.join('scratch', 'live-backend-audit');
const MODULES = ['overview', 'resumes', 'members', 'teams', 'workspaces', 'access', 'ai', 'security', 'usage', 'email', 'audit', 'support', 'settings', 'platform'];

/** @type {ReturnType<typeof startLiveEnterpriseBackend> extends Promise<infer T> ? T : never} */
let backend;
let vite;
let base = '';

test.beforeAll(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  backend = await startLiveEnterpriseBackend();
  vite = await createServer({
    server: {
      port: 0,
      host: '127.0.0.1',
      strictPort: false,
      proxy: { '/api': { target: backend.base, changeOrigin: true } },
    },
    logLevel: 'error',
    define: viteFixtureDefines(),
  });
  const server = await vite.listen();
  base = `http://127.0.0.1:${server.config.server.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  await backend?.close?.();
});

async function bootConsole(page, { tab = 'overview', uid = 'browser-owner', email = 'owner@northwind.example' } = {}) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await installAuthenticatedSession(page, { uid, email });
  await page.goto(`${base}/enterprise?tab=${tab}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });
  return pageErrors;
}

/** Node-side API call against the real backend with a fixture identity. */
async function api(method, apiPath, { uid = 'browser-owner', email = 'owner@northwind.example', headers = {}, body = null } = {}) {
  const token = makeMockJwt({ user_id: uid, sub: uid, email });
  const response = await fetch(`${backend.base}${apiPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, body: json, headers: response.headers };
}

// ---------------------------------------------------------------------------
// 1. Shell boots from live data
// ---------------------------------------------------------------------------

test('console boots with a real tenant resolved by the live backend', async ({ page }) => {
  const pageErrors = await bootConsole(page);
  await expect(page.locator('.enterprise-nav-item')).toHaveCount(14);
  await expect(page.locator('.enterprise-tab-content').first()).toBeVisible();
  // The overview must not surface a data failure against the real backend.
  await expect(page.locator('[role="alert"]:has-text("Data unavailable")')).toHaveCount(0);
  await page.screenshot({ path: path.join(SHOTS, '01-overview-desktop.png'), fullPage: true });
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. All modules render from live backend data
// ---------------------------------------------------------------------------

test('every enterprise module renders live data without data-plane failures', async ({ page }) => {
  const pageErrors = await bootConsole(page);
  for (const module of MODULES) {
    await page.goto(`${base}/enterprise?tab=${module}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.enterprise-tab-content', { timeout: 30_000 });
    // Allow the async modules to settle before asserting no failure state.
    await page.waitForTimeout(700);
    await expect(page.locator('[role="alert"]:has-text("Data unavailable")'), `module ${module} surfaced a data failure`).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, `module-${module}.png`), fullPage: true });
  }
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. Resume CRUD against the real data plane
// ---------------------------------------------------------------------------

test('resume lifecycle: seed via human API, duplicate and delete through the UI', async ({ page }) => {
  const context = await api('GET', '/api/enterprise/context');
  expect(context.status).toBe(200);
  const tenantHeader = { 'X-Tenant-Id': context.body.context.tenantId, 'X-Workspace-Id': context.body.workspace.id };

  const seeded = await api('POST', '/api/enterprise/resources', {
    headers: tenantHeader,
    body: { resourceType: 'resume', payload: { title: 'Audit Seed Candidate', candidate: { name: 'Audit Seed Candidate', jobTitle: 'Platform Engineer' } } },
  });
  expect(seeded.status).toBe(201);

  const pageErrors = await bootConsole(page, { tab: 'resumes' });
  await expect(page.getByText('Audit Seed Candidate').first()).toBeVisible({ timeout: 15_000 });

  // Resumes are grouped by candidate and collapsed; expand to reveal the
  // per-version actions (duplicate/delete).
  const expandAll = page.locator('button[title="Expand all candidate versions"], button[title="Expand all candidate resumes"]').first();
  if (await expandAll.count()) await expandAll.click();
  else await page.locator('strong[title="Click to expand candidate resume versions"]').first().click();
  await page.waitForTimeout(400);

  // Duplicate through the UI (this is a real POST /api/enterprise/resources).
  await page.locator('button[title="Duplicate Resume"]').first().click();
  await expect(page.getByText('(Copy)').first()).toBeVisible({ timeout: 15_000 });

  const afterDuplicate = await api('GET', '/api/enterprise/resources', { headers: tenantHeader });
  expect(afterDuplicate.body.resources.length).toBeGreaterThanOrEqual(2);

  // The duplicate merges into the same candidate group (same owner); versions
  // sort latest-first, so the copy is the newest version. Collapse everything,
  // expand the "(Copy)" group, and delete the first (latest) version — the copy.
  const collapseAll = page.locator('button[title="Collapse all candidate resumes"]').first();
  if (await collapseAll.count()) {
    await collapseAll.click();
    await page.waitForTimeout(300);
  }
  await page.locator('tr', { hasText: '(Copy)' }).locator('button:has-text("Version")').first().click();
  await page.waitForTimeout(500);
  await page.locator('button[title="Delete Resume"]').first().click();
  const confirmButton = page.locator('.enterprise-modal button:has-text("Remove Resume"), .enterprise-modal button.enterprise-button-danger').first();
  await confirmButton.click();
  await expect(page.getByText('(Copy)')).toHaveCount(0, { timeout: 15_000 });

  const afterDelete = await api('GET', '/api/enterprise/resources', { headers: tenantHeader });
  expect(afterDelete.body.resources.some(resource => String(resource.payload?.title || '').includes('(Copy)'))).toBe(false);
  await page.screenshot({ path: path.join(SHOTS, '03-resumes-crud.png'), fullPage: true });
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

// ---------------------------------------------------------------------------
// 4. M2M golden path: key created in the UI works over x-api-key
// ---------------------------------------------------------------------------

let m2mKeys = { first: '', rotated: '', accountId: '' };

test('service account created in the Security UI authenticates real M2M requests', async ({ page }) => {
  const pageErrors = await bootConsole(page, { tab: 'security' });
  const context = await api('GET', '/api/enterprise/context');
  const tenantId = context.body.context.tenantId;

  await page.getByRole('button', { name: /Create Service Account/ }).click();
  await page.locator('#sa-name').fill('Playwright M2M Probe');
  // Pick data-plane + audit scopes (resource.read is selected by default).
  await page.locator('.enterprise-checkbox:has-text("resource.create") input').first().check();
  await page.locator('.enterprise-checkbox:has-text("tenant.audit.read") input').first().check();
  await page.getByRole('button', { name: /Create & Reveal Key/ }).click();

  // One-time reveal panel.
  const reveal = page.locator('.enterprise-card:has-text("API Key Generated")');
  await expect(reveal).toBeVisible({ timeout: 15_000 });
  const key = (await reveal.locator('code').first().textContent()).trim();
  expect(key).toMatch(/^rpa_/);
  m2mKeys.first = key;

  // The key authenticates against the real M2M boundary.
  const m2mContext = await fetch(`${backend.base}/api/enterprise/m2m/context`, { headers: { 'x-api-key': key } });
  expect(m2mContext.status).toBe(200);
  const m2mBody = await m2mContext.json();
  expect(m2mBody.actor.type).toBe('service');
  expect(m2mBody.context.tenantId).toBe(tenantId);
  m2mKeys.accountId = m2mBody.actor.id;

  // Operational read with the key.
  const resources = await fetch(`${backend.base}/api/enterprise/resources`, { headers: { 'x-api-key': key } });
  expect(resources.status).toBe(200);

  // Operational WRITE with the key: must succeed and be attributable to the
  // service principal in the tenant audit trail.
  const m2mWrite = await fetch(`${backend.base}/api/enterprise/resources`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ resourceType: 'resume', payload: { title: 'M2M-authored resource', source: 'playwright-live-audit' } }),
  });
  expect(m2mWrite.status).toBe(201);

  // Control plane stays closed to the key even though it works elsewhere.
  const controlPlane = await fetch(`${backend.base}/api/enterprise/memberships`, { headers: { 'x-api-key': key } });
  expect(controlPlane.status).toBe(403);

  // Invalid key is rejected.
  const invalid = await fetch(`${backend.base}/api/enterprise/resources`, { headers: { 'x-api-key': 'rpa_not-a-real-key' } });
  expect(invalid.status).toBe(401);

  await page.screenshot({ path: path.join(SHOTS, '04-m2m-key-revealed.png'), fullPage: true });
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

test('rotating the key in the UI kills the old key immediately', async ({ page }) => {
  const pageErrors = await bootConsole(page, { tab: 'security' });
  const row = page.locator('tr', { hasText: 'Playwright M2M Probe' }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.locator('button[title*="Rotate"]').click();
  await page.locator('.enterprise-modal button:has-text("Rotate & Generate New Key")').click();

  const reveal = page.locator('.enterprise-card:has-text("API Key Generated")');
  await expect(reveal).toBeVisible({ timeout: 15_000 });
  const rotated = (await reveal.locator('code').first().textContent()).trim();
  expect(rotated).toMatch(/^rpa_/);
  expect(rotated).not.toBe(m2mKeys.first);
  m2mKeys.rotated = rotated;

  const oldDead = await fetch(`${backend.base}/api/enterprise/m2m/context`, { headers: { 'x-api-key': m2mKeys.first } });
  expect(oldDead.status).toBe(401);
  const newAlive = await fetch(`${backend.base}/api/enterprise/m2m/context`, { headers: { 'x-api-key': rotated } });
  expect(newAlive.status).toBe(200);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

test('revoking the key in the UI stops authentication immediately and audits it', async ({ page }) => {
  // Register the list-response wait BEFORE navigation so the initial fetch can
  // never complete unobserved.
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await installAuthenticatedSession(page);
  const listLoaded = page.waitForResponse(response => response.url().includes('/api/enterprise/service-accounts') && response.status() === 200, { timeout: 30_000 });
  await page.goto(`${base}/enterprise?tab=security`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });
  await listLoaded;
  const context = await api('GET', '/api/enterprise/context');
  const tenantHeader = { 'X-Tenant-Id': context.body.context.tenantId };

  const row = page.locator('tr', { hasText: 'Playwright M2M Probe' }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.locator('button[title*="Revoke"]').click();
  await page.locator('.enterprise-modal button:has-text("Revoke Key")').click();
  await expect(page.locator('.enterprise-toast').first()).toBeVisible({ timeout: 15_000 });

  const dead = await fetch(`${backend.base}/api/enterprise/m2m/context`, { headers: { 'x-api-key': m2mKeys.rotated } });
  expect(dead.status).toBe(401);

  // The audit trail carries the service actor and the lifecycle events.
  const audit = await api('GET', '/api/enterprise/audit?limit=100', { headers: tenantHeader });
  expect(audit.status).toBe(200);
  const actions = audit.body.events.map(event => event.action);
  expect(actions).toContain('SERVICE_ACCOUNT_CREATED');
  expect(actions).toContain('SERVICE_ACCOUNT_KEY_ROTATED');
  expect(actions).toContain('SERVICE_ACCOUNT_REVOKED');
  const serviceEvents = audit.body.events.filter(event => event.actorType === 'service');
  expect(serviceEvents.length).toBeGreaterThan(0);
  const serialized = JSON.stringify(audit.body);
  expect(serialized.includes(m2mKeys.rotated)).toBe(false);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

// ---------------------------------------------------------------------------
// 5. Support grant created in the UI authorizes a real support session
// ---------------------------------------------------------------------------

test('support grant issued in the UI authorizes, and revocation ends, a real session', async ({ page }) => {
  const pageErrors = await bootConsole(page, { tab: 'support' });
  const context = await api('GET', '/api/enterprise/context');
  const tenantId = context.body.context.tenantId;
  const workspaceId = context.body.workspace.id;

  await page.getByRole('button', { name: /Grant Support Access/ }).click();
  await page.locator('#grant-subject').fill('support-engineer');
  await page.locator('#grant-reason').fill('Playwright live-audit diagnostics for ticket INC-7777');
  await page.locator('#grant-duration').selectOption('60');
  await page.locator('.enterprise-checkbox:has-text("tenant.audit.read") input').first().check();
  await page.getByRole('button', { name: /Issue Timed Grant/ }).click();

  const grantRow = page.locator('tr', { hasText: 'support-engineer' }).first();
  await expect(grantRow).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: path.join(SHOTS, '05-support-grant-live.png'), fullPage: true });

  // Find the grant server-side (UI never exposes internal grant ids).
  const grants = await api('GET', '/api/enterprise/support-grants', { headers: { 'X-Tenant-Id': tenantId } });
  expect(grants.status).toBe(200);
  const grant = grants.body.grants.find(candidate => candidate.supportSubjectId === 'support-engineer');
  expect(grant).toBeTruthy();

  // The support engineer presents their bearer + grant id: real audit access.
  const supportToken = makeMockJwt({ user_id: 'support-engineer', sub: 'support-engineer', email: 'support.engineer@resumepilot.example' });
  const auditAsSupport = await fetch(`${backend.base}/api/enterprise/audit`, {
    headers: {
      Authorization: `Bearer ${supportToken}`,
      'X-Support-Grant-Id': grant.id,
      'X-Tenant-Id': tenantId,
      'X-Workspace-Id': workspaceId,
    },
  });
  expect(auditAsSupport.status).toBe(200);

  // Grant cannot be used for control-plane operations.
  const membersAsSupport = await fetch(`${backend.base}/api/enterprise/memberships`, {
    headers: {
      Authorization: `Bearer ${supportToken}`,
      'X-Support-Grant-Id': grant.id,
      'X-Tenant-Id': tenantId,
      'X-Workspace-Id': workspaceId,
    },
  });
  expect(membersAsSupport.status).toBe(403);

  // Revoke through the UI; the grant must stop working immediately.
  await grantRow.getByRole('button', { name: /Revoke Immediately/ }).click();
  await page.locator('.enterprise-modal button:has-text("Revoke Grant")').click();
  await expect(page.locator('.enterprise-toast').first()).toBeVisible({ timeout: 15_000 });

  const afterRevoke = await fetch(`${backend.base}/api/enterprise/audit`, {
    headers: {
      Authorization: `Bearer ${supportToken}`,
      'X-Support-Grant-Id': grant.id,
      'X-Tenant-Id': tenantId,
      'X-Workspace-Id': workspaceId,
    },
  });
  expect(afterRevoke.status).toBe(403);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

// ---------------------------------------------------------------------------
// 6. Deep links, refresh, back/forward, command palette
// ---------------------------------------------------------------------------

test('deep links survive refresh and browser history', async ({ page }) => {
  await bootConsole(page, { tab: 'security' });
  await expect(page).toHaveURL(/tab=security/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });
  await expect(page).toHaveURL(/tab=security/);
  await expect(page.locator('.enterprise-nav-item:has-text("Security & M2M")')).toBeVisible();

  await page.locator('.enterprise-nav-item:has-text("Audit logs")').click();
  await expect(page).toHaveURL(/tab=audit/);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });
  await expect(page).toHaveURL(/tab=security/);
  await page.goForward({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });
  await expect(page).toHaveURL(/tab=audit/);
});

test('command palette opens and navigates', async ({ page }) => {
  await bootConsole(page);
  await page.keyboard.press('Control+k');
  const palette = page.locator('.enterprise-command, .enterprise-command-palette, [role="dialog"][aria-label="Command palette"]').first();
  await expect(palette).toBeVisible({ timeout: 10_000 });
  await palette.locator('input').first().fill('audit');
  await page.waitForTimeout(250);
  // Click the explicit module entry (quick actions may also match the query).
  await palette.locator('.enterprise-command-results').getByText('Audit logs', { exact: false }).first().click();
  await expect(page).toHaveURL(/tab=audit/, { timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// 7. Responsive layouts — all audit breakpoints
// ---------------------------------------------------------------------------

const VIEWPORTS = [
  { width: 1440, height: 900, label: '1440x900-desktop' },
  { width: 1280, height: 800, label: '1280x800-laptop' },
  { width: 1024, height: 768, label: '1024x768-tablet-landscape' },
  { width: 768, height: 1024, label: '768x1024-tablet-portrait' },
  { width: 430, height: 932, label: '430x932-mobile-large' },
  { width: 390, height: 844, label: '390x844-mobile' },
  { width: 375, height: 667, label: '375x667-mobile-small' },
];

test('console is usable across all audit breakpoints without horizontal overflow', async ({ page }) => {
  await bootConsole(page);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${base}/enterprise?tab=overview`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${viewport.label}`).toBeLessThanOrEqual(2);
    await page.screenshot({ path: path.join(SHOTS, `responsive-${viewport.label}-overview.png`) });

    // The Security module remains operable at each size.
    await page.goto(`${base}/enterprise?tab=security`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, `responsive-${viewport.label}-security.png`) });
  }
});
