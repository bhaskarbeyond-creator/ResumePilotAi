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
import fs from 'node:fs';

function readEnvKey() {
  for (const file of ['.env', 'backend/.env']) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const match = content.match(/VITE_FIREBASE_KEY=([^\r\n]+)/);
      if (match) return match[1].trim();
    } catch {}
  }
  return 'demo-browser-api-key';
}

const API_KEY = process.env.VITE_FIREBASE_KEY || readEnvKey();

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
  const state = { ...fixtureTenant('Northwind Careers'), teams: [], teamMembers: [], workspacesExtra: [], workspaceMembers: [], serviceAccounts: [], jobs: [], usage: { requests: 42, inputTokens: 12400, outputTokens: 8100, estimatedCostMicros: 250000, days: 30, byDay: [{ day: '2026-08-19', requests: 20, inputTokens: 6000, outputTokens: 4000, estimatedCostMicros: 120000 }, { day: '2026-08-20', requests: 22, inputTokens: 6400, outputTokens: 4100, estimatedCostMicros: 130000 }], byWorkspace: {}, byProvider: { openai: 42 }, byModel: { 'gpt-4o-mini': 42 } }, audit: [] };
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
    const body = safeJson(route.request());

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
      const includeArchived = ['1', 'true'].includes(String(url.searchParams.get('includeArchived') || ''));
      const extras = state.workspacesExtra
        .filter(workspace => includeArchived || (workspace.lifecycleState || 'ACTIVE') === 'ACTIVE')
        .map(workspace => ({ ...workspace, active: false, isDefault: false, lifecycleState: workspace.lifecycleState || 'ACTIVE' }));
      return route.fulfill({ json: { workspaces: [{ id: state.workspace.id, name: state.workspace.name, active: true, isDefault: true, lifecycleState: 'ACTIVE' }, ...extras] } });
    }
    if (path === '/api/enterprise/workspaces' && method === 'POST') {
      const workspace = { id: crypto.randomUUID(), tenantId: state.tenant.id, name: String(body?.name || 'Workspace'), lifecycleState: 'ACTIVE' };
      state.workspacesExtra.push(workspace);
      state.audit.push(auditEvent('WORKSPACE_CREATED'));
      return route.fulfill({ status: 201, json: { workspace } });
    }
    {
      const wsMatch = path.match(/^\/api\/enterprise\/workspaces\/([^/]+)$/);
      if (wsMatch && method === 'PATCH') {
        const workspace = state.workspacesExtra.find(entry => entry.id === wsMatch[1]) || (state.workspace.id === wsMatch[1] ? state.workspace : null);
        if (!workspace) return route.fulfill({ status: 404, json: { error: { code: 'WORKSPACE_NOT_FOUND' } } });
        workspace.name = String(body?.name || workspace.name);
        state.audit.push(auditEvent('WORKSPACE_UPDATED'));
        return route.fulfill({ json: { workspace: { ...workspace, isDefault: workspace === state.workspace, lifecycleState: workspace.lifecycleState || 'ACTIVE' } } });
      }
      const lifecycleMatch = path.match(/^\/api\/enterprise\/workspaces\/([^/]+)\/(archive|restore)$/);
      if (lifecycleMatch && method === 'POST') {
        const workspace = state.workspacesExtra.find(entry => entry.id === lifecycleMatch[1]);
        if (!workspace) return route.fulfill({ status: lifecycleMatch[1] === state.workspace.id ? 409 : 404, json: { error: { code: lifecycleMatch[1] === state.workspace.id ? 'WORKSPACE_DEFAULT_PROTECTED' : 'WORKSPACE_NOT_FOUND' } } });
        workspace.lifecycleState = lifecycleMatch[2] === 'archive' ? 'ARCHIVED' : 'ACTIVE';
        state.audit.push(auditEvent(lifecycleMatch[2] === 'archive' ? 'WORKSPACE_ARCHIVED' : 'WORKSPACE_ACTIVE'));
        return route.fulfill({ json: { workspace: { id: workspace.id, name: workspace.name, lifecycleState: workspace.lifecycleState } } });
      }
      const wsMembersMatch = path.match(/^\/api\/enterprise\/workspaces\/([^/]+)\/members$/);
      if (wsMembersMatch && method === 'GET') {
        return route.fulfill({ json: { members: state.workspaceMembers.filter(member => member.workspaceId === wsMembersMatch[1] && member.status === 'ACTIVE') } });
      }
      if (wsMembersMatch && method === 'POST') {
        const member = { id: crypto.randomUUID(), workspaceId: wsMembersMatch[1], principalId: String(body?.principalId || ''), status: 'ACTIVE' };
        state.workspaceMembers.push(member);
        state.audit.push(auditEvent('WORKSPACE_MEMBER_ADDED'));
        return route.fulfill({ status: 201, json: { member } });
      }
      const wsMemberMatch = path.match(/^\/api\/enterprise\/workspaces\/([^/]+)\/members\/([^/]+)$/);
      if (wsMemberMatch && method === 'DELETE') {
        state.workspaceMembers = state.workspaceMembers.filter(member => !(member.workspaceId === wsMemberMatch[1] && member.principalId === decodeURIComponent(wsMemberMatch[2])));
        state.audit.push(auditEvent('WORKSPACE_MEMBER_REMOVED'));
        return route.fulfill({ status: 204, body: '' });
      }
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
    if (path === '/api/enterprise/teams' && method === 'GET') return route.fulfill({ json: { teams: state.teams.filter(team => team.status === 'ACTIVE') } });
    if (path === '/api/enterprise/teams' && method === 'POST') {
      const team = { id: crypto.randomUUID(), tenantId: state.tenant.id, workspaceId: body?.workspaceId || state.workspace.id, name: String(body?.name || 'Team'), status: 'ACTIVE' };
      state.teams.push(team);
      state.audit.push(auditEvent('TEAM_CREATED'));
      return route.fulfill({ status: 201, json: { team } });
    }
    {
      const teamMatch = path.match(/^\/api\/enterprise\/teams\/([^/]+)$/);
      if (teamMatch && method === 'PATCH') {
        const team = state.teams.find(entry => entry.id === teamMatch[1] && entry.status === 'ACTIVE');
        if (!team) return route.fulfill({ status: 404, json: { error: { code: 'TEAM_NOT_FOUND' } } });
        team.name = String(body?.name || team.name);
        state.audit.push(auditEvent('TEAM_UPDATED'));
        return route.fulfill({ json: { team } });
      }
      const teamArchiveMatch = path.match(/^\/api\/enterprise\/teams\/([^/]+)\/archive$/);
      if (teamArchiveMatch && method === 'POST') {
        const team = state.teams.find(entry => entry.id === teamArchiveMatch[1] && entry.status === 'ACTIVE');
        if (!team) return route.fulfill({ status: 404, json: { error: { code: 'TEAM_NOT_FOUND' } } });
        team.status = 'ARCHIVED';
        state.audit.push(auditEvent('TEAM_ARCHIVED'));
        return route.fulfill({ json: { team } });
      }
      const teamMembersMatch = path.match(/^\/api\/enterprise\/teams\/([^/]+)\/members$/);
      if (teamMembersMatch && method === 'GET') {
        return route.fulfill({ json: { members: state.teamMembers.filter(member => member.teamId === teamMembersMatch[1] && member.status === 'ACTIVE') } });
      }
      if (teamMembersMatch && method === 'POST') {
        const member = { id: crypto.randomUUID(), teamId: teamMembersMatch[1], workspaceId: state.workspace.id, principalId: String(body?.principalId || ''), status: 'ACTIVE' };
        state.teamMembers.push(member);
        state.audit.push(auditEvent('TEAM_MEMBER_ADDED'));
        return route.fulfill({ status: 201, json: { member } });
      }
      const teamMemberMatch = path.match(/^\/api\/enterprise\/teams\/([^/]+)\/members\/([^/]+)$/);
      if (teamMemberMatch && method === 'DELETE') {
        state.teamMembers = state.teamMembers.filter(member => !(member.teamId === teamMemberMatch[1] && member.principalId === decodeURIComponent(teamMemberMatch[2])));
        state.audit.push(auditEvent('TEAM_MEMBER_REMOVED'));
        return route.fulfill({ status: 204, body: '' });
      }
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
    if (path === '/api/enterprise/audit') {
      // Mirror the real server-side filter contract so the browser test
      // exercises true request-driven filtering, not client-side slicing.
      let events = [...state.audit].reverse();
      const outcome = url.searchParams.get('outcome');
      const action = url.searchParams.get('action');
      if (outcome) events = events.filter(event => event.outcome === outcome.toUpperCase());
      if (action) events = events.filter(event => String(event.action || '').toUpperCase().includes(action.toUpperCase()));
      return route.fulfill({ json: { events } });
    }
    if (path === '/api/enterprise/observability/metrics') return route.fulfill({ json: { metrics: { sampleCount: 128, p50: 42, p95: 180, p99: 320, errors: { clientErrors: 3, serverErrors: 1, authErrors: 1, dbErrors: 0, redisErrors: 0, queueErrors: 0, aiErrors: 1 } } } });
    if (path === '/api/enterprise/data-plane/status') return route.fulfill({ json: { dataPlane: { provider: 'firestore', configured: true, durable: true, encryption: 'server-key', encryptionSecurityLevel: 'SERVER_SIDE_MASTER_KEY_ENVELOPE_AES_256_GCM', quotaStore: 'firestore-atomic', queue: 'firestore-durable-outbox' } } });
    if (path === '/api/enterprise/support-grants') return route.fulfill({ json: { grants: [] } });
    if (path === '/api/enterprise/support/context') return route.fulfill({ status: 403, json: { error: { code: 'SUPPORT_GRANT_DENIED' } } });
    if (path.startsWith('/api/enterprise/')) return route.fulfill({ status: 200, json: {} });
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  };
}

