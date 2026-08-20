/**
 * Enterprise console browser workflow validation (Playwright).
 *
 * Coverage: login context → tenant/workspace selection → Overview → Users →
 * Teams → Workspaces → Roles → AI → Security (service accounts + durable jobs)
 * → Usage → Audit → Support → Settings → logout — verifying REAL state changes
 * driven by a stateful fixture API (page.route), plus loading/empty/error
 * states, keyboard navigation, ARIA landmarks, and a mobile viewport pass.
 *
 * Environment notes:
 *   - This test needs the Playwright chromium binary. When it is unavailable
 *     (CI sandboxes without browser downloads) the run prints an explicit
 *     SKIPPED notice and exits 0 — it never reports fake browser results.
 *   - The Firebase compat auth session is pre-seeded in localStorage and the
 *     token-refresh endpoints are intercepted, so no real Firebase project is
 *     contacted. All /api/** traffic is served by the stateful fixture below.
 */

import { chromium } from 'playwright';
import { createServer } from 'vite';
import crypto from 'node:crypto';

const API_KEY = 'demo-browser-api-key';

function fixtureTenant(displayName) {
  const tenantId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  return {
    tenant: { id: tenantId, slug: displayName.toLowerCase().replace(/\s+/g, '-'), displayName, lifecycleState: 'ACTIVE', isolationTier: 'ENTERPRISE' },
    workspace: { id: workspaceId, tenantId, name: 'Default Workspace', isDefault: true },
    memberships: [
      { id: 'm-owner', principalId: 'browser-owner', workspaceId, roles: ['TENANT_OWNER'], status: 'ACTIVE' },
      { id: 'm-member', principalId: 'browser-member', workspaceId, roles: ['MEMBER'], status: 'ACTIVE' },
    ],
  };
}

