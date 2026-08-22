// @ts-check
/**
 * Authenticated Super Admin browser regression against the real Express app.
 * It uses the same Firebase-style bearer boundary and Firestore-shaped backend
 * harness as the Enterprise live-backend suite; no /api/platform route is
 * mocked in the browser. Production credentials are intentionally not used.
 */
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installAuthenticatedSession, makeMockJwt, viteFixtureDefines } from './helpers/enterprise-fixture.mjs';

const require = createRequire(import.meta.url);
const { startLiveEnterpriseBackend } = require('./helpers/enterprise-live-backend.cjs');
const SHOTS = path.join('scratch', 'super-admin-live-backend');
const VIEWPORTS = [
  { width: 1440, height: 900, name: '1440x900' },
  { width: 1280, height: 800, name: '1280x800' },
  { width: 1024, height: 768, name: '1024x768' },
  { width: 768, height: 1024, name: '768x1024' },
  { width: 390, height: 844, name: '390x844' },
  { width: 375, height: 667, name: '375x667' },
];

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
  await vite.listen();
  base = `http://127.0.0.1:${vite.config.server.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  await backend?.close?.();
});

async function bootSuperAdmin(page, pathName = '/adm/tenants') {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await installAuthenticatedSession(page, {
    uid: 'browser-superadmin',
    email: 'superadmin@northwind.example',
    displayName: 'Platform Super Admin',
    claims: { role: 'SUPER_ADMIN', permissions: ['*'] },
  });
  await page.goto(`${base}${pathName}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Tenant registry' })).toBeVisible({ timeout: 30_000 });
  return { pageErrors, consoleErrors };
}

test('Super Admin tenant CRUD, lifecycle confirmation, persistence and audit run against the real backend', async ({ page }) => {
  const diagnostics = await bootSuperAdmin(page);
  await expect(page.getByText('Platform Super Admin')).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, '01-tenant-registry-desktop.png'), fullPage: true });

  await page.getByRole('button', { name: /Provision tenant/i }).click();
  await page.getByLabel('Organization name').fill('QA Super Admin Browser Tenant');
  await page.getByLabel('Immutable slug').fill('qa-super-admin-browser');
  await page.getByRole('button', { name: 'Create tenant' }).click();
  await expect(page.getByText('Provisioned QA Super Admin Browser Tenant')).toBeVisible({ timeout: 20_000 });
  const row = page.locator('tr', { hasText: 'QA Super Admin Browser Tenant' }).first();
  await expect(row).toBeVisible();

  await page.getByRole('button', { name: 'Edit QA Super Admin Browser Tenant' }).click();
  const nameField = page.getByLabel('Display name');
  await nameField.fill('QA Super Admin Browser Tenant Renamed');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Updated QA Super Admin Browser Tenant Renamed')).toBeVisible({ timeout: 20_000 });

  const renamedRow = page.locator('tr', { hasText: 'QA Super Admin Browser Tenant Renamed' }).first();
  await expect(renamedRow).toBeVisible();
  await page.getByRole('button', { name: 'Suspend QA Super Admin Browser Tenant Renamed' }).click();
  await page.getByLabel(/Type SUSPEND qa-super-admin-browser to confirm/).fill('SUSPEND qa-super-admin-browser');
  await page.getByRole('button', { name: 'Confirm action' }).click();
  await expect(renamedRow.getByText('SUSPENDED')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Reactivate QA Super Admin Browser Tenant Renamed' }).click();
  await page.getByLabel(/Type REACTIVATE qa-super-admin-browser to confirm/).fill('REACTIVATE qa-super-admin-browser');
  await page.getByRole('button', { name: 'Confirm action' }).click();
  await expect(renamedRow.getByText('ACTIVE')).toBeVisible({ timeout: 20_000 });

  // Deep-link and refresh retain the registered, persisted tenant state.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Tenant registry' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('tr', { hasText: 'QA Super Admin Browser Tenant Renamed' }).first()).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, '02-tenant-lifecycle-persisted.png'), fullPage: true });

  const stored = backend.db.dump();
  const auditEvents = Object.values(stored).filter(value => value?.category === 'platform.control-plane');
  expect(auditEvents.some(event => event.action === 'PLATFORM_TENANT_PROVISIONED')).toBe(true);
  expect(auditEvents.some(event => event.action === 'PLATFORM_TENANT_SUSPENDED')).toBe(true);
  expect(auditEvents.some(event => event.action === 'PLATFORM_TENANT_REACTIVATED')).toBe(true);
  expect(JSON.stringify(auditEvents)).not.toContain('REPLAY ALL DEAD LETTERS');
  expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
  expect(diagnostics.consoleErrors.filter(message => !/Download the React DevTools/i.test(message)), diagnostics.consoleErrors.join('\n')).toEqual([]);
});

test('Super Admin tenant registry has no horizontal overflow at required viewports and opens the mobile drawer', async ({ page }) => {
  await bootSuperAdmin(page);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${base}/adm/tenants`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Tenant registry' })).toBeVisible({ timeout: 30_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${viewport.name}`).toBeLessThanOrEqual(2);
    if (viewport.width <= 1024) {
      await page.getByRole('button', { name: 'Open admin navigation' }).click();
      await expect(page.getByText('ResumePilot Admin')).toBeVisible();
    }
    await page.screenshot({ path: path.join(SHOTS, `responsive-${viewport.name}.png`), fullPage: true });
  }
});

test('unauthenticated, ADMIN, and malformed direct platform API access fail safely', async () => {
  const noCredential = await fetch(`${backend.base}/api/platform/tenants`);
  expect(noCredential.status).toBe(401);
  const adminToken = makeMockJwt({ user_id: 'browser-owner', sub: 'browser-owner', email: 'owner@northwind.example' });
  const admin = await fetch(`${backend.base}/api/platform/tenants`, { headers: { Authorization: `Bearer ${adminToken}` } });
  expect(admin.status).toBe(403);
  const malformed = await fetch(`${backend.base}/api/platform/tenants/not-a-valid-tenant/suspend`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${makeMockJwt({ user_id: 'browser-superadmin', sub: 'browser-superadmin', email: 'superadmin@northwind.example' })}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: 'SUSPEND anything' }),
  });
  expect([400, 404]).toContain(malformed.status);
});
