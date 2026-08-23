import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const reconciler = require('../scripts/capability-reconciler.cjs');

const repoRoot = new URL('..', import.meta.url).pathname;
const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

/**
 * REGRESSION COVERAGE — Admin / Super Admin capability reconciliation.
 *
 * WHY: a previous pass of this audit grepped page components for
 * `fetch('/api/...')` and concluded "tenant decommission exists in the backend
 * but has no UI". That was FALSE — the control is wired through
 * `src/services/platformApi.js`, one import away from the page.
 *
 * A reconciler that cannot see through the service layer manufactures false
 * gaps and, worse, can miss real ones. These tests pin the resolver's
 * behaviour so neither failure mode can return silently.
 */

test('the resolver sees through the service layer (guards against the false "no UI" finding)', () => {
  const { reachable, direct } = reconciler.collectFrontendApiReachability();
  const tenantsPage = [...reachable.keys()].find(file => file.endsWith('components/admin/tenants/PlatformTenants.jsx'));
  assert.ok(tenantsPage, 'PlatformTenants.jsx must exist');

  // The page itself does NOT contain the decommission path...
  const own = direct.get(tenantsPage);
  assert.ok(
    ![...own].some(item => item.includes('decommission')),
    'precondition: the page reaches decommission indirectly — if this changes the test below is no longer meaningful'
  );
  // ...but it MUST still be resolved as reachable through platformApi.js.
  const viaGraph = reachable.get(tenantsPage);
  assert.ok(
    [...viaGraph].some(item => item.includes('/tenants/:param/decommission')),
    'tenant decommission must resolve as reachable from the tenants page'
  );
});

test('path matching treats :param as a wildcard on both sides', () => {
  assert.equal(reconciler.pathsMatch('/api/admin/users/:param', '/api/admin/users/:param'), true);
  assert.equal(reconciler.pathsMatch('/api/auth/:param/test-credentials', '/api/auth/linkedin/test-credentials'), true);
  assert.equal(reconciler.pathsMatch('/api/admin/users', '/api/admin/users/:param'), false);
  assert.equal(reconciler.pathsMatch('/api/admin/users', '/api/platform/users'), false);
});

test('path extraction handles template literals with query strings', () => {
  // Regression: a quote-anchored regex mis-parsed this real call site and made
  // /api/admin/users look like an unused backend route.
  const source = "await fetchAdminWithReauth(`/api/admin/users${params.toString() ? `?${params}` : ''}`);";
  assert.deepEqual([...reconciler.extractApiPaths(source)], ['/api/admin/users']);

  const withParam = 'fetch(`/api/platform/tenants/${encodeURIComponent(id)}/decommission`)';
  assert.deepEqual([...reconciler.extractApiPaths(withParam)], ['/api/platform/tenants/:param/decommission']);
});

test('path extraction ignores third-party URLs', () => {
  // `openrouter.ai/api/v1` is a provider endpoint, not a route this app serves.
  const source = "<span>openrouter.ai/api/v1</span> and 'https://example.com/api/thing'";
  assert.deepEqual([...reconciler.extractApiPaths(source)], []);
});

test('no Admin/Enterprise surface calls a route the backend does not serve', () => {
  const { brokenCalls } = reconciler.reconcile();
  assert.deepEqual(
    brokenCalls,
    [],
    `Frontend calls with no backend route:\n${brokenCalls.map(item => `${item.path} <- ${item.file}`).join('\n')}`
  );
});

/**
 * Control-plane routes that no operator surface can invoke. Each entry must
 * carry a reason; an unexplained addition fails the test. This is the guard
 * against "backend exists but the frontend cannot operate it".
 */
const ACCEPTED_ROUTES_WITHOUT_UI = new Map([
  ['GET /api/admin/settings', 'Superseded read endpoint. The console reads settings from the public config document; writes go through POST /api/admin/settings/:category, which IS reachable.'],
  ['POST /api/admin/gdpr-settings', 'Superseded dedicated writer. The console writes GDPR through POST /api/admin/settings/gdpr, which now shares the same sanitizeGdprSettings validator, so the hardened path cannot be bypassed.'],
  ['GET /api/admin/circuit-breaker-status', 'Diagnostic read. The console surfaces the breaker via the reachable POST /api/email/admin/reset-circuit-breaker control and the deliverability panel.'],
  ['POST /api/admin/save-template-customization', 'Legacy email-template customisation writer superseded by the template editor in EmailSmtpSettings.jsx.'],
  ['GET /api/admin/custom-templates', 'Legacy companion read for the superseded customisation writer above.'],
]);