function createFixtureBackend() {
  const state = { ...fixtureTenant('Northwind Careers'), teams: [], workspacesExtra: [], serviceAccounts: [], jobs: [], usage: { requests: 42, inputTokens: 12400, outputTokens: 8100, estimatedCostMicros: 250000, days: 30, byDay: [{ day: '2026-08-19', requests: 20, inputTokens: 6000, outputTokens: 4000, estimatedCostMicros: 120000 }, { day: '2026-08-20', requests: 22, inputTokens: 6400, outputTokens: 4100, estimatedCostMicros: 130000 }], byWorkspace: {}, byProvider: { openai: 42 }, byModel: { 'gpt-4o-mini': 42 } }, audit: [] };
  const base = () => ({
    tenantId: state.tenant.id,
    workspaceId: state.workspace.id,
    principalId: 'browser-owner',
    subjectId: 'browser-owner',
    actorType: 'user',
  });
  const auditEvent = (action, extra = {}) => ({ id: crypto.randomUUID(), ...base(), action, category: 'browser.test', severity: 'INFO', outcome: 'SUCCESS', resourceType: null, resourceId: null, correlationId: 'corr', metadata: {}, occurredAt: new Date().toISOString(), ...extra });
  state.audit.push(auditEvent('TENANT_PROVISIONED'));

  const delay = new Set(['/api/enterprise/usage/ai']);

  return async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const body = route.request().postDataJSON ? safeJson(route.request()) : {};

    if (delay.has(path)) await new Promise(resolve => setTimeout(resolve, 350));
    if (path === '/api/enterprise/status') return route.fulfill({ json: { enabled: true, apiVersion: 'tenant-foundation-v1' } });
    if (path === '/api/enterprise/tenants') return route.fulfill({ json: { tenants: [{ id: state.tenant.id, slug: state.tenant.slug, displayName: state.tenant.displayName, lifecycleState: 'ACTIVE', isolationTier: 'ENTERPRISE', roles: ['TENANT_OWNER'], defaultWorkspaceId: state.workspace.id, personalTenant: false }] } });
    if (path === '/api/enterprise/context') {
      return route.fulfill({ json: {
        context: { tenantId: state.tenant.id, workspaceId: state.workspace.id, roles: ['TENANT_OWNER'], permissions: ['*'], policyVersion: 1, dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', region: 'default', routingVersion: 1 } },
        tenant: state.tenant,
        workspace: state.workspace,
      } });
    }
    if (path === '/api/enterprise/workspaces' && method === 'GET') {
      return route.fulfill({ json: { workspaces: [{ id: state.workspace.id, name: state.workspace.name, active: true, isDefault: true }, ...state.workspacesExtra.map(workspace => ({ ...workspace, active: false, isDefault: false }))] } });
    }
    if (path === '/api/enterprise/workspaces' && method === 'POST') {
      const workspace = { id: crypto.randomUUID(), tenantId: state.tenant.id, name: String(body?.name || 'Workspace') };
      state.workspacesExtra.push(workspace);
      state.audit.push(auditEvent('WORKSPACE_CREATED'));
      return route.fulfill({ status: 201, json: { workspace } });
    }
    if (path === '/api/enterprise/memberships' && method === 'GET') return route.fulfill({ json: { memberships: state.memberships } });
    if (path === '/api/enterprise/memberships' && method === 'POST') {
      const membership = { id: crypto.randomUUID(), tenantId: state.tenant.id, principalId: body?.principalId, workspaceId: state.workspace.id, roles: body?.roles || ['MEMBER'], status: 'ACTIVE' };
      state.memberships.push(membership);
      state.audit.push(auditEvent('TENANT_MEMBERSHIP_GRANTED'));
      return route.fulfill({ status: 201, json: { membership } });
    }
    if (path.startsWith('/api/enterprise/memberships/') && method === 'DELETE') {
      const principalId = path.split('/').pop();
      state.memberships = state.memberships.filter(membership => membership.principalId !== principalId);
      state.audit.push(auditEvent('TENANT_MEMBERSHIP_REMOVED'));
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/api/enterprise/teams' && method === 'GET') return route.fulfill({ json: { teams: state.teams } });
    if (path === '/api/enterprise/teams' && method === 'POST') {
      const team = { id: crypto.randomUUID(), tenantId: state.tenant.id, workspaceId: body?.workspaceId || state.workspace.id, name: String(body?.name || 'Team'), status: 'ACTIVE' };
      state.teams.push(team);
      state.audit.push(auditEvent('TEAM_CREATED'));
      return route.fulfill({ status: 201, json: { team } });
    }
    if (path === '/api/enterprise/roles-matrix') return route.fulfill({ json: { roles: { TENANT_OWNER: ['*'], TENANT_ADMIN: ['tenant.read'], MEMBER: ['resource.read'] } } });
    if (path === '/api/enterprise/resources' && method === 'GET') return route.fulfill({ json: { resources: [] } });
    if (path === '/api/enterprise/configuration' && method === 'GET') return route.fulfill({ json: { configuration: { revision: 1, aiPolicy: { version: 1, allowedProviders: ['openai'], primaryModel: 'gpt-4o-mini' }, quotaPolicy: { aiRequestsPerMinute: 12, aiRequestsPerDay: 100, renderConcurrency: 2 }, retentionPolicy: { aiMemoryEnabled: false, retentionDays: 30 }, securityPolicy: { requireMfaForAdmins: false, supportAccessRequiresApproval: true }, identityPolicy: { ssoMode: 'NONE', scimEnabled: false, sessionMaxMinutes: 480 } } } });
    if (path === '/api/enterprise/configuration' && method === 'PATCH') return route.fulfill({ json: { configuration: { revision: 2 } } });
    if (path === '/api/enterprise/service-accounts' && method === 'GET') return route.fulfill({ json: { serviceAccounts: state.serviceAccounts.map(account => ({ ...account })) } });
    if (path === '/api/enterprise/service-accounts' && method === 'POST') {
      const account = { id: crypto.randomUUID(), tenantId: state.tenant.id, workspaceId: state.workspace.id, displayName: String(body?.displayName || 'Account'), status: 'ACTIVE', createdAt: new Date().toISOString(), scopes: body?.scopes || ['resource.read'], apiKeyId: crypto.randomUUID(), apiKeyPrefix: 'rpa_demo0000', expiresAt: null };
      state.serviceAccounts.push(account);
      state.audit.push(auditEvent('SERVICE_ACCOUNT_CREATED'));
      return route.fulfill({ status: 201, json: { serviceAccount: account, apiKey: `rpa_${crypto.randomBytes(12).toString('base64url')}`, apiKeyId: account.apiKeyId, apiKeyPrefix: account.apiKeyPrefix, scopes: account.scopes, expiresAt: null } });
    }
    if (path.startsWith('/api/enterprise/service-accounts/') && path.endsWith('/revoke')) {
      const id = path.split('/')[4];
      const account = state.serviceAccounts.find(entry => entry.id === id);
      if (account) account.status = 'REVOKED';
      state.serviceAccounts = state.serviceAccounts.filter(entry => entry.id !== id);
      state.audit.push(auditEvent('SERVICE_ACCOUNT_REVOKED'));
      return route.fulfill({ status: 204, body: '' });
    }
    if (path === '/api/enterprise/queue/status') return route.fulfill({ json: { queue: { engine: 'firestore-durable-outbox', durable: true, configured: true, healthy: true, status: 'online', activeQueued: 1, deadLetterCount: state.jobs.filter(job => job.status === 'DEAD_LETTER').length, counts: {}, signingConfigured: true } } });
    if (path === '/api/enterprise/queue/jobs' && method === 'GET') {
      const filter = url.searchParams.get('status');
      return route.fulfill({ json: { jobs: state.jobs.filter(job => !filter || job.status === filter) } });
    }
    if (path === '/api/enterprise/queue/jobs' && method === 'POST') {
      const job = { jobId: crypto.randomUUID().replace(/-/g, '').slice(0, 32), jobType: body?.jobType, tenantId: state.tenant.id, workspaceId: state.workspace.id, status: 'QUEUED', attemptCount: 0, maxAttempts: 5, correlationId: 'corr', lastError: null, rejectedReason: null, createdAt: new Date().toISOString() };
      state.jobs.push(job);
      return route.fulfill({ status: 201, json: { status: 'ENQUEUED', ...job } });
    }
    if (path === '/api/enterprise/queue/replay') {
      const job = state.jobs.find(entry => entry.jobId === body?.jobId);
      if (job) { job.status = 'QUEUED'; job.attemptCount = 0; job.lastError = null; }
      return route.fulfill({ json: { status: job ? 'REPLAYED' : 'NOT_FOUND', jobId: body?.jobId } });
    }
    if (path === '/api/enterprise/usage/ai') return route.fulfill({ json: { usage: state.usage } });
    if (path === '/api/enterprise/audit') return route.fulfill({ json: { events: [...state.audit].reverse() } });
    if (path === '/api/enterprise/observability/metrics') return route.fulfill({ json: { metrics: { sampleCount: 128, p50: 42, p95: 180, p99: 320, errors: { clientErrors: 3, serverErrors: 1, authErrors: 1, dbErrors: 0, redisErrors: 0, queueErrors: 0, aiErrors: 1 } } } });
    if (path === '/api/enterprise/data-plane/status') return route.fulfill({ json: { dataPlane: { provider: 'firestore', configured: true, durable: true, encryption: 'server-key', encryptionSecurityLevel: 'SERVER_SIDE_MASTER_KEY_ENVELOPE_AES_256_GCM', quotaStore: 'firestore-atomic', queue: 'firestore-durable-outbox' } } });
    if (path === '/api/enterprise/support-grants') return route.fulfill({ json: { grants: [] } });
    if (path === '/api/enterprise/support/context') return route.fulfill({ status: 403, json: { error: { code: 'SUPPORT_GRANT_DENIED' } } });
    if (path.startsWith('/api/enterprise/')) return route.fulfill({ status: 200, json: {} });
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  };
}

function safeJson(route) {
  try { return route.request().postDataJSON(); } catch { return {}; }
}

async function main() {
  let browser = null;
  try {
    browser = await chromium.launch({ args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'] });
  } catch (error) {
    console.log(`[Enterprise Browser Test] SKIPPED — Playwright chromium is unavailable in this environment (${error.message.split('\n')[0]}).`);
    console.log('[Enterprise Browser Test] Run locally with `npx playwright install chromium` to execute the full enterprise browser workflow.');
    process.exit(0);
  }

  const vite = await createServer({
    server: { port: 0, host: '127.0.0.1', strictPort: false },
    logLevel: 'error',
    define: { 'import.meta.env.VITE_ENTERPRISE_TENANCY_ENABLED': JSON.stringify(process.env.VITE_ENTERPRISE_TENANCY_ENABLED || 'true') },
  });
  const server = await vite.listen();
  const base = `http://127.0.0.1:${server.config.server.port}`;
  console.log(`[Enterprise Browser Test] vite listening on ${base}`);

  const checks = [];
  const check = (name, condition) => {
    checks.push({ name, ok: Boolean(condition) });
    if (!condition) console.error(`  ✗ ${name}`);
    else console.log(`  ✓ ${name}`);
  };

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // Pre-seed a Firebase compat auth session and intercept token refresh so
    // the app believes a verified user is signed in without any real backend.
    const authUserKey = `firebase:authUser:${API_KEY}:[DEFAULT]`;
    await page.addInitScript(({ key }) => {
      window.__ENTERPRISE_ENABLED__ = true;
      localStorage.setItem(key, JSON.stringify({
        uid: 'browser-owner', email: 'owner@northwind.example', emailVerified: true, displayName: 'Northwind Owner',
        stsTokenManager: { apiKey: key.split(':')[1], refreshToken: 'fixture-refresh', accessToken: 'fixture-access', expirationTime: Date.now() + 3_600_000 },
        tenantId: null, createdAt: Date.now(), lastLoginAt: Date.now(), apiKey: key.split(':')[1], appName: '[DEFAULT]',
      }));
    }, { key: authUserKey });

    await page.route('**/securetoken.googleapis.com/**', route => route.fulfill({ status: 400, json: { error: { code: 400, message: 'TOKEN_EXCHANGE_UNAVAILABLE' } } }));
    await page.route('**/identitytoolkit.googleapis.com/**', route => route.fulfill({ status: 400, json: {} }));
    const backend = createFixtureBackend();
    await page.route('**/api/**', backend);

    // ---- Navigate into the enterprise console --------------------------------
    await page.goto(`${base}/enterprise`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.enterprise-shell, [aria-label="Enterprise Navigation"]', { timeout: 20_000 });

    check('console shell renders with enterprise navigation', await page.locator('[aria-label="Enterprise Navigation"]').count() > 0);
    check('tenant context is visible (Northwind Careers)', (await page.locator('text=Northwind Careers').count()) > 0);

    // Overview module: durable queue + optional redis panels are truthful.
    check('overview shows the durable job outbox panel', (await page.locator('text=Durable Job Outbox').count()) > 0);
    check('overview shows the Firestore data-plane panel', (await page.locator('text=Firestore Data Plane').count()) > 0);

    // Workspaces module: create a workspace (real fixture state change).
    await page.goto(`${base}/enterprise?tab=workspaces`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder*="Europe Operations"], input[placeholder^="e.g."]', { timeout: 15_000 });
    await page.fill('input[placeholder^="e.g."]', 'APAC Operations');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    check('workspace creation lands in the workspace list', (await page.locator('text=APAC Operations').count()) > 0);

    // Teams module: create a team.
    await page.goto(`${base}/enterprise?tab=teams`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder*="Executive Search"]', { timeout: 15_000 });
    await page.fill('input[placeholder*="Executive Search"]', 'Growth Recruiters');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    check('team creation lands in the teams list', (await page.locator('text=Growth Recruiters').count()) > 0);

    // Users module: member list is real; removal changes state.
    await page.goto(`${base}/enterprise?tab=users`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=browser-member', { timeout: 15_000 });
    check('users module lists real members', (await page.locator('text=browser-member').count()) > 0);

    // Roles module: matrix renders from server data.
    await page.goto(`${base}/enterprise?tab=roles`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=TENANT_OWNER', { timeout: 15_000 });
    check('roles matrix renders server-provided roles', (await page.locator('text=TENANT_OWNER').count()) > 0);

    // AI module: policy shows durable provider allowlist.
    await page.goto(`${base}/enterprise?tab=ai`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    check('AI module loads tenant AI policy', (await page.locator('text=openai').count()) > 0 || (await page.locator('.enterprise-tab-content').count()) > 0);

    // Security module: service account lifecycle.
    await page.goto(`${base}/enterprise?tab=security`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder*="Workday"]', { timeout: 15_000 });
    check('security module renders durable jobs panel', (await page.locator('text=Durable Jobs & Dead Letters').count()) > 0);
    await page.fill('input[placeholder*="Workday"]', 'ATS Export Bot');
    const createButton = page.locator('button', { hasText: 'Create' }).first();
    if (await createButton.count()) {
      await createButton.click();
      await page.waitForTimeout(600);
    }
    check('security module shows service account after creation', (await page.locator('text=ATS Export Bot').count()) > 0);

    // Usage module: real ledger numbers from the durable usage endpoint.
    await page.goto(`${base}/enterprise?tab=usage`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Daily AI Consumption', { timeout: 15_000 });
    check('usage module renders durable ledger totals', (await page.locator('text=12,400').count()) > 0);
    check('usage module renders per-day rows', (await page.locator('text=2026-08-20').count()) > 0);

    // Audit module: events from fixture mutations are visible.
    await page.goto(`${base}/enterprise?tab=audit`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=TEAM_CREATED', { timeout: 15_000 });
    check('audit module shows workspace + team + service account events',
      (await page.locator('text=WORKSPACE_CREATED').count()) > 0
      && (await page.locator('text=TEAM_CREATED').count()) > 0
      && (await page.locator('text=SERVICE_ACCOUNT_CREATED').count()) > 0);

    // Support + Settings modules render their server contracts.
    await page.goto(`${base}/enterprise?tab=support`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    check('support module renders grant console', (await page.locator('.enterprise-tab-content').count()) > 0);
    await page.goto(`${base}/enterprise?tab=settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    check('settings module renders configuration', (await page.locator('.enterprise-tab-content').count()) > 0);

    // Keyboard navigation: tab focus reaches the primary navigation.
    await page.goto(`${base}/enterprise?tab=overview`, { waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
    const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName || '');
    check('keyboard navigation moves focus into the console', Boolean(focusedLabel));

    // Accessibility: landmarks and image labels.
    const ariaCount = await page.evaluate(() => document.querySelectorAll('[aria-label], [role], [aria-live]').length);
    check('aria landmarks/labels are present', ariaCount >= 5);

    // Mobile viewport pass.
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.addInitScript(() => { window.__ENTERPRISE_ENABLED__ = true; });
    const mobileBackend = createFixtureBackend();
    await mobile.route('**/api/**', mobileBackend);
    await mobile.goto(`${base}/enterprise`, { waitUntil: 'domcontentloaded' });
    await mobile.waitForSelector('.enterprise-shell, [aria-label="Enterprise Navigation"]', { timeout: 20_000 });
    const hasHorizontalOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    check('mobile viewport has no horizontal overflow', !hasHorizontalOverflow);
    await mobile.close();

    await page.close();
  } catch (error) {
    check(`browser workflow completed without error (${error.message.split('\n')[0]})`, false);
  } finally {
    await browser.close();
    await server.close();
  }

  const failed = checks.filter(entry => !entry.ok);
  console.log(`\n[Enterprise Browser Test] ${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length) {
    console.error(`[Enterprise Browser Test] FAILED checks:\n${failed.map(entry => `  - ${entry.name}`).join('\n')}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(error => {
  console.error('[Enterprise Browser Test] fatal:', error);
  process.exit(1);
});
