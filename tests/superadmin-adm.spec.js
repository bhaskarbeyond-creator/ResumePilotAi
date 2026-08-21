// @ts-check
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import {
  createSuperAdminFixtureBackend,
  installSuperAdminSession,
  seedSuperAdminState,
  viteFixtureDefines,
} from './helpers/superadmin-fixture.mjs';

test.describe.configure({ mode: 'serial' });

/** @type {import('vite').ViteDevServer} */
let vite;
let base = '';

test.beforeAll(async () => {
  vite = await createServer({
    server: { port: 0, host: '127.0.0.1', strictPort: false },
    logLevel: 'error',
    define: viteFixtureDefines(),
  });
  const server = await vite.listen();
  base = `http://127.0.0.1:${server.config.server.port}`;
});

test.afterAll(async () => {
  await vite?.close();
});

async function bootAdm(page, { path = '/adm/dashboard' } = {}) {
  const state = seedSuperAdminState();
  const backend = createSuperAdminFixtureBackend(state);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await installSuperAdminSession(page);
  await page.route('**/api/**', backend);
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Super Admin', { timeout: 30_000 });
  return { state, pageErrors };
}

test('command center renders real fixture health, recommendations, and SHA', async ({ page }) => {
  const { pageErrors } = await bootAdm(page);
  await expect(page.getByRole('heading', { name: 'Super Admin Command Center' })).toBeVisible();
  await expect(page.getByText('1 dead-letter notification(s)')).toBeVisible();
  await expect(page.getByText('SHA: fixture-sha')).toBeVisible();
  await expect(page.getByText('no trend inferred').first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('grouped navigation reaches every control-plane module', async ({ page }) => {
  await bootAdm(page);
  const modules = [
    ['Command Center', 'Super Admin Command Center'],
    ['Tenants Registry', 'Enterprise Tenants Registry'],
    ['Admin Audit Trail', 'Admin Audit Logs'],
    ['Security Events', 'Security Events'],
    ['Queue & DLQ Monitor', 'Platform Queue & DLQ Monitor'],
    ['Platform Operations', 'Platform Operations'],
    ['Attention', 'Attention'],
    ['Platform Operators', 'Platform Operators'],
    ['Phrases', 'Phrases'],
  ];
  for (const [nav, heading] of modules) {
    await page.getByRole('link', { name: nav }).first().click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 20_000 });
  }
});

test('tenant lifecycle uses suspend/reactivate and Super Admin decommission drawer', async ({ page }) => {
  const { state } = await bootAdm(page, { path: '/adm/tenants' });
  await expect(page.getByText('Northwind Careers')).toBeVisible();
  await page.getByRole('button', { name: 'Suspend' }).click();
  await expect(page.getByText('Are you sure you want to suspend')).toBeVisible();
  await page.locator('.fixed.inset-0').getByRole('button', { name: 'Suspend', exact: true }).click();
  await expect.poll(() => state.tenants.find(item => item.id === 'tenant-active')?.lifecycleState).toBe('SUSPENDED');
  await page.getByRole('button', { name: 'Details' }).first().click();
  await expect(page.getByLabel('Tenant detail')).toBeVisible();
  await expect(page.getByText('Decommission (SUPER_ADMIN)')).toBeVisible();
});

test('command palette jumps to operations and security', async ({ page }) => {
  await bootAdm(page);
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByPlaceholder('Type a command, module, or setting name…')).toBeVisible();
  await page.getByPlaceholder('Type a command, module, or setting name…').fill('security');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/adm\/security/);
});

test('deep links survive refresh; browser back walks modules', async ({ page }) => {
  await bootAdm(page, { path: '/adm/queues' });
  await expect(page.getByRole('heading', { name: 'Platform Queue & DLQ Monitor' })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Platform Queue & DLQ Monitor' })).toBeVisible();
  await page.getByRole('link', { name: 'Security Events' }).first().click();
  await expect(page).toHaveURL(/\/adm\/security/);
  await page.goBack();
  await expect(page).toHaveURL(/\/adm\/queues/);
});

test('responsive admin shell does not overflow at required viewports', async ({ page }) => {
  await bootAdm(page);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 430, height: 932 },
    { width: 390, height: 844 },
    { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `overflow at ${viewport.width}`).toBeLessThanOrEqual(24);
  }
});
