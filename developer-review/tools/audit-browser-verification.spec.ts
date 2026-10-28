/**
 * AUDIT-ONLY browser verification spec (developer-review/tools/).
 *
 * Exercises the real application served by the repository's own Vite dev
 * server (`frontend`, port 4000) in a real Chromium build, at the viewports
 * mandated by the audit directive (375 / 390 / 768 / 1440 / 1920), and records:
 *   - full-page screenshots  -> developer-review/Evidence/screenshots/
 *   - console errors + page errors + failed network requests
 *                            -> developer-review/Evidence/artifacts/browser-observations.json
 *   - axe-core WCAG 2.1 AA findings (serious/critical)
 *
 * Authenticated surfaces are reached with the app's own dev-auth shim
 * (`localStorage.ime_dev_user`), exactly as the repository's
 * frontend/tests/accessibility.spec.ts does. There is NO API mocking here:
 * every backend call goes over the real network and its failure is recorded,
 * because no MariaDB-bootstrapped backend can be provisioned in this
 * environment (see TEMP-ENVIRONMENT-MANIFEST.md).
 *
 * This file is audit tooling. It does not modify the application.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.resolve(HERE, '../Evidence');
const SHOT_DIR = path.join(EVIDENCE_DIR, 'screenshots');
const OBS_FILE = path.join(EVIDENCE_DIR, 'artifacts', 'browser-observations.json');

const CANDIDATE = {
  uid: 'demo-candidate-1',
  email: 'candidate@ime365.com',
  displayName: 'Alex Morgan',
  role: 'CANDIDATE',
};
const ADMIN = {
  uid: 'demo-admin-1',
  email: 'admin@ime365.com',
  displayName: 'Sarah Administrator',
  role: 'ADMIN',
};

const VIEWPORTS = [
  { name: '375x667-mobile', width: 375, height: 667 },
  { name: '390x844-mobile', width: 390, height: 844 },
  { name: '768x1024-tablet', width: 768, height: 1024 },
  { name: '1440x900-desktop', width: 1440, height: 900 },
  { name: '1920x1080-ultrawide', width: 1920, height: 1080 },
];

const WORKFLOWS = [
  { id: 'landing', route: '/', auth: null, waitFor: 'main' },
  { id: 'login', route: '/login', auth: null, waitFor: 'body' },
  { id: 'pricing', route: '/pricing', auth: null, waitFor: 'body' },
  { id: 'candidate-dashboard', route: '/dashboard', auth: CANDIDATE, waitFor: 'body' },
  { id: 'admin-console', route: '/admin', auth: ADMIN, waitFor: 'body' },
  { id: 'ai-settings-providers', route: '/admin/ai-settings?subtab=providers', auth: ADMIN, waitFor: 'body' },
  { id: 'resume-builder', route: '/build-resume', auth: CANDIDATE, waitFor: 'body' },
  { id: 'portfolios', route: '/portfolios', auth: null, waitFor: 'body' },
  { id: 'settings-support', route: '/dashboard/settings?tab=support', auth: CANDIDATE, waitFor: 'body' },
];

interface Observation {
  viewport: string;
  viewportSize: string;
  workflow: string;
  route: string;
  finalUrl: string;
  httpStatus: number | null;
  title: string;
  mainTextLength: number;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  axeViolations: Array<{ id: string; impact: string | null; nodes: number; help: string }>;
  horizontalOverflowPx: number;
  screenshot: string;
  durationMs: number;
}

const observations: Observation[] = [];

test.afterAll(async () => {
  fs.mkdirSync(path.dirname(OBS_FILE), { recursive: true });
  fs.writeFileSync(OBS_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), observations }, null, 2));
});

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const workflow of WORKFLOWS) {
      test(`${workflow.id} renders at ${viewport.name}`, async ({ page }) => {
        const startedAt = Date.now();
        const consoleErrors: string[] = [];
        const pageErrors: string[] = [];
        const failedRequests: string[] = [];

        page.on('console', message => {
          if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 400));
        });
        page.on('pageerror', error => pageErrors.push(String(error.message).slice(0, 400)));
        page.on('requestfailed', request => {
          failedRequests.push(`${request.method()} ${request.url().slice(0, 200)} — ${request.failure()?.errorText}`);
        });

        if (workflow.auth) {
          await page.addInitScript(
            user => localStorage.setItem('ime_dev_user', JSON.stringify(user)),
            workflow.auth
          );
        }

        let httpStatus: number | null = null;
        if (workflow.route === '/') {
          const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
          httpStatus = response?.status() ?? null;
        } else {
          const response = await page.goto(workflow.route, { waitUntil: 'domcontentloaded' });
          httpStatus = response?.status() ?? null;
        }
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
        await page.waitForSelector(workflow.waitFor, { timeout: 15_000 }).catch(() => {});

        const title = await page.title();
        const mainTextLength = (await page.locator('body').innerText().catch(() => '')).length;
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          return Math.max(0, doc.scrollWidth - doc.clientWidth);
        });

        const axeResults = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
          .catch(error => ({ violations: [{ id: 'axe-runtime-error', impact: 'unknown', nodes: [], help: String(error.message).slice(0, 200) }] }));

        const violations = (axeResults.violations || []).map(v => ({
          id: v.id,
          impact: v.impact ?? null,
          nodes: (v.nodes || []).length,
          help: v.help,
        }));

        const shotName = `${viewport.name}__${workflow.id}.png`;
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(SHOT_DIR, shotName), fullPage: true });

        observations.push({
          viewport: viewport.name,
          viewportSize: `${viewport.width}x${viewport.height}`,
          workflow: workflow.id,
          route: workflow.route,
          finalUrl: page.url(),
          httpStatus,
          title,
          mainTextLength,
          consoleErrors,
          pageErrors,
          failedRequests,
          axeViolations: violations,
          horizontalOverflowPx: overflow,
          screenshot: `Evidence/screenshots/${shotName}`,
          durationMs: Date.now() - startedAt,
        });

        expect(httpStatus, `route ${workflow.route} should respond`).toBe(200);
        expect(overflow, `no horizontal overflow at ${viewport.name}`).toBeLessThanOrEqual(2);
        expect(pageErrors, 'no uncaught page errors').toEqual([]);
      });
    }
  });
}
