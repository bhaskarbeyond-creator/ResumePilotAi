/**
 * Shared stateful Enterprise fixture backend for browser-level testing.
 *
 * Exports a realistic in-memory implementation of the /api/enterprise/**
 * contract (mirroring backend/routes/enterprise.js response shapes) plus the
 * auth-session seeding helpers, so Playwright suites and visual-capture
 * harnesses drive the REAL frontend against deterministic, decision-rich data
 * without contacting Firebase or the production backend.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import { rejectFirebaseDataPlaneRequests } from './firebase-data-plane-guard.mjs';

export function readEnvKey() {
  for (const file of ['.env', 'backend/.env']) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const match = content.match(/VITE_FIREBASE_KEY=([^\r\n]+)/);
      if (match) return match[1].trim();
    } catch { /* optional */ }
  }
  return 'demo-browser-api-key';
}

export const API_KEY = process.env.VITE_FIREBASE_KEY || readEnvKey();

export function makeMockJwt(payload = {}) {
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

export function viteFixtureDefines(overrides = {}) {
  return {
    'import.meta.env.VITE_ENTERPRISE_TENANCY_ENABLED': JSON.stringify('true'),
    'import.meta.env.VITE_FIREBASE_KEY': JSON.stringify(API_KEY),
    'import.meta.env.VITE_FIREBASE_DOMAIN': JSON.stringify('fixture.firebaseapp.com'),
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('fixture-project'),
    'import.meta.env.VITE_FIREBASE_SENDER_ID': JSON.stringify('000000000000'),
    'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify('1:000000000000:web:fixture'),
    ...overrides,
  };
}

const DAY_MS = 86_400_000;
const uuid = () => crypto.randomUUID();
const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();

/** Deterministic, decision-rich seed resembling a mid-size enterprise tenant. */
export function seedEnterpriseState({ platformAdmin = true, permissions = ['*'], roles = ['TENANT_OWNER'] } = {}) {
  const tenantId = uuid();
  const wsDefault = { id: uuid(), tenantId, name: 'Default Workspace', isDefault: true, lifecycleState: 'ACTIVE', createdAt: iso(90 * DAY_MS) };
  const wsEng = { id: uuid(), tenantId, name: 'Engineering', isDefault: false, lifecycleState: 'ACTIVE', createdAt: iso(60 * DAY_MS) };
  const wsSales = { id: uuid(), tenantId, name: 'Sales & Partnerships', isDefault: false, lifecycleState: 'ACTIVE', createdAt: iso(45 * DAY_MS) };
  const wsLegacy = { id: uuid(), tenantId, name: 'Legacy Migration', isDefault: false, lifecycleState: 'ARCHIVED', createdAt: iso(200 * DAY_MS) };

  const mk = (principalId, roles, status, workspaceId, extra = {}) => ({
    id: uuid(), tenantId, principalId, workspaceId, roles, status,
    createdAt: iso(Math.random() * 80 * DAY_MS), ...extra,
  });

  const memberships = [
    mk('browser-owner', ['TENANT_OWNER'], 'ACTIVE', wsDefault.id),
    mk('ava.chen', ['TENANT_ADMIN'], 'ACTIVE', wsDefault.id),
    mk('liam.patel', ['WORKSPACE_MANAGER'], 'ACTIVE', wsEng.id),
    mk('mia.johnson', ['MEMBER'], 'ACTIVE', wsEng.id),
    mk('noah.garcia', ['MEMBER'], 'ACTIVE', wsEng.id),
    mk('emma.smith', ['MEMBER'], 'ACTIVE', wsSales.id),
    mk('lucas.brown', ['VIEWER'], 'ACTIVE', wsSales.id),
    mk('sofia.rossi', ['MEMBER'], 'SUSPENDED', wsEng.id),
    mk('ethan.kim', ['MEMBER'], 'SUSPENDED', wsDefault.id),
    mk('', ['MEMBER'], 'INVITED', wsEng.id, { invitationEmail: 'grace.lee@northwind.example', principalId: 'invite:grace.lee@northwind.example' }),
    mk('', ['VIEWER'], 'INVITED', wsSales.id, { invitationEmail: 'oliver.wang@northwind.example', principalId: 'invite:oliver.wang@northwind.example' }),
    mk('recruiting-bot', ['security-auditor'], 'ACTIVE', wsDefault.id),
  ];

  const teams = [
    { id: uuid(), tenantId, workspaceId: wsEng.id, name: 'Platform Engineering', status: 'ACTIVE', leadPrincipalId: 'liam.patel', createdAt: iso(58 * DAY_MS) },
    { id: uuid(), tenantId, workspaceId: wsEng.id, name: 'AI Enablement', status: 'ACTIVE', leadPrincipalId: 'mia.johnson', createdAt: iso(40 * DAY_MS) },
    { id: uuid(), tenantId, workspaceId: wsSales.id, name: 'EMEA Accounts', status: 'ACTIVE', leadPrincipalId: 'emma.smith', createdAt: iso(30 * DAY_MS) },
    { id: uuid(), tenantId, workspaceId: wsDefault.id, name: 'Talent Ops (retired)', status: 'ARCHIVED', leadPrincipalId: null, createdAt: iso(150 * DAY_MS) },
  ];

  const teamMembers = [
    { id: uuid(), teamId: teams[0].id, workspaceId: wsEng.id, principalId: 'liam.patel', status: 'ACTIVE' },
    { id: uuid(), teamId: teams[0].id, workspaceId: wsEng.id, principalId: 'noah.garcia', status: 'ACTIVE' },
    { id: uuid(), teamId: teams[1].id, workspaceId: wsEng.id, principalId: 'mia.johnson', status: 'ACTIVE' },
    { id: uuid(), teamId: teams[2].id, workspaceId: wsSales.id, principalId: 'emma.smith', status: 'ACTIVE' },
    { id: uuid(), teamId: teams[2].id, workspaceId: wsSales.id, principalId: 'lucas.brown', status: 'ACTIVE' },
  ];

  const workspaceMembers = [
    { id: uuid(), workspaceId: wsEng.id, principalId: 'liam.patel', status: 'ACTIVE' },
    { id: uuid(), workspaceId: wsEng.id, principalId: 'mia.johnson', status: 'ACTIVE' },
    { id: uuid(), workspaceId: wsEng.id, principalId: 'noah.garcia', status: 'ACTIVE' },
    { id: uuid(), workspaceId: wsSales.id, principalId: 'emma.smith', status: 'ACTIVE' },
    { id: uuid(), workspaceId: wsSales.id, principalId: 'lucas.brown', status: 'ACTIVE' },
  ];

  const serviceAccounts = [
    { id: uuid(), tenantId, workspaceId: wsDefault.id, displayName: 'ci-resume-render', status: 'ACTIVE', createdAt: iso(30 * DAY_MS), scopes: ['resource.read', 'resource.write'], apiKeyId: uuid(), apiKeyPrefix: 'rpa_ci4f9a2c', expiresAt: iso(-60 * DAY_MS), lastRotatedAt: iso(75 * DAY_MS) },
    { id: uuid(), tenantId, workspaceId: wsDefault.id, displayName: 'hris-sync', status: 'ACTIVE', createdAt: iso(90 * DAY_MS), scopes: ['resource.read'], apiKeyId: uuid(), apiKeyPrefix: 'rpa_hr77b0e1', expiresAt: null, lastRotatedAt: iso(88 * DAY_MS) },
  ];

  const jobs = [
    { jobId: crypto.randomBytes(16).toString('hex'), jobType: 'resume.render', tenantId, workspaceId: wsDefault.id, status: 'QUEUED', attemptCount: 0, maxAttempts: 5, correlationId: 'corr-render-1', lastError: null, rejectedReason: null, createdAt: iso(600_000) },
    { jobId: crypto.randomBytes(16).toString('hex'), jobType: 'export.tenant-data', tenantId, workspaceId: wsDefault.id, status: 'DEAD_LETTER', attemptCount: 5, maxAttempts: 5, correlationId: 'corr-export-9', lastError: 'STORAGE_TIMEOUT after 30000ms', rejectedReason: null, createdAt: iso(3 * DAY_MS) },
  ];

  const resources = [
    { id: uuid(), tenantId, workspaceId: wsEng.id, resourceType: 'resume', ownerPrincipalId: 'mia.johnson', classification: 'CONFIDENTIAL', revision: 3, payload: { title: 'Senior Backend Engineer — J. Alvarez' }, createdAt: iso(4 * DAY_MS), updatedAt: iso(DAY_MS) },
    { id: uuid(), tenantId, workspaceId: wsEng.id, resourceType: 'resume', ownerPrincipalId: 'noah.garcia', classification: 'CONFIDENTIAL', revision: 1, payload: { title: 'Staff SRE — P. Novak' }, createdAt: iso(9 * DAY_MS), updatedAt: iso(2 * DAY_MS) },
    { id: uuid(), tenantId, workspaceId: wsSales.id, resourceType: 'resume', ownerPrincipalId: 'emma.smith', classification: 'INTERNAL', revision: 2, payload: { title: 'Enterprise AE — D. Okafor' }, createdAt: iso(12 * DAY_MS), updatedAt: iso(6 * DAY_MS) },
  ];

  const supportGrants = [
    { id: uuid(), tenantId, status: 'ACTIVE', reason: 'Investigating export job dead-letter (ticket #4821)', scopes: ['tenant.audit.read'], supportSubjectId: 'support.rita', grantedBy: 'browser-owner', createdAt: iso(0.5 * DAY_MS), expiresAt: iso(-0.5 * DAY_MS) },
    { id: uuid(), tenantId, status: 'REVOKED', reason: 'Quota reconciliation assistance', scopes: ['tenant.usage.read'], supportSubjectId: 'support.omar', grantedBy: 'ava.chen', createdAt: iso(20 * DAY_MS), expiresAt: iso(19 * DAY_MS), revokedAt: iso(19.5 * DAY_MS) },
  ];

  const auditSeedSpecs = [
    ['TENANT_PROVISIONED', 'tenant.lifecycle', 'INFO', 'SUCCESS', 'system', 88],
    ['WORKSPACE_CREATED', 'workspace.lifecycle', 'INFO', 'SUCCESS', 'browser-owner', 60],
    ['TENANT_MEMBERSHIP_GRANTED', 'iam.membership', 'INFO', 'SUCCESS', 'browser-owner', 55],
    ['TEAM_CREATED', 'team.lifecycle', 'INFO', 'SUCCESS', 'ava.chen', 40],
    ['SERVICE_ACCOUNT_CREATED', 'security.m2m', 'NOTICE', 'SUCCESS', 'browser-owner', 30],
    ['CONFIGURATION_UPDATED', 'governance.policy', 'NOTICE', 'SUCCESS', 'ava.chen', 21],
    ['AI_GENERATION_COMPLETED', 'ai.generation', 'INFO', 'SUCCESS', 'mia.johnson', 8],
    ['MEMBERSHIP_SUSPENDED', 'iam.membership', 'WARNING', 'SUCCESS', 'ava.chen', 6],
    ['SUPPORT_GRANT_ISSUED', 'support.access', 'WARNING', 'SUCCESS', 'browser-owner', 0.5],
    ['EXPORT_JOB_DEAD_LETTERED', 'queue.jobs', 'ERROR', 'FAILURE', 'system', 3],
    ['LOGIN_MFA_DENIED', 'security.session', 'WARNING', 'DENIED', 'ethan.kim', 2],
    ['RESOURCE_UPDATED', 'documents.resume', 'INFO', 'SUCCESS', 'mia.johnson', 1],
  ];
  const audit = auditSeedSpecs.map(([action, category, severity, outcome, actor, daysAgo]) => ({
    id: uuid(), tenantId, workspaceId: wsDefault.id, principalId: actor, subjectId: actor,
    actorSubjectId: actor, actorType: actor === 'system' ? 'system' : 'user', action, category,
    severity, outcome, resourceType: null, resourceId: null, correlationId: `corr-${action.toLowerCase()}`,
    metadata: { source: 'fixture-seed' }, occurredAt: iso(daysAgo * DAY_MS),
  }));
  // Bulk history so cursor pagination ("Load more events") is genuinely
  // exercised: PAGE_SIZE in the audit module is 100.
  for (let i = 0; i < 110; i += 1) {
    const actor = ['mia.johnson', 'noah.garcia', 'emma.smith', 'ava.chen'][i % 4];
    audit.push({
      id: uuid(), tenantId, workspaceId: i % 2 === 0 ? wsEng.id : wsSales.id,
      principalId: actor, subjectId: actor, actorSubjectId: actor, actorType: 'user',
      action: 'AI_GENERATION_COMPLETED', category: 'ai.generation', severity: 'INFO', outcome: 'SUCCESS',
      resourceType: null, resourceId: null, correlationId: `corr-bulk-${i}`,
      metadata: { source: 'fixture-bulk' }, occurredAt: iso((10 + i * 0.5) * DAY_MS),
    });
  }

  const byDay = [];
  for (let i = 29; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
    const requests = Math.max(2, Math.round(30 + 25 * Math.sin(i / 4) + (29 - i) * 1.2));
    byDay.push({ day, requests, inputTokens: requests * 310, outputTokens: requests * 190, estimatedCostMicros: requests * 5800 });
  }
  const totalRequests = byDay.reduce((sum, d) => sum + d.requests, 0);

  const usage = {
    requests: totalRequests,
    inputTokens: byDay.reduce((s, d) => s + d.inputTokens, 0),
    outputTokens: byDay.reduce((s, d) => s + d.outputTokens, 0),
    estimatedCostMicros: byDay.reduce((s, d) => s + d.estimatedCostMicros, 0),
    days: 30,
    byDay,
    byWorkspace: {
      [wsEng.id]: { requests: Math.round(totalRequests * 0.62), inputTokens: Math.round(totalRequests * 0.62) * 310, outputTokens: Math.round(totalRequests * 0.62) * 190 },
      [wsSales.id]: { requests: Math.round(totalRequests * 0.23), inputTokens: Math.round(totalRequests * 0.23) * 310, outputTokens: Math.round(totalRequests * 0.23) * 190 },
      [wsDefault.id]: { requests: Math.round(totalRequests * 0.15), inputTokens: Math.round(totalRequests * 0.15) * 310, outputTokens: Math.round(totalRequests * 0.15) * 190 },
    },
    byProvider: { openai: Math.round(totalRequests * 0.8), anthropic: Math.round(totalRequests * 0.2) },
    byModel: { 'gpt-4o-mini': Math.round(totalRequests * 0.65), 'gpt-4o': Math.round(totalRequests * 0.15), 'claude-3-5-haiku': Math.round(totalRequests * 0.2) },
    byUser: {
      'mia.johnson': { requests: Math.round(totalRequests * 0.4), inputTokens: Math.round(totalRequests * 0.4) * 310, outputTokens: Math.round(totalRequests * 0.4) * 190 },
      'noah.garcia': { requests: Math.round(totalRequests * 0.25), inputTokens: Math.round(totalRequests * 0.25) * 310, outputTokens: Math.round(totalRequests * 0.25) * 190 },
      'emma.smith': { requests: Math.round(totalRequests * 0.2), inputTokens: Math.round(totalRequests * 0.2) * 310, outputTokens: Math.round(totalRequests * 0.2) * 190 },
      'browser-owner': { requests: Math.round(totalRequests * 0.15), inputTokens: Math.round(totalRequests * 0.15) * 310, outputTokens: Math.round(totalRequests * 0.15) * 190 },
    },
  };

  const usageEvents = Array.from({ length: 12 }, (_, i) => ({
    id: uuid(), tenantId, workspaceId: i % 3 === 0 ? wsSales.id : wsEng.id,
    principalId: ['mia.johnson', 'noah.garcia', 'emma.smith'][i % 3],
    provider: i % 5 === 0 ? 'anthropic' : 'openai',
    model: i % 5 === 0 ? 'claude-3-5-haiku' : 'gpt-4o-mini',
    operation: ['resume.summary', 'resume.bullets', 'cover-letter'][i % 3],
    inputTokens: 300 + i * 17, outputTokens: 180 + i * 11,
    estimatedCostMicros: 5200 + i * 130, correlationId: `corr-gen-${i}`,
    createdAt: iso(i * 5 * 3_600_000),
  }));

  const configuration = {
    revision: 7,
    aiPolicy: { version: 3, allowedProviders: ['openai', 'anthropic'], primaryModel: 'gpt-4o-mini', fallbackModel: 'claude-3-5-haiku', allowedModels: ['gpt-4o-mini', 'gpt-4o', 'claude-3-5-haiku'] },
    quotaPolicy: { aiRequestsPerMinute: 12, aiRequestsPerDay: 1500, renderConcurrency: 2 },
    retentionPolicy: { aiMemoryEnabled: false, retentionDays: 30 },
    securityPolicy: { requireMfaForAdmins: true, supportAccessRequiresApproval: true },
    identityPolicy: { ssoMode: 'NONE', scimEnabled: false, sessionMaxMinutes: 480 },
    customRoles: {
      'security-auditor': { label: 'Security Auditor', permissions: ['tenant.audit.read', 'tenant.security.read', 'tenant.usage.read'] },
    },
  };

  const platformTenants = [
    { id: tenantId, slug: 'northwind-careers', displayName: 'Northwind Careers', lifecycleState: 'ACTIVE', isolationTier: 'ENTERPRISE', createdAt: iso(90 * DAY_MS) },
    { id: uuid(), slug: 'globex-talent', displayName: 'Globex Talent', lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', createdAt: iso(70 * DAY_MS) },
    { id: uuid(), slug: 'initech-hr', displayName: 'Initech HR', lifecycleState: 'SUSPENDED', isolationTier: 'STANDARD', createdAt: iso(160 * DAY_MS) },
  ];

  return {
    platformAdmin,
    permissions,
    roles,
    tenant: { id: tenantId, slug: 'northwind-careers', displayName: 'Northwind Careers', lifecycleState: 'ACTIVE', isolationTier: 'ENTERPRISE' },
    workspaces: [wsDefault, wsEng, wsSales, wsLegacy],
    activeWorkspaceId: wsDefault.id,
    memberships, teams, teamMembers, workspaceMembers, serviceAccounts, jobs,
    resources, supportGrants, audit, usage, usageEvents, configuration, platformTenants,
  };
}

/** Route handler implementing the /api/enterprise/** contract over the seed state. */
export function createEnterpriseFixtureBackend(state = seedEnterpriseState()) {
  const activeWs = () => state.workspaces.find(ws => ws.id === state.activeWorkspaceId) || state.workspaces[0];
  const base = () => ({ tenantId: state.tenant.id, workspaceId: activeWs().id, principalId: 'browser-owner', subjectId: 'browser-owner', actorSubjectId: 'browser-owner', actorType: 'user' });
  const auditEvent = (action, extra = {}) => {
    const event = { id: uuid(), ...base(), action, category: extra.category || 'console.action', severity: 'INFO', outcome: 'SUCCESS', resourceType: null, resourceId: null, correlationId: 'corr-live', metadata: {}, occurredAt: new Date().toISOString(), ...extra };
    state.audit.push(event);
    return event;
  };

  const handler = async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch { body = {}; }
    const json = (payload, status = 200) => route.fulfill({ status, json: payload });

    // App-shell endpoints are part of every browser boot. Keep these fixtures
    // explicit so a missing route cannot be mistaken for a clean network run.
    if (path === '/api/platform/public-config' && method === 'GET') {
      return json({
        modules: { jobs: true, portfolio: true, blog: true, aiAssistant: true },
        subscriptions: { state: false, sandboxMode: true },
        website: { title: 'ResumePilot AI', description: 'Enterprise certification fixture', language: 'English', disabledLanguages: [], trackingCode: '', revision: 0 },
        systemHealth: { maintenanceMode: false, maintenanceMessage: '' },
        _settingsSource: 'mariadb-fixture',
      });
    }
    if (path === '/api/health' && method === 'GET') {
      return json({
        status: 'ok',
        authoritativeDatabase: 'MARIADB',
        firestoreDataPlane: 'REMOVED',
        systemHealth: { maintenanceMode: false, maintenanceMessage: '' },
      });
    }
    if (path === '/api/enterprise/status') return json({ enabled: true, apiVersion: 'tenant-foundation-v1' });
    if (path === '/api/enterprise/tenants' && method === 'GET') {
      return json({ tenants: [{ ...state.tenant, roles: ['TENANT_OWNER'], defaultWorkspaceId: state.workspaces[0].id, personalTenant: false }] });
    }
    if (path === '/api/enterprise/tenants' && method === 'POST') {
      const tenant = { id: uuid(), slug: String(body?.slug || 'new-tenant'), displayName: String(body?.displayName || 'New Tenant'), lifecycleState: 'ACTIVE', isolationTier: String(body?.isolationTier || 'STANDARD'), createdAt: new Date().toISOString() };
      state.platformTenants.push(tenant);
      auditEvent('TENANT_PROVISIONED', { category: 'tenant.lifecycle' });
      return json({ tenant }, 201);
    }
    if (path === '/api/enterprise/context') {
      const requested = body?.workspaceId || state.activeWorkspaceId;
      if (state.workspaces.some(ws => ws.id === requested && ws.lifecycleState === 'ACTIVE')) state.activeWorkspaceId = requested;
      const ws = activeWs();
      return json({
        context: { tenantId: state.tenant.id, workspaceId: ws.id, roles: state.roles || ['TENANT_OWNER'], permissions: state.permissions || ['*'], policyVersion: state.configuration.revision, dataPlane: { id: 'mysql-primary', type: 'MYSQL', region: 'default', routingVersion: 1 } },
        tenant: state.tenant,
        workspace: ws,
        platformAdmin: state.platformAdmin === true,
      });
    }
    if (path === '/api/enterprise/workspaces' && method === 'GET') {
      const includeArchived = ['1', 'true'].includes(String(url.searchParams.get('includeArchived') || ''));
      const rows = state.workspaces
        .filter(ws => includeArchived || ws.lifecycleState === 'ACTIVE')
        .map(ws => ({ ...ws, active: ws.id === state.activeWorkspaceId }));
      return json({ workspaces: rows });
    }
    if (path === '/api/enterprise/workspaces' && method === 'POST') {
      const workspace = { id: uuid(), tenantId: state.tenant.id, name: String(body?.name || 'Workspace'), isDefault: false, lifecycleState: 'ACTIVE', createdAt: new Date().toISOString() };
      state.workspaces.push(workspace);
      auditEvent('WORKSPACE_CREATED', { category: 'workspace.lifecycle' });
      return json({ workspace }, 201);
    }
    {
      const wsMatch = path.match(/^\/api\/enterprise\/workspaces\/([^/]+)$/);
      if (wsMatch && method === 'PATCH') {
        const workspace = state.workspaces.find(entry => entry.id === wsMatch[1]);
        if (!workspace) return json({ error: { code: 'WORKSPACE_NOT_FOUND' } }, 404);
        workspace.name = String(body?.name || workspace.name);
        auditEvent('WORKSPACE_UPDATED', { category: 'workspace.lifecycle' });
        return json({ workspace });
      }
      const lifecycleMatch = path.match(/^\/api\/enterprise\/workspaces\/([^/]+)\/(archive|restore)$/);
      if (lifecycleMatch && method === 'POST') {
        const workspace = state.workspaces.find(entry => entry.id === lifecycleMatch[1]);
        if (!workspace) return json({ error: { code: 'WORKSPACE_NOT_FOUND' } }, 404);
        if (workspace.isDefault && lifecycleMatch[2] === 'archive') return json({ error: { code: 'WORKSPACE_DEFAULT_PROTECTED', message: 'The default workspace cannot be archived.' } }, 409);
        workspace.lifecycleState = lifecycleMatch[2] === 'archive' ? 'ARCHIVED' : 'ACTIVE';
        auditEvent(lifecycleMatch[2] === 'archive' ? 'WORKSPACE_ARCHIVED' : 'WORKSPACE_RESTORED', { category: 'workspace.lifecycle' });
        return json({ workspace });
      }
      const wsMembersMatch = path.match(/^\/api\/enterprise\/workspaces\/([^/]+)\/members$/);
      if (wsMembersMatch && method === 'GET') return json({ members: state.workspaceMembers.filter(member => member.workspaceId === wsMembersMatch[1] && member.status === 'ACTIVE') });
      if (wsMembersMatch && method === 'POST') {
        const member = { id: uuid(), workspaceId: wsMembersMatch[1], principalId: String(body?.principalId || ''), status: 'ACTIVE' };
        state.workspaceMembers.push(member);
        auditEvent('WORKSPACE_MEMBER_ADDED', { category: 'workspace.membership' });
        return json({ member }, 201);
      }
      const wsMemberMatch = path.match(/^\/api\/enterprise\/workspaces\/([^/]+)\/members\/([^/]+)$/);
      if (wsMemberMatch && method === 'DELETE') {
        state.workspaceMembers = state.workspaceMembers.filter(member => !(member.workspaceId === wsMemberMatch[1] && member.principalId === decodeURIComponent(wsMemberMatch[2])));
        auditEvent('WORKSPACE_MEMBER_REMOVED', { category: 'workspace.membership' });
        return route.fulfill({ status: 204, body: '' });
      }
    }
    if (path === '/api/enterprise/memberships' && method === 'GET') return json({ memberships: state.memberships });
    if (path === '/api/enterprise/memberships' && method === 'POST') {
      const invited = String(body?.status || '').toUpperCase() === 'INVITED' || (!body?.principalId && body?.invitationEmail);
      const membership = {
        id: uuid(), tenantId: state.tenant.id,
        principalId: invited ? `invite:${body?.invitationEmail}` : String(body?.principalId || ''),
        workspaceId: body?.workspaceId || activeWs().id,
        roles: Array.isArray(body?.roles) && body.roles.length ? body.roles : ['MEMBER'],
        status: invited ? 'INVITED' : 'ACTIVE',
        ...(invited ? { invitationEmail: String(body?.invitationEmail || '') } : {}),
        createdAt: new Date().toISOString(),
      };
      state.memberships.push(membership);
      auditEvent(invited ? 'TENANT_INVITATION_ISSUED' : 'TENANT_MEMBERSHIP_GRANTED', { category: 'iam.membership' });
      return json({ membership }, 201);
    }
    {
      const resendMatch = path.match(/^\/api\/enterprise\/memberships\/([^/]+)\/invitation-resend$/);
      if (resendMatch && method === 'POST') {
        const principalId = decodeURIComponent(resendMatch[1]);
        const membership = state.memberships.find(entry => entry.principalId === principalId);
        if (!membership) return json({ error: { code: 'MEMBERSHIP_NOT_FOUND' } }, 404);
        auditEvent('TENANT_INVITATION_RESENT', { category: 'iam.membership' });
        return json({ membership, resent: true });
      }
      const memberMatch = path.match(/^\/api\/enterprise\/memberships\/([^/]+)$/);
      if (memberMatch && method === 'PATCH') {
        const principalId = decodeURIComponent(memberMatch[1]);
        const membership = state.memberships.find(entry => entry.principalId === principalId);
        if (!membership) return json({ error: { code: 'MEMBERSHIP_NOT_FOUND' } }, 404);
        if (Array.isArray(body?.roles) && body.roles.length) membership.roles = body.roles;
        if (body?.status) membership.status = String(body.status).toUpperCase();
        if (body?.workspaceId) membership.workspaceId = String(body.workspaceId);
        auditEvent('TENANT_MEMBERSHIP_UPDATED', { category: 'iam.membership' });
        return json({ membership });
      }
      if (memberMatch && method === 'DELETE') {
        const principalId = decodeURIComponent(memberMatch[1]);
        state.memberships = state.memberships.filter(entry => entry.principalId !== principalId);
        auditEvent('TENANT_MEMBERSHIP_REMOVED', { category: 'iam.membership' });
        return route.fulfill({ status: 204, body: '' });
      }
    }
    if (path === '/api/enterprise/teams' && method === 'GET') {
      const includeArchived = ['1', 'true'].includes(String(url.searchParams.get('includeArchived') || ''));
      return json({ teams: state.teams.filter(team => includeArchived || team.status === 'ACTIVE') });
    }
    if (path === '/api/enterprise/teams' && method === 'POST') {
      const team = { id: uuid(), tenantId: state.tenant.id, workspaceId: body?.workspaceId || activeWs().id, name: String(body?.name || 'Team'), status: 'ACTIVE', leadPrincipalId: body?.leadPrincipalId || null, createdAt: new Date().toISOString() };
      state.teams.push(team);
      auditEvent('TEAM_CREATED', { category: 'team.lifecycle' });
      return json({ team }, 201);
    }
    {
      const teamMatch = path.match(/^\/api\/enterprise\/teams\/([^/]+)$/);
      if (teamMatch && method === 'PATCH') {
        const team = state.teams.find(entry => entry.id === teamMatch[1]);
        if (!team) return json({ error: { code: 'TEAM_NOT_FOUND' } }, 404);
        if (body?.name) team.name = String(body.name);
        if ('leadPrincipalId' in (body || {})) team.leadPrincipalId = body.leadPrincipalId || null;
        auditEvent('TEAM_UPDATED', { category: 'team.lifecycle' });
        return json({ team });
      }
      const teamLifecycle = path.match(/^\/api\/enterprise\/teams\/([^/]+)\/(archive|restore)$/);
      if (teamLifecycle && method === 'POST') {
        const team = state.teams.find(entry => entry.id === teamLifecycle[1]);
        if (!team) return json({ error: { code: 'TEAM_NOT_FOUND' } }, 404);
        team.status = teamLifecycle[2] === 'archive' ? 'ARCHIVED' : 'ACTIVE';
        auditEvent(teamLifecycle[2] === 'archive' ? 'TEAM_ARCHIVED' : 'TEAM_RESTORED', { category: 'team.lifecycle' });
        return json({ team });
      }
      const teamMembersMatch = path.match(/^\/api\/enterprise\/teams\/([^/]+)\/members$/);
      if (teamMembersMatch && method === 'GET') return json({ members: state.teamMembers.filter(member => member.teamId === teamMembersMatch[1] && member.status === 'ACTIVE') });
      if (teamMembersMatch && method === 'POST') {
        const member = { id: uuid(), teamId: teamMembersMatch[1], workspaceId: activeWs().id, principalId: String(body?.principalId || ''), status: 'ACTIVE' };
        state.teamMembers.push(member);
        auditEvent('TEAM_MEMBER_ADDED', { category: 'team.membership' });
        return json({ member }, 201);
      }
      const teamMemberMatch = path.match(/^\/api\/enterprise\/teams\/([^/]+)\/members\/([^/]+)$/);
      if (teamMemberMatch && method === 'DELETE') {
        state.teamMembers = state.teamMembers.filter(member => !(member.teamId === teamMemberMatch[1] && member.principalId === decodeURIComponent(teamMemberMatch[2])));
        auditEvent('TEAM_MEMBER_REMOVED', { category: 'team.membership' });
        return route.fulfill({ status: 204, body: '' });
      }
    }
    if (path === '/api/enterprise/roles-matrix') {
      // Mirrors backend/enterprise/constants.js TENANT_ROLES exactly.
      return json({
        roles: {
          TENANT_OWNER: ['*'],
          TENANT_ADMIN: ['tenant.read', 'tenant.settings.write', 'tenant.members.read', 'tenant.members.invite', 'tenant.members.manage', 'tenant.roles.manage', 'tenant.workspaces.manage', 'tenant.audit.read', 'tenant.security.read', 'tenant.security.manage', 'tenant.ai.manage', 'tenant.integrations.manage', 'tenant.usage.read'],
          BILLING_ADMIN: ['tenant.read', 'tenant.billing.read', 'tenant.billing.manage', 'tenant.usage.read'],
          WORKSPACE_MANAGER: ['workspace.read', 'workspace.manage', 'workspace.members.manage', 'resource.read', 'resource.create', 'resource.update', 'resource.share', 'ai.use'],
          MEMBER: ['workspace.read', 'resource.read', 'resource.create', 'resource.update', 'ai.use'],
          VIEWER: ['workspace.read', 'resource.read'],
        },
        customRoles: state.configuration.customRoles,
      });
    }
    if (path === '/api/enterprise/resources' && method === 'GET') return json({ resources: state.resources });
    if (path === '/api/enterprise/resources' && method === 'POST') {
      const resource = { id: uuid(), tenantId: state.tenant.id, workspaceId: activeWs().id, resourceType: String(body?.resourceType || 'resume'), ownerPrincipalId: 'browser-owner', classification: String(body?.classification || 'PRIVATE'), revision: 1, payload: body?.payload || {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      state.resources.push(resource);
      auditEvent('RESOURCE_CREATED', { category: 'documents.resume' });
      return json({ resource }, 201);
    }
    {
      const resourceMatch = path.match(/^\/api\/enterprise\/resources\/([^/]+)$/);
      if (resourceMatch && method === 'DELETE') {
        state.resources = state.resources.filter(entry => entry.id !== resourceMatch[1]);
        auditEvent('RESOURCE_DELETED', { category: 'documents.resume' });
        return route.fulfill({ status: 204, body: '' });
      }
      if (resourceMatch && method === 'PATCH') {
        const resource = state.resources.find(entry => entry.id === resourceMatch[1]);
        if (!resource) return json({ error: { code: 'RESOURCE_NOT_FOUND' } }, 404);
        if (body?.payload) resource.payload = { ...resource.payload, ...body.payload };
        resource.revision = Number(resource.revision || 0) + 1;
        resource.updatedAt = new Date().toISOString();
        auditEvent('RESOURCE_UPDATED', { category: 'documents.resume' });
        return json({ resource });
      }
    }
    if (path === '/api/enterprise/configuration' && method === 'GET') return json({ configuration: state.configuration });
    if (path === '/api/enterprise/configuration' && method === 'PATCH') {
      const merge = (key) => { if (body?.[key] && typeof body[key] === 'object') state.configuration[key] = { ...state.configuration[key], ...body[key] }; };
      ['aiPolicy', 'quotaPolicy', 'retentionPolicy', 'securityPolicy', 'identityPolicy'].forEach(merge);
      if (body?.customRoles && typeof body.customRoles === 'object') state.configuration.customRoles = body.customRoles;
      state.configuration.revision += 1;
      auditEvent('CONFIGURATION_UPDATED', { category: 'governance.policy', severity: 'NOTICE' });
      return json({ configuration: state.configuration });
    }
    if (path === '/api/enterprise/tenant' && method === 'PATCH') {
      if (body?.displayName) state.tenant.displayName = String(body.displayName);
      auditEvent('TENANT_PROFILE_UPDATED', { category: 'tenant.lifecycle' });
      return json({ tenant: state.tenant });
    }
    if (path === '/api/enterprise/data/export') {
      auditEvent('TENANT_DATA_EXPORTED', { category: 'governance.data', severity: 'NOTICE' });
      return json({ export: { tenant: state.tenant, memberships: state.memberships, workspaces: state.workspaces, teams: state.teams, generatedAt: new Date().toISOString() } });
    }
    if (path === '/api/enterprise/service-accounts' && method === 'GET') return json({ serviceAccounts: state.serviceAccounts.map(account => ({ ...account })) });
    if (path === '/api/enterprise/service-accounts' && method === 'POST') {
      const account = { id: uuid(), tenantId: state.tenant.id, workspaceId: activeWs().id, displayName: String(body?.displayName || 'Account'), status: 'ACTIVE', createdAt: new Date().toISOString(), scopes: body?.scopes || ['resource.read'], apiKeyId: uuid(), apiKeyPrefix: `rpa_${crypto.randomBytes(4).toString('hex')}`, expiresAt: null };
      state.serviceAccounts.push(account);
      auditEvent('SERVICE_ACCOUNT_CREATED', { category: 'security.m2m', severity: 'NOTICE' });
      return json({ serviceAccount: account, apiKey: `rpa_${crypto.randomBytes(12).toString('base64url')}`, apiKeyId: account.apiKeyId, apiKeyPrefix: account.apiKeyPrefix, scopes: account.scopes, expiresAt: null }, 201);
    }
    {
      const revokeMatch = path.match(/^\/api\/enterprise\/service-accounts\/([^/]+)\/revoke$/);
      if (revokeMatch && method === 'POST') {
        state.serviceAccounts = state.serviceAccounts.filter(entry => entry.id !== revokeMatch[1]);
        auditEvent('SERVICE_ACCOUNT_REVOKED', { category: 'security.m2m', severity: 'NOTICE' });
        return route.fulfill({ status: 204, body: '' });
      }
      const rotateMatch = path.match(/^\/api\/enterprise\/service-accounts\/([^/]+)\/rotate$/);
      if (rotateMatch && method === 'POST') {
        const account = state.serviceAccounts.find(entry => entry.id === rotateMatch[1]);
        if (!account) return json({ error: { code: 'SERVICE_ACCOUNT_NOT_FOUND' } }, 404);
        account.apiKeyId = uuid();
        account.apiKeyPrefix = `rpa_${crypto.randomBytes(4).toString('hex')}`;
        account.lastRotatedAt = new Date().toISOString();
        auditEvent('SERVICE_ACCOUNT_ROTATED', { category: 'security.m2m', severity: 'NOTICE' });
        return json({ serviceAccount: account, apiKey: `rpa_${crypto.randomBytes(12).toString('base64url')}`, apiKeyId: account.apiKeyId, apiKeyPrefix: account.apiKeyPrefix });
      }
    }
    if (path === '/api/enterprise/queue/status') {
      const deadLetterCount = state.jobs.filter(job => job.status === 'DEAD_LETTER').length;
      return json({ queue: { engine: 'mariadb-transactional-outbox', durable: true, configured: true, healthy: true, status: 'online', activeQueued: state.jobs.filter(job => job.status === 'QUEUED').length, deadLetterCount, counts: {}, signingConfigured: true } });
    }
    if (path === '/api/enterprise/queue/jobs' && method === 'GET') {
      const filter = url.searchParams.get('status');
      return json({ jobs: state.jobs.filter(job => !filter || job.status === filter) });
    }
    if (path === '/api/enterprise/queue/jobs' && method === 'POST') {
      const job = { jobId: crypto.randomBytes(16).toString('hex'), jobType: body?.jobType, tenantId: state.tenant.id, workspaceId: activeWs().id, status: 'QUEUED', attemptCount: 0, maxAttempts: 5, correlationId: 'corr-live', lastError: null, rejectedReason: null, createdAt: new Date().toISOString() };
      state.jobs.push(job);
      return json({ status: 'ENQUEUED', ...job }, 201);
    }
    if (path === '/api/enterprise/queue/replay') {
      const job = state.jobs.find(entry => entry.jobId === body?.jobId);
      if (job) { job.status = 'QUEUED'; job.attemptCount = 0; job.lastError = null; }
      auditEvent('QUEUE_JOB_REPLAYED', { category: 'queue.jobs' });
      return json({ status: job ? 'REPLAYED' : 'NOT_FOUND', jobId: body?.jobId });
    }
    if (path === '/api/enterprise/usage/ai') {
      const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') || 30)));
      const byDay = state.usage.byDay.slice(-days);
      const requests = byDay.reduce((sum, d) => sum + d.requests, 0);
      return json({ usage: { ...state.usage, days, byDay, requests } });
    }
    if (path === '/api/enterprise/usage/ai/events') return json({ events: state.usageEvents });
    if (path === '/api/enterprise/audit') {
      let events = [...state.audit].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
      const take = (name) => url.searchParams.get(name) || '';
      const outcome = take('outcome'); const action = take('action'); const actor = take('actor');
      const category = take('category'); const severity = take('severity');
      const since = take('since'); const until = take('until');
      if (outcome) events = events.filter(event => event.outcome === outcome.toUpperCase());
      if (severity) events = events.filter(event => event.severity === severity.toUpperCase());
      if (action) events = events.filter(event => String(event.action || '').toUpperCase().includes(action.toUpperCase()));
      if (actor) events = events.filter(event => String(event.actorSubjectId || event.principalId || '').toLowerCase().includes(actor.toLowerCase()));
      if (category) events = events.filter(event => String(event.category || '').toLowerCase().includes(category.toLowerCase()));
      if (since) events = events.filter(event => new Date(event.occurredAt) >= new Date(since));
      if (until) events = events.filter(event => new Date(event.occurredAt) <= new Date(until));
      const limit = Math.max(1, Math.min(200, Number(take('limit')) || 50));
      const cursor = Number(take('cursor')) || 0;
      const pageRows = events.slice(cursor, cursor + limit);
      const nextCursor = cursor + limit < events.length ? String(cursor + limit) : null;
      return json({ events: pageRows, nextCursor, total: events.length });
    }
    if (path === '/api/enterprise/observability/metrics') return json({ metrics: { sampleCount: 1284, p50: 42, p95: 180, p99: 320, errors: { clientErrors: 3, serverErrors: 1, authErrors: 1, dbErrors: 0, redisErrors: 0, queueErrors: 1, aiErrors: 1 } } });
    if (path === '/api/enterprise/data-plane/status') return json({ dataPlane: { provider: 'mysql', configured: true, durable: true, encryption: 'server-key', encryptionSecurityLevel: 'SERVER_SIDE_MASTER_KEY_ENVELOPE_AES_256_GCM', quotaStore: 'mariadb-atomic', queue: 'mariadb-transactional-outbox' } });
    if (path === '/api/enterprise/support-grants' && method === 'GET') return json({ grants: state.supportGrants });
    if (path === '/api/enterprise/support-grants' && method === 'POST') {
      const grant = { id: uuid(), tenantId: state.tenant.id, status: 'ACTIVE', reason: String(body?.reason || ''), scopes: body?.scopes || ['tenant.audit.read'], supportSubjectId: String(body?.supportSubjectId || 'support.engineer'), grantedBy: 'browser-owner', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + (Number(body?.durationMinutes || 240) * 60_000)).toISOString() };
      state.supportGrants.push(grant);
      auditEvent('SUPPORT_GRANT_ISSUED', { category: 'support.access', severity: 'WARNING' });
      return json({ grant }, 201);
    }
    {
      const grantRevoke = path.match(/^\/api\/enterprise\/support-grants\/([^/]+)\/revoke$/);
      if (grantRevoke && method === 'POST') {
        const grant = state.supportGrants.find(entry => entry.id === grantRevoke[1]);
        if (grant) { grant.status = 'REVOKED'; grant.revokedAt = new Date().toISOString(); }
        auditEvent('SUPPORT_GRANT_REVOKED', { category: 'support.access', severity: 'WARNING' });
        return json({ grant });
      }
    }
    if (path === '/api/enterprise/support/context') return json({ error: { code: 'SUPPORT_GRANT_DENIED' } }, 403);
    if (path === '/api/enterprise/platform/tenants' && method === 'GET') {
      if (!state.platformAdmin) return json({ error: { code: 'PLATFORM_ADMIN_REQUIRED', message: 'Platform administrator capability required.' } }, 403);
      return json({ tenants: state.platformTenants });
    }
    {
      const platformLifecycle = path.match(/^\/api\/enterprise\/platform\/tenants\/([^/]+)\/(suspend|reactivate)$/);
      if (platformLifecycle && method === 'POST') {
        if (!state.platformAdmin) return json({ error: { code: 'PLATFORM_ADMIN_REQUIRED' } }, 403);
        const tenant = state.platformTenants.find(entry => entry.id === platformLifecycle[1]);
        if (!tenant) return json({ error: { code: 'TENANT_NOT_FOUND' } }, 404);
        tenant.lifecycleState = platformLifecycle[2] === 'suspend' ? 'SUSPENDED' : 'ACTIVE';
        auditEvent(platformLifecycle[2] === 'suspend' ? 'PLATFORM_TENANT_SUSPENDED' : 'PLATFORM_TENANT_REACTIVATED', { category: 'platform.lifecycle', severity: 'WARNING' });
        return json({ tenant });
      }
    }
    if (path === '/api/enterprise/ai/generate-content' && method === 'POST') {
      return json({ text: 'Fixture AI output: connectivity verified.', provider: 'openai', model: state.configuration.aiPolicy.primaryModel, usage: { inputTokens: 12, outputTokens: 9 } });
    }
    if (path === '/api/enterprise/lifecycle/suspend' && method === 'POST') {
      state.tenant.lifecycleState = 'SUSPENDED';
      auditEvent('TENANT_SUSPENDED', { category: 'tenant.lifecycle', severity: 'CRITICAL' });
      return json({ tenant: state.tenant });
    }
    if (path.startsWith('/api/enterprise/')) return json({});
    return json({ error: { code: 'NOT_FOUND' } }, 404);
  };

  handler.state = state;
  return handler;
}

/**
 * Seeds a believable Firebase compat session and intercepts all Google
 * identity endpoints so the real app boots fully authenticated offline.
 */
export async function installAuthenticatedSession(page, { uid = 'browser-owner', email = 'owner@northwind.example', displayName = 'Northwind Owner', claims = {} } = {}) {
  const mockToken = makeMockJwt({ user_id: uid, sub: uid, email, ...claims });
  const authUserKey = `firebase:authUser:${API_KEY}:[DEFAULT]`;
  await page.addInitScript(({ key, apiKey, token, uid: id, email: mail, displayName: name }) => {
    window.__ENTERPRISE_ENABLED__ = true;
    const userObj = {
      uid: id, email: mail, emailVerified: true, displayName: name, isAnonymous: false,
      stsTokenManager: { apiKey, refreshToken: 'fixture-refresh', accessToken: token, expirationTime: Date.now() + 3_600_000 },
      createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
    };
    const payload = JSON.stringify(userObj);
    localStorage.setItem(key, payload);
    localStorage.setItem('firebase:authUser:demo-browser-api-key:[DEFAULT]', payload);
    if (apiKey) localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, payload);
    localStorage.setItem('user', id);
    // Resolve the privacy-consent banner so it never obscures console
    // workflows during automated capture (a real prior user choice).
    localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
    try {
      const req = indexedDB.open('firebaseLocalStorageDb', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('firebaseLocalStorage')) db.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('firebaseLocalStorage', 'readwrite');
        const store = tx.objectStore('firebaseLocalStorage');
        store.put({ fbase_key: key, value: userObj });
        if (apiKey) store.put({ fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`, value: userObj });
        store.put({ fbase_key: 'firebase:authUser:demo-browser-api-key:[DEFAULT]', value: userObj });
      };
    } catch { /* indexedDB optional */ }
  }, { key: authUserKey, apiKey: API_KEY, token: mockToken, uid, email, displayName });

  await rejectFirebaseDataPlaneRequests(page);
  await page.route('**/securetoken.googleapis.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ access_token: mockToken, expires_in: '3600', token_type: 'Bearer', refresh_token: 'fixture-refresh', id_token: mockToken, user_id: uid, project_id: 'ai-resume-builder-424cf' }),
  }));
  await page.route('**/identitytoolkit.googleapis.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ users: [{ localId: uid, email, emailVerified: true, displayName, providerUserInfo: [] }] }),
  }));
  await page.route('**/fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/fonts.gstatic.com/**', route => route.fulfill({ status: 200, body: '' }));
  return mockToken;
}