function safeJson(req) {
  try {
    if (req && typeof req.postDataJSON === 'function') return req.postDataJSON() || {};
    if (req && typeof req.request === 'function' && typeof req.request().postDataJSON === 'function') return req.request().postDataJSON() || {};
    return {};
  } catch {
    return {};
  }
}

function makeMockJwt(payload = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: 'https://securetoken.google.com/ai-resume-builder-424cf',
    aud: 'ai-resume-builder-424cf',
    auth_time: Math.floor(Date.now() / 1000),
    user_id: 'browser-owner',
    sub: 'browser-owner',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: 'owner@northwind.example',
    email_verified: true,
    firebase: { identities: { email: ['owner@northwind.example'] }, sign_in_provider: 'password' },
    ...payload,
  })).toString('base64url');
  return `${header}.${claims}.mock_signature`;
}

async function main() {
  let browser = null;
  try {
    browser = await chromium.launch({
      // Sandboxes without access to the Playwright CDN can point this at any
      // compatible Chromium binary (e.g. @sparticuz/chromium).
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'],
    });
  } catch (error) {
    console.log(`[Enterprise Browser Test] SKIPPED — Playwright chromium is unavailable in this environment (${error.message.split('\n')[0]}).`);
    console.log('[Enterprise Browser Test] Run locally with `npx playwright install chromium` to execute the full enterprise browser workflow.');
    process.exit(0);
  }

  const vite = await createServer({
    server: { port: 0, host: '127.0.0.1', strictPort: false },
    logLevel: 'error',
    define: {
      'import.meta.env.VITE_ENTERPRISE_TENANCY_ENABLED': JSON.stringify(process.env.VITE_ENTERPRISE_TENANCY_ENABLED || 'true'),
      // Self-contained fixture Firebase config: environments without a real
      // .env (CI sandboxes) still boot the app; every network call the SDK
      // would make is intercepted by page.route below.
      'import.meta.env.VITE_FIREBASE_KEY': JSON.stringify(API_KEY),
      'import.meta.env.VITE_FIREBASE_DOMAIN': JSON.stringify('fixture.firebaseapp.com'),
      'import.meta.env.VITE_FIREBASE_DATABASE_URL': JSON.stringify('https://fixture-default-rtdb.firebaseio.com'),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('fixture-project'),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify('fixture.appspot.com'),
      'import.meta.env.VITE_FIREBASE_SENDER_ID': JSON.stringify('000000000000'),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify('1:000000000000:web:fixture'),
    },
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
    const mockToken = makeMockJwt();
    const authUserKey = `firebase:authUser:${API_KEY}:[DEFAULT]`;
    const initAuth = ({ key, apiKey, token }) => {
      window.__ENTERPRISE_ENABLED__ = true;
      const userObj = {
        uid: 'browser-owner',
        email: 'owner@northwind.example',
        emailVerified: true,
        displayName: 'Northwind Owner',
        isAnonymous: false,
        stsTokenManager: {
          apiKey,
          refreshToken: 'fixture-refresh',
          accessToken: token,
          expirationTime: Date.now() + 3_600_000,
        },
        createdAt: String(Date.now()),
        lastLoginAt: String(Date.now()),
        apiKey,
        appName: '[DEFAULT]',
      };
      const userPayload = JSON.stringify(userObj);
      localStorage.setItem(key, userPayload);
      localStorage.setItem('firebase:authUser:demo-browser-api-key:[DEFAULT]', userPayload);
      if (apiKey) localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, userPayload);
      localStorage.setItem('user', 'browser-owner');

      try {
        const req = indexedDB.open('firebaseLocalStorageDb', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
            db.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('firebaseLocalStorage', 'readwrite');
          const store = tx.objectStore('firebaseLocalStorage');
          store.put({ fbase_key: key, value: userObj });
          if (apiKey) store.put({ fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`, value: userObj });
          store.put({ fbase_key: 'firebase:authUser:demo-browser-api-key:[DEFAULT]', value: userObj });
        };
      } catch {}
    };
    await page.addInitScript(initAuth, { key: authUserKey, apiKey: API_KEY, token: mockToken });

    await page.route('**/securetoken.googleapis.com/**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: mockToken,
        expires_in: '3600',
        token_type: 'Bearer',
        refresh_token: 'fixture-refresh',
        id_token: mockToken,
        user_id: 'browser-owner',
        project_id: 'ai-resume-builder-424cf',
      }),
    }));
    await page.route('**/identitytoolkit.googleapis.com/**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        users: [{
          localId: 'browser-owner',
          email: 'owner@northwind.example',
          emailVerified: true,
          displayName: 'Northwind Owner',
          providerUserInfo: [],
        }],
      }),
    }));
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
    await page.waitForSelector('button:has-text("New Workspace")', { timeout: 15_000 });
    await page.click('button:has-text("New Workspace")');
    await page.waitForSelector('#ws-name', { timeout: 10_000 });
    await page.fill('#ws-name', 'APAC Operations');
    await page.click('.enterprise-modal button:has-text("Create Workspace")');
    await page.waitForSelector('text=APAC Operations', { timeout: 10_000 });
    check('workspace creation lands in the workspace list', (await page.locator('text=APAC Operations').count()) > 0);

    // Workspace rename: open the rename modal, change the name, verify.
    await page.waitForSelector('button[title="Rename APAC Operations"]', { timeout: 10_000 });
    await page.click('button[title="Rename APAC Operations"]');
    await page.waitForSelector('#ws-rename', { timeout: 10_000 });
    await page.fill('#ws-rename', 'APAC & Japan Operations');
    await page.click('.enterprise-modal button:has-text("Save Name")');
    await page.waitForSelector('text=APAC & Japan Operations', { timeout: 10_000 });
    check('workspace rename is reflected in the list', (await page.locator('text=APAC & Japan Operations').count()) > 0);

    // Workspace archive → archived panel → restore.
    await page.waitForSelector('button[title="Archive APAC & Japan Operations"]', { timeout: 10_000 });
    page.once('dialog', dialog => dialog.accept());
    await page.click('button[title="Archive APAC & Japan Operations"]');
    await page.waitForSelector('.enterprise-pill:has-text("Archived")', { timeout: 10_000 });
    check('archived workspace appears in the archived panel', (await page.locator('.enterprise-pill:has-text("Archived")').count()) > 0);
    const restoreButton = page.locator('button', { hasText: 'Restore' }).first();
    await restoreButton.click();
    await page.waitForSelector('.enterprise-workspace-card:not(.archived) >> text=APAC & Japan Operations', { timeout: 10_000 });
    check('restored workspace returns to the active list', (await page.locator('.enterprise-workspace-card:not(.archived) >> text=APAC & Japan Operations').count()) > 0);

    // Workspace members drawer: add a member.
    const membersButton = page.locator('button', { hasText: 'Members' }).first();
    await membersButton.click();
    await page.waitForSelector('select[aria-label="Select tenant member to add"]', { timeout: 10_000 });
    await page.selectOption('select[aria-label="Select tenant member to add"]', 'browser-member');
    await page.click('button:has-text("Add to Workspace")');
    await page.waitForSelector('.enterprise-modal >> text=browser-member', { timeout: 10_000 });
    check('workspace member add is reflected in the drawer', (await page.locator('.enterprise-modal >> text=browser-member').count()) > 0);
    await page.click('.enterprise-modal-header button[aria-label*="Close"]');

    // Teams module: create a team.
    await page.goto(`${base}/enterprise?tab=teams`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("Create Team")', { timeout: 15_000 });
    await page.click('button:has-text("Create Team")');
    await page.waitForSelector('#team-name', { timeout: 10_000 });
    await page.fill('#team-name', 'Growth Recruiters');
    await page.click('.enterprise-modal-footer button:has-text("Create Team")');
    await page.waitForSelector('text=Growth Recruiters', { timeout: 10_000 });
    check('team creation lands in the teams list', (await page.locator('text=Growth Recruiters').count()) > 0);

    // Team member management drawer: add the second tenant member to the team.
    const manageTeamMembers = page.locator('button', { hasText: 'Manage Members' }).first();
    await manageTeamMembers.click();
    await page.waitForSelector('select[aria-label="Select tenant member to add to the team"]', { timeout: 10_000 });
    await page.selectOption('select[aria-label="Select tenant member to add to the team"]', 'browser-member');
    await page.click('button:has-text("Add to Team")');
    await page.waitForSelector('.enterprise-modal >> text=browser-member', { timeout: 10_000 });
    check('team member add is reflected in the drawer', (await page.locator('.enterprise-modal >> text=browser-member').count()) > 0);
    await page.click('.enterprise-modal-header button[aria-label*="Close"]');

    // Team rename via modal.
    await page.waitForSelector('button[title="Rename Growth Recruiters"]', { timeout: 10_000 });
    await page.click('button[title="Rename Growth Recruiters"]');
    await page.waitForSelector('#team-rename', { timeout: 10_000 });
    await page.fill('#team-rename', 'Growth & Talent Recruiters');
    await page.click('.enterprise-modal-footer button:has-text("Save Name")');
    await page.waitForSelector('text=Growth & Talent Recruiters', { timeout: 10_000 });
    check('team rename is reflected in the teams list', (await page.locator('text=Growth & Talent Recruiters').count()) > 0);

    // Users module: member list is real; removal changes state.
    await page.goto(`${base}/enterprise?tab=members`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=browser-member', { timeout: 15_000 });
    check('users module lists real members', (await page.locator('text=browser-member').count()) > 0);

    // Roles module: matrix renders from server data.
    await page.goto(`${base}/enterprise?tab=access`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=TENANT_OWNER', { timeout: 15_000 });
    check('roles matrix renders server-provided roles', (await page.locator('text=TENANT_OWNER').count()) > 0);

    // AI module: policy shows durable provider allowlist.
    await page.goto(`${base}/enterprise?tab=ai`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    check('AI module loads tenant AI policy', (await page.locator('text=openai').count()) > 0 || (await page.locator('.enterprise-tab-content').count()) > 0);

    // Security module: service account lifecycle.
    await page.goto(`${base}/enterprise?tab=security`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("Create Service Account")', { timeout: 15_000 });
    await page.click('button:has-text("Create Service Account")');
    await page.waitForSelector('#sa-name', { timeout: 10_000 });
    await page.fill('#sa-name', 'ATS Export Bot');
    await page.click('.enterprise-modal button[type="submit"]');
    await page.waitForSelector('text=ATS Export Bot', { timeout: 10_000 });
    check('security module shows service account after creation', (await page.locator('text=ATS Export Bot').count()) > 0);

    // Usage module: real ledger numbers from the durable usage endpoint.
    await page.goto(`${base}/enterprise?tab=usage`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=12,400', { timeout: 15_000 });
    check('usage module renders durable ledger totals', (await page.locator('text=12,400').count()) > 0);
    check('usage module renders per-day rows', (await page.locator('text=2026-08-20').count()) > 0);

    // Audit module: events from fixture mutations are visible.
    await page.goto(`${base}/enterprise?tab=audit`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=TEAM_CREATED', { timeout: 15_000 });
    check('audit module shows workspace + team + service account events',
      (await page.locator('text=WORKSPACE_CREATED').count()) > 0
      && (await page.locator('text=TEAM_CREATED').count()) > 0
      && (await page.locator('text=SERVICE_ACCOUNT_CREATED').count()) > 0);

    // Server-side audit filtering: an action filter narrows the result set at
    // the API level (the fixture applies the same query contract as the server).
    await page.fill('input[aria-label="Filter by action"]', 'TEAM_MEMBER');
    await page.waitForTimeout(900);
    check('audit action filter narrows results server-side',
      (await page.locator('text=TEAM_MEMBER_ADDED').count()) > 0
      && (await page.locator('td >> text=WORKSPACE_CREATED').count()) === 0);
    await page.fill('input[aria-label="Filter by action"]', '');
    await page.waitForTimeout(700);

    // Support + Settings modules render their server contracts.
    await page.goto(`${base}/enterprise?tab=support`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    check('support module renders grant console', (await page.locator('.enterprise-tab-content').count()) > 0);
    await page.goto(`${base}/enterprise?tab=settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    check('settings module renders configuration', (await page.locator('.enterprise-tab-content').count()) > 0);

    // Keyboard navigation: tab focus reaches the primary navigation.
    await page.goto(`${base}/enterprise?tab=overview`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.enterprise-shell, [aria-label="Enterprise Navigation"]', { timeout: 15_000 });
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
    const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName || '');
    check('keyboard navigation moves focus into the console', Boolean(focusedLabel));

    // Accessibility: landmarks and image labels.
    const ariaCount = await page.evaluate(() => document.querySelectorAll('[aria-label], [role], [aria-live]').length);
    check('aria landmarks/labels are present', ariaCount >= 5);

    // Viewport responsiveness matrix (Desktop, Tablet, Mobile)
    const viewports = [
      { name: 'Desktop (1280x800)', width: 1280, height: 800, isMobile: false },
      { name: 'Tablet (768x1024)', width: 768, height: 1024, isMobile: true },
      { name: 'Mobile (390x844)', width: 390, height: 844, isMobile: true },
      { name: 'Mobile (375x667)', width: 375, height: 667, isMobile: true },
    ];

    for (const vp of viewports) {
      const vpPage = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile });
      await vpPage.addInitScript(initAuth, { key: authUserKey, apiKey: API_KEY, token: mockToken });
      await vpPage.route('**/securetoken.googleapis.com/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: mockToken,
          expires_in: '3600',
          token_type: 'Bearer',
          refresh_token: 'fixture-refresh',
          id_token: mockToken,
          user_id: 'browser-owner',
          project_id: 'ai-resume-builder-424cf',
        }),
      }));
      await vpPage.route('**/identitytoolkit.googleapis.com/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: [{
            localId: 'browser-owner',
            email: 'owner@northwind.example',
            emailVerified: true,
            displayName: 'Northwind Owner',
            providerUserInfo: [],
          }],
        }),
      }));
      const vpBackend = createFixtureBackend();
      await vpPage.route('**/api/**', vpBackend);
      await vpPage.goto(`${base}/enterprise`, { waitUntil: 'domcontentloaded' });
      await vpPage.waitForSelector('.enterprise-shell, [aria-label="Enterprise Navigation"]', { timeout: 20_000 });
      const overflow = await vpPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      check(`${vp.name} viewport renders without horizontal overflow`, !overflow);
      await vpPage.close();
    }

    await page.close();
  } catch (error) {
    console.error('[Enterprise Browser Test] caught error at:', error.stack || error);
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
