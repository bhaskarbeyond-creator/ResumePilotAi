// @ts-check
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import {
  installAuthenticatedSession,
  seedEnterpriseState,
  viteFixtureDefines,
} from './helpers/enterprise-fixture.mjs';
import { installApiFixture, watchForDefects } from './four-portal-fixture.mjs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

test.describe.configure({ mode: 'serial' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../frontend');

/** @type {import('vite').ViteDevServer} */
let vite;
let base = '';

test.beforeAll(async () => {
  vite = await createServer({
    root: frontendDir,
    configFile: path.resolve(frontendDir, 'vite.config.ts'),
    server: { port: 0, host: '127.0.0.1', strictPort: false },
    logLevel: 'error',
  });
  const server = await vite.listen();
  base = `http://127.0.0.1:${server.config.server.port}`;
});

test.afterAll(async () => {
  await vite?.close();
});

function createSuperAdminState() {
  const state = seedEnterpriseState();
  state.isAdmin = true;
  state.modules = {
    enableGoogleAuthModule: true,
    enableFacebookAuthModule: true,
    enableLinkedinAuthModule: true,
    enableGithubAuthModule: true,
    enableImportModule: true,
    enableEmailVerification: true,
    enableCouponsModule: true,
    enableSalesTaxModule: true,
    enableJobScraperModule: true,
    enablePortfolioModule: true,
    enableMessagesModule: true,
    enableJobTrackerModule: true,
    enableAppliedJobsModule: true,
    enableCoverLetterModule: true,
    enableAiSuggestionsModule: true,
    enableAtsScoreModule: true,
    enablePublicSharingModule: true,
    enableBlogModule: true,
  };
  return state;
}

async function bootPage(page, state = createSuperAdminState()) {
  const defects = watchForDefects(page);
  await installAuthenticatedSession(page, {
    claims: { role: 'SUPER_ADMIN', superAdmin: true, admin: true },
  });
  await installApiFixture(page, state);
  return defects;
}

test.describe('Admin Settings & Modules End-to-End Parity', () => {
  test('direct navigation to /admin/settings loads Platform Settings Hub with all 5 tabs', async ({ page }) => {
    await bootPage(page);
    await page.goto(`${base}/admin/settings`, { waitUntil: 'domcontentloaded' });

    // Verify header and live MariaDB engine tag
    await expect(page.getByText('Platform Settings & Control Center')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Live MariaDB Engine')).toBeVisible();

    // Verify the 5 canonical sub-tabs exist
    await expect(page.getByTestId('settings-subtab-modules')).toBeVisible();
    await expect(page.getByTestId('settings-subtab-payments')).toBeVisible();
    await expect(page.getByTestId('settings-subtab-branding')).toBeVisible();
    await expect(page.getByTestId('settings-subtab-integrations')).toBeVisible();
    await expect(page.getByTestId('settings-subtab-templates-legal')).toBeVisible();
  });

  test('direct navigation to /admin/modules loads the 18 Addon Feature Gates', async ({ page }) => {
    await bootPage(page);
    await page.goto(`${base}/admin/modules`, { waitUntil: 'domcontentloaded' });

    // Confirm URL stays on /admin/modules (no bounce to security)
    expect(page.url()).toContain('/admin/modules');

    // Confirm Addon Feature Gates are displayed
    await expect(page.getByText('Google Single Sign-On (OAuth 2.0)')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Facebook Single Sign-On (OAuth 2.0)')).toBeVisible();
    await expect(page.getByText('AI Smart Suggestions & Action Verbs')).toBeVisible();
    await expect(page.getByText('ATS Score Calculator & Keyword Diagnostics')).toBeVisible();
    await expect(page.getByText('AI Resume Import & Document Extraction')).toBeVisible();
  });

  test('sub-tabs switch cleanly to Payments, Branding, Integrations, and Templates', async ({ page }) => {
    await bootPage(page);
    await page.goto(`${base}/admin/settings`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Platform Settings & Control Center')).toBeVisible({ timeout: 15_000 });

    // Click Payments sub-tab
    await page.getByTestId('settings-subtab-payments').click();
    await expect(page.getByText('Platform Currency Standard & Tax Calculation')).toBeVisible();
    await expect(page.getByText('Razorpay Payment Gateway (India / UPI / Cards)')).toBeVisible();
    await expect(page.getByText('Stripe Payment Gateway (Global Multi-Currency)')).toBeVisible();
    await expect(page.getByRole('button', { name: /Probe Connection/i }).first()).toBeVisible();

    // Click Brand & SEO sub-tab
    await page.getByTestId('settings-subtab-branding').click();
    await expect(page.getByText('Brand Identity & Logos')).toBeVisible();
    await expect(page.getByText('Indian Regional Geo-SEO Tagging')).toBeVisible();
    await expect(page.getByText('LLM GEO & AI Search Discovery (llms.txt)')).toBeVisible();

    // Click Third-Party Integrations sub-tab
    await page.getByTestId('settings-subtab-integrations').click();
    await expect(page.getByText('Google Maps & Bot Defense (reCAPTCHA v3)')).toBeVisible();
    await expect(page.getByText('Twilio SMS Notification Gateway')).toBeVisible();

    // Click Templates & Legal sub-tab
    await page.getByTestId('settings-subtab-templates-legal').click();
    await expect(page.getByText('Canonical 51 Resume & CV Template Manager')).toBeVisible();
    await expect(page.getByText('GDPR, Cookie Consent & Legal Governance')).toBeVisible();
    await expect(page.getByText(/Custom Code Injection/i)).toBeVisible();
  });

  test('super admin header exposes View As Role simulation switcher', async ({ page }) => {
    await bootPage(page);
    await page.goto(`${base}/admin/dashboard`, { waitUntil: 'domcontentloaded' });

    const roleSwitcher = page.getByTestId('role-simulation-trigger');
    await expect(roleSwitcher).toBeVisible({ timeout: 15_000 });
    await roleSwitcher.click();

    // Check dropdown options
    await expect(page.getByText('Simulate Role View')).toBeVisible();
    await expect(page.getByText('Super Admin (Default)')).toBeVisible();
    await expect(page.getByText('Support Agent')).toBeVisible();
    await expect(page.getByText('Auditor')).toBeVisible();
    await expect(page.getByText('End User / Candidate')).toBeVisible();
  });
});