test('every control-plane route without a UI is explicitly accounted for', () => {
  const { orphanedRoutes } = reconciler.reconcile();
  const unexplained = orphanedRoutes
    .map(route => `${route.method} ${route.path}`)
    .filter(key => !ACCEPTED_ROUTES_WITHOUT_UI.has(key));

  assert.deepEqual(
    unexplained,
    [],
    'A backend control-plane capability became unreachable from the Admin console. ' +
    'Either wire up a UI or add a documented justification to ACCEPTED_ROUTES_WITHOUT_UI:\n' +
    unexplained.join('\n')
  );
});

test('the accepted-without-UI list has not silently grown stale', () => {
  const { orphanedRoutes } = reconciler.reconcile();
  const actual = new Set(orphanedRoutes.map(route => `${route.method} ${route.path}`));
  const staleEntries = [...ACCEPTED_ROUTES_WITHOUT_UI.keys()].filter(key => !actual.has(key));
  assert.deepEqual(
    staleEntries,
    [],
    `These routes are now reachable; remove them from the exception list: ${staleEntries.join(', ')}`
  );
});

test('the full tenant lifecycle is operable from the Super Admin console', () => {
  const page = read('src/components/admin/tenants/PlatformTenants.jsx');
  const api = read('src/services/platformApi.js');

  // Each lifecycle verb must have a real call path, not just a rendered control.
  assert.match(page, /\/api\/enterprise\/tenants/, 'CREATE (provision) must call the tenant creation route');
  assert.match(page, /\/api\/enterprise\/platform\/tenants/, 'READ (list) must call the tenant listing route');
  assert.match(page, /\/suspend|\$\{actionPath\}/, 'SUSPEND must be wired');
  assert.match(page, /reactivate|\$\{actionPath\}/, 'REACTIVATE must be wired');
  assert.match(api, /export const renameTenant[\s\S]*?method: 'PATCH'/, 'RENAME must issue PATCH');
  assert.match(api, /export const decommissionTenant[\s\S]*?\/decommission[\s\S]*?method: 'POST'/, 'DECOMMISSION must issue POST');
  assert.match(api, /export const getTenantDetail/, 'DETAIL must be wired');

  // Destructive control quality.
  assert.match(page, /isSuperAdmin/, 'decommission must be gated on Super Admin in the UI as well as the server');
  assert.match(page, /decommissionReason/, 'a reason must be captured');
  assert.match(page, /setConfirmAction/, 'an explicit confirmation step must exist');
  assert.match(page, /fetchTenants\(\)/, 'the list must refresh from the server after a mutation');
});

test('tenant mutations never report success before the backend persists', () => {
  const page = read('src/components/admin/tenants/PlatformTenants.jsx');
  // The success notification must follow the awaited call, not precede it.
  const decommission = page.slice(page.indexOf('const executeDecommission'));
  const awaitIndex = decommission.indexOf('await decommissionTenant');
  const notifyIndex = decommission.indexOf('setNotification');
  assert.ok(awaitIndex > -1 && notifyIndex > awaitIndex, 'success must only be announced after the awaited mutation resolves');
  assert.ok(decommission.indexOf('catch') > -1, 'failures must be handled');
});

test('destructive tenant routes are server-guarded with recent auth and MFA', () => {
  const platform = read('backend/routes/platform.js');
  for (const guarded of [
    /router\.patch\('\/tenants\/:tenantId',\s*requireRecentAdminAuthentication/,
    /router\.post\('\/tenants\/:tenantId\/decommission',\s*requireRecentAdminAuthentication/,
  ]) {
    assert.match(platform, guarded, 'tenant mutations must require recent authentication + Super Admin + MFA');
  }
});
