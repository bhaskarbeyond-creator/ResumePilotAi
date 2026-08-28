'use strict';

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

/**
 * M2M first-class authentication acceptance suite.
 *
 * Proves end-to-end over real HTTP using explicit test doubles for the
 * immutable MariaDB store contracts that service-account
 * keys authenticate against the operational enterprise APIs with:
 *
 *   x-api-key → key verification → service account → tenant resolution →
 *   workspace resolution → server-side scope resolution → synthetic service
 *   principal → RBAC → endpoint → audit → rate limiting
 *
 * and that everything unauthorized fails closed:
 *   authorized scope → 200 | missing scope → 403 | invalid key → 401 |
 *   revoked key → 401 | rotated old key → 401 | new key → works |
 *   cross-tenant → 404 | cross-workspace → 404 | control plane → 403.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { InMemoryTenantRegistry } = require('../test/helpers/inMemoryTenantRegistry');
const { InMemoryEnterpriseRepository } = require('../test/helpers/inMemoryEnterpriseRepository');
const { InMemoryAtomicCounterStore } = require('../test/helpers/inMemoryAtomicCounterStore');
const { InMemoryServiceAccountStore } = require('../enterprise/serviceAccountStore');
const { InMemorySupportGrantStore } = require('../enterprise/supportAccessStore');
const { TenantQuotaGuard } = require('../enterprise/tenantQuota');
const { ServerKeyEncryptionProvider } = require('../enterprise/encryptionProvider');
const { TenantService } = require('../enterprise/tenantService');
const { setTokenVerifierForTests } = require('../security/auth');
const app = require('../index');

const ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const tokens = {
  alice: { uid: 'alice-m2m', email: 'alice@m2m.example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
  bob: { uid: 'bob-m2m', email: 'bob@m2m.example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
  admin: { uid: 'admin-m2m', email: 'admin@m2m.example.com', email_verified: true, role: 'ADMIN', auth_time: Math.floor(Date.now() / 1000) },
  support: { uid: 'support-m2m', email: 'support@m2m.example.com', email_verified: true, role: 'SUPPORT', auth_time: Math.floor(Date.now() / 1000) },
  intruder: { uid: 'intruder-m2m', email: 'intruder@m2m.example.com', email_verified: true, role: 'SUPPORT', auth_time: Math.floor(Date.now() / 1000) },
};

function bearer(name) { return `Bearer ${name}`; }

function installService() {
  const encryptionProvider = new ServerKeyEncryptionProvider({ keys: new Map([['v1', Buffer.from(ENCRYPTION_KEY, 'base64')]]) });
  const serviceAccountStore = new InMemoryServiceAccountStore();
  const supportGrantStore = new InMemorySupportGrantStore();
  const service = new TenantService({
    registry: new InMemoryTenantRegistry(),
    repository: new InMemoryEnterpriseRepository({ encryptionProvider }),
    serviceAccountStore,
    supportGrantStore,
    quotaGuard: new TenantQuotaGuard({ store: new InMemoryAtomicCounterStore() }),
    encryptionProvider,
    dataProviderName: 'mysql',
  });
  app.set('tenantService', service);
  return { service, serviceAccountStore, supportGrantStore };
}

test.beforeEach(() => {
  setTokenVerifierForTests(async token => {
    if (!tokens[token]) throw new Error('bad token');
    return tokens[token];
  });
});

/** Provision a personal tenant for a user and create a service account key. */
async function provision({ user, scopes, scope, displayName = 'M2M acceptance bot' }) {
  const context = await request(app).get('/api/enterprise/context').set('Authorization', bearer(user));
  assert.equal(context.status, 200);
  const tenantId = context.body.context.tenantId;
  const workspaceId = context.body.workspace.id;
  const created = await request(app)
    .post('/api/enterprise/service-accounts')
    .set('Authorization', bearer(user))
    .set('X-Tenant-Id', tenantId)
    .send({ displayName, scopes, ...(scope ? { scope } : {}) });
  assert.equal(created.status, 201);
  assert.match(created.body.apiKey, /^rpa_/);
  return { tenantId, workspaceId, ...created.body };
}

// ─── 1. Capability matrix: M2M keys reach the operational APIs ──────────────

test('M2M resource read: authorized scope returns 200, missing scope returns 403', async () => {
  installService();
  const { tenantId, apiKey } = await provision({ user: 'alice', scopes: ['resource.read', 'workspace.read'] });

  const allowed = await request(app).get('/api/enterprise/resources').set('X-API-Key', apiKey).set('X-Tenant-Id', tenantId);
  assert.equal(allowed.status, 200);
  assert.ok(Array.isArray(allowed.body.resources));

  const noScope = await provision({ user: 'alice', scopes: ['workspace.read'], displayName: 'No read bot' });
  const denied = await request(app).get('/api/enterprise/resources').set('X-API-Key', noScope.apiKey);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'TENANT_FORBIDDEN');
});

test('M2M resource create: authorized scope returns 201, missing scope returns 403', async () => {
  installService();
  const { tenantId, apiKey } = await provision({ user: 'alice', scopes: ['resource.create', 'resource.read'] });
  const created = await request(app)
    .post('/api/enterprise/resources')
    .set('X-API-Key', apiKey)
    .send({ resourceType: 'RESUME', classification: 'PRIVATE', payload: { title: 'Machine-created resume' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.resource.tenantId, tenantId);
  assert.equal(created.body.resource.ownerPrincipalId.length > 0, true);

  const readOnly = await provision({ user: 'alice', scopes: ['resource.read'], displayName: 'Read only bot' });
  const denied = await request(app)
    .post('/api/enterprise/resources')
    .set('X-API-Key', readOnly.apiKey)
    .send({ resourceType: 'RESUME', payload: {} });
  assert.equal(denied.status, 403);
});

test('M2M resource update and delete honour resource.update and fail closed without it', async () => {
  installService();
  const { tenantId, apiKey } = await provision({ user: 'alice', scopes: ['resource.create', 'resource.read', 'resource.update'] });
  const created = await request(app).post('/api/enterprise/resources').set('X-API-Key', apiKey)
    .send({ resourceType: 'RESUME', payload: { title: 'v1' } });
  assert.equal(created.status, 201);
  const resourceId = created.body.resource.id;

  const updated = await request(app).patch(`/api/enterprise/resources/${resourceId}`).set('X-API-Key', apiKey)
    .send({ payload: { title: 'v2' }, expectedRevision: 1 });
  assert.equal(updated.status, 200);

  const deleted = await request(app).delete(`/api/enterprise/resources/${resourceId}`).set('X-API-Key', apiKey);
  assert.equal(deleted.status, 204);
  const gone = await request(app).get(`/api/enterprise/resources/${resourceId}`).set('X-API-Key', apiKey);
  assert.equal(gone.status, 404);

  const readOnly = await provision({ user: 'alice', scopes: ['resource.read'], displayName: 'Watcher bot' });
  const deniedUpdate = await request(app).patch(`/api/enterprise/resources/${crypto.randomUUID()}`).set('X-API-Key', readOnly.apiKey).send({ payload: {} });
  assert.equal(deniedUpdate.status, 403);
  const deniedDelete = await request(app).delete(`/api/enterprise/resources/${crypto.randomUUID()}`).set('X-API-Key', readOnly.apiKey);
  assert.equal(deniedDelete.status, 403);
  void tenantId;
});

test('M2M usage and audit reads are scope-gated', async () => {
  installService();
  const full = await provision({ user: 'alice', scopes: ['tenant.usage.read', 'tenant.audit.read', 'workspace.read'] });
  const usage = await request(app).get('/api/enterprise/usage/ai').set('X-API-Key', full.apiKey);
  assert.equal(usage.status, 200);
  const audit = await request(app).get('/api/enterprise/audit').set('X-API-Key', full.apiKey);
  assert.equal(audit.status, 200);
  assert.ok(Array.isArray(audit.body.events));

  const none = await provision({ user: 'alice', scopes: ['workspace.read'], displayName: 'Plain bot' });
  assert.equal((await request(app).get('/api/enterprise/usage/ai').set('X-API-Key', none.apiKey)).status, 403);
  assert.equal((await request(app).get('/api/enterprise/audit').set('X-API-Key', none.apiKey)).status, 403);
});

test('M2M AI generation passes auth+RBAC only with ai.use (provider-independent reachability)', async () => {
  installService();
  const withScope = await provision({ user: 'alice', scopes: ['ai.use'] });
  const allowed = await request(app).post('/api/enterprise/ai/generate-content').set('X-API-Key', withScope.apiKey)
    .send({
      operation: 'generate-summary',
      payload: { jobTitle: 'Staff Engineer', sourceFacts: 'Maintained distributed systems for Acme' },
    });
  // No AI provider is configured in the test environment: authentication,
  // authorization, metering and quota all succeed, then provider dispatch fails
  // closed (502/503) or the tenant provider policy rejects (403 with a
  // provider-policy code). Any of these proves M2M reachability; a RBAC or
  // auth rejection would be TENANT_FORBIDDEN / INVALID_SERVICE_API_KEY.
  assert.ok([200, 403, 502, 503].includes(allowed.status), `unexpected status ${allowed.status}`);
  if (allowed.status === 403) {
    assert.notEqual(allowed.body.error.code, 'TENANT_FORBIDDEN');
    assert.notEqual(allowed.body.error.code, 'M2M_OPERATION_NOT_PERMITTED');
  }
  assert.notEqual(allowed.status, 401);

  const withoutScope = await provision({ user: 'alice', scopes: ['resource.read'], displayName: 'No AI bot' });
  const denied = await request(app).post('/api/enterprise/ai/generate-content').set('X-API-Key', withoutScope.apiKey)
    .send({ operation: 'summary', payload: {} });
  assert.equal(denied.status, 403);
});

// ─── 2. Control plane stays human-only ───────────────────────────────────────

test('M2M keys can NEVER reach control-plane endpoints, even with elevated scopes', async () => {
  installService();
  const elevated = await provision({
    user: 'alice',
    scopes: ['tenant.security.manage', 'tenant.security.read', 'tenant.members.manage', 'tenant.settings.write', 'tenant.read', 'workspace.read'],
    displayName: 'Elevated bot',
  });
  const key = elevated.apiKey;
  const probes = [
    () => request(app).get('/api/enterprise/service-accounts').set('X-API-Key', key),
    () => request(app).post('/api/enterprise/service-accounts').set('X-API-Key', key).send({ displayName: 'Nesting bot', scopes: ['resource.read'] }),
    () => request(app).get('/api/enterprise/memberships').set('X-API-Key', key),
    () => request(app).post('/api/enterprise/memberships').set('X-API-Key', key).send({ principalId: 'x' }),
    () => request(app).patch('/api/enterprise/configuration').set('X-API-Key', key).send({ configuration: {} }),
    () => request(app).post('/api/enterprise/support-grants').set('X-API-Key', key).send({}),
    () => request(app).post('/api/enterprise/tenants').set('X-API-Key', key).send({ displayName: 'X' }),
    () => request(app).post('/api/enterprise/workspaces').set('X-API-Key', key).send({ name: 'X' }),
    () => request(app).get('/api/enterprise/platform/tenants').set('X-API-Key', key),
    () => request(app).post('/api/enterprise/lifecycle/suspend').set('X-API-Key', key),
    () => request(app).get('/api/enterprise/data/export').set('X-API-Key', key),
    () => request(app).post('/api/enterprise/test-email').set('X-API-Key', key).send({}),
    () => request(app).post('/api/enterprise/queue/jobs').set('X-API-Key', key).send({ jobType: 'NOTIFY' }),
  ];
  for (const probe of probes) {
    const response = await probe();
    assert.equal(response.status, 403, `expected 403 for ${probe}`);
    assert.equal(response.body.error.code, 'M2M_OPERATION_NOT_PERMITTED');
  }
});

// ─── 3. Credential hygiene ───────────────────────────────────────────────────

test('invalid, missing and ambiguous credentials fail closed', async () => {
  installService();
  const { apiKey } = await provision({ user: 'alice', scopes: ['resource.read'] });

  const missing = await request(app).get('/api/enterprise/resources');
  assert.equal(missing.status, 401);

  const invalid = await request(app).get('/api/enterprise/resources').set('X-API-Key', 'rpa_totally-wrong-key');
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.error.code, 'INVALID_SERVICE_API_KEY');

  const ambiguous = await request(app).get('/api/enterprise/resources')
    .set('X-API-Key', apiKey).set('Authorization', bearer('alice'));
  assert.equal(ambiguous.status, 400);
  assert.equal(ambiguous.body.error.code, 'AMBIGUOUS_CREDENTIALS');

  // A bearer token alone still works for humans (regression guard).
  const human = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  assert.equal(human.status, 200);
});

test('plaintext key material is never persisted, logged, returned twice, or included in audit', async () => {
  const { serviceAccountStore } = installService();
  const { tenantId, apiKey, apiKeyPrefix } = await provision({ user: 'alice', scopes: ['resource.read'] });

  // 1. Not returned again: the list endpoint exposes only the safe prefix.
  const list = await request(app).get('/api/enterprise/service-accounts').set('Authorization', bearer('alice')).set('X-Tenant-Id', tenantId);
  assert.equal(list.status, 200);
  const serializedList = JSON.stringify(list.body);
  assert.ok(!serializedList.includes(apiKey), 'list response leaked the plaintext key');
  assert.equal(list.body.serviceAccounts[0].apiKeyPrefix, apiKeyPrefix);

  // 2. Not stored: key records are keyed by the SHA-256 hash and contain no plaintext field.
  assert.equal(serviceAccountStore.keys.size, 1);
  const keyDoc = JSON.stringify([...serviceAccountStore.keys.values()][0]);
  assert.ok(!keyDoc.includes(apiKey), 'persisted key record leaked the plaintext key');
  assert.ok(keyDoc.includes(apiKeyPrefix), 'safe prefix should be stored');

  // 3. Not in audit: create a resource with the key and inspect audit events.
  const writable = await provision({ user: 'alice', scopes: ['resource.create', 'tenant.audit.read'], displayName: 'Audit probe bot' });
  await request(app).post('/api/enterprise/resources').set('X-API-Key', writable.apiKey).send({ resourceType: 'RESUME', payload: {} });
  const audit = await request(app).get('/api/enterprise/audit').set('X-API-Key', writable.apiKey);
  assert.equal(audit.status, 200);
  const serializedAudit = JSON.stringify(audit.body);
  assert.ok(!serializedAudit.includes(writable.apiKey), 'audit trail leaked the plaintext key');
  assert.ok(!serializedAudit.includes(apiKey), 'audit trail leaked the first plaintext key');
});

// ─── 4. Key lifecycle: create → use → rotate → revoke ────────────────────────

test('rotation kills the old key immediately; revocation kills the new key immediately', async () => {
  installService();
  const { tenantId, apiKey, serviceAccount } = await provision({ user: 'alice', scopes: ['resource.read', 'workspace.read'] });

  const before = await request(app).get('/api/enterprise/workspaces').set('X-API-Key', apiKey);
  assert.equal(before.status, 200);

  const rotated = await request(app).post(`/api/enterprise/service-accounts/${serviceAccount.id}/rotate`)
    .set('Authorization', bearer('alice')).set('X-Tenant-Id', tenantId);
  assert.equal(rotated.status, 200);
  assert.match(rotated.body.apiKey, /^rpa_/);
  assert.notEqual(rotated.body.apiKey, apiKey);

  const oldKeyDead = await request(app).get('/api/enterprise/workspaces').set('X-API-Key', apiKey);
  assert.equal(oldKeyDead.status, 401, 'rotated-out key must stop authenticating immediately');

  const newKeyAlive = await request(app).get('/api/enterprise/workspaces').set('X-API-Key', rotated.body.apiKey);
  assert.equal(newKeyAlive.status, 200, 'rotation key must authenticate immediately');

  const revoked = await request(app).post(`/api/enterprise/service-accounts/${serviceAccount.id}/revoke`)
    .set('Authorization', bearer('alice')).set('X-Tenant-Id', tenantId);
  assert.equal(revoked.status, 204);

  const afterRevoke = await request(app).get('/api/enterprise/workspaces').set('X-API-Key', rotated.body.apiKey);
  assert.equal(afterRevoke.status, 401, 'revoked key must stop authenticating immediately');
});

// ─── 5. Tenant isolation ─────────────────────────────────────────────────────

test('tenant isolation: key A can never see, touch or spoof tenant B', async () => {
  installService();
  // resource.update is included so cross-tenant write attempts are proven to be
  // stopped by the TENANT boundary (404), not merely by the missing-scope gate.
  const tenantA = await provision({ user: 'alice', scopes: ['resource.read', 'resource.create', 'resource.update', 'workspace.read', 'tenant.read'] });
  const tenantB = await provision({ user: 'bob', scopes: ['resource.read', 'resource.create', 'workspace.read'], displayName: 'Tenant B bot' });

  // Seed a resource in tenant B (human context).
  const seeded = await request(app).post('/api/enterprise/resources')
    .set('Authorization', bearer('bob')).set('X-Tenant-Id', tenantB.tenantId)
    .send({ resourceType: 'RESUME', payload: { secret: 'tenant-b-only' } });
  assert.equal(seeded.status, 201);
  const tenantBResourceId = seeded.body.resource.id;

  // Key A reads its own tenant: allowed.
  const ownTenant = await request(app).get('/api/enterprise/resources').set('X-API-Key', tenantA.apiKey);
  assert.equal(ownTenant.status, 200);

  // Key A cannot read tenant B's resource by id.
  const crossRead = await request(app).get(`/api/enterprise/resources/${tenantBResourceId}`).set('X-API-Key', tenantA.apiKey);
  assert.equal(crossRead.status, 404);

  // Key A cannot update or delete tenant B's resource.
  assert.equal((await request(app).patch(`/api/enterprise/resources/${tenantBResourceId}`).set('X-API-Key', tenantA.apiKey).send({ payload: {} })).status, 404);
  assert.equal((await request(app).delete(`/api/enterprise/resources/${tenantBResourceId}`).set('X-API-Key', tenantA.apiKey)).status, 404);

  // x-tenant-id spoofing toward tenant B: the key's tenant binding wins (404).
  const spoofHeader = await request(app).get('/api/enterprise/resources')
    .set('X-API-Key', tenantA.apiKey).set('X-Tenant-Id', tenantB.tenantId);
  assert.equal(spoofHeader.status, 404);

  // Query-string tenant spoofing.
  const spoofQuery = await request(app).get(`/api/enterprise/resources?tenantId=${tenantB.tenantId}`).set('X-API-Key', tenantA.apiKey);
  assert.equal(spoofQuery.status, 404);

  // Workspace spoofing toward tenant B workspace.
  const spoofWorkspace = await request(app).get('/api/enterprise/workspaces')
    .set('X-API-Key', tenantA.apiKey).set('X-Workspace-Id', tenantB.workspaceId);
  assert.equal(spoofWorkspace.status, 404);

  // Body tenantId spoofing on create: the resource lands in the KEY's tenant,
  // never in the attacker-requested one.
  const bodySpoof = await request(app).post('/api/enterprise/resources')
    .set('X-API-Key', tenantA.apiKey)
    .send({ resourceType: 'RESUME', tenantId: tenantB.tenantId, workspaceId: tenantB.workspaceId, payload: { injected: true } });
  assert.equal(bodySpoof.status, 201);
  assert.equal(bodySpoof.body.resource.tenantId, tenantA.tenantId);
  assert.notEqual(bodySpoof.body.resource.workspaceId, tenantB.workspaceId);

  // Scope spoofing: client-supplied scopes cannot expand key permissions.
  const scopeSpoof = await request(app).get('/api/enterprise/audit')
    .set('X-API-Key', tenantA.apiKey).set('X-Scopes', 'tenant.audit.read');
  assert.equal(scopeSpoof.status, 403);
});

// ─── 6. Workspace scoping: TENANT-scoped vs WORKSPACE-scoped accounts ───────

test('workspace-scoped accounts are pinned; tenant-scoped accounts span the tenant', async () => {
  const { service } = installService();
  const alice = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  const tenantId = alice.body.context.tenantId;
  const workspaceA = alice.body.workspace.id;

  // Second workspace created by the tenant owner.
  const workspaceBResponse = await request(app).post('/api/enterprise/workspaces')
    .set('Authorization', bearer('alice')).set('X-Tenant-Id', tenantId).send({ name: 'Workspace B' });
  assert.equal(workspaceBResponse.status, 201);
  const workspaceB = workspaceBResponse.body.workspace.id;

  // WORKSPACE-scoped key pinned to workspace A (default).
  const wsKey = await provision({ user: 'alice', scopes: ['resource.read', 'resource.create', 'workspace.read'] });
  // TENANT-scoped key (owner privilege).
  const tenantKey = await provision({ user: 'alice', scopes: ['resource.read', 'workspace.read'], scope: 'TENANT', displayName: 'Tenant-wide bot' });
  assert.equal(tenantKey.serviceAccount.scope, 'TENANT');
  assert.equal(tenantKey.serviceAccount.workspaceId, null);

  // Seed one resource in each workspace as the human owner.
  const inA = await request(app).post('/api/enterprise/resources')
    .set('Authorization', bearer('alice')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceA)
    .send({ resourceType: 'RESUME', payload: { where: 'A' } });
  const inB = await request(app).post('/api/enterprise/resources')
    .set('Authorization', bearer('alice')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceB)
    .send({ resourceType: 'RESUME', payload: { where: 'B' } });
  assert.equal(inA.status, 201);
  assert.equal(inB.status, 201);

  // Workspace-scoped key: sees only workspace A resources.
  const wsList = await request(app).get('/api/enterprise/resources').set('X-API-Key', wsKey.apiKey);
  assert.equal(wsList.status, 200);
  assert.ok(wsList.body.resources.every(resource => resource.workspaceId === workspaceA), 'workspace key leaked other-workspace resources');
  assert.equal((await request(app).get(`/api/enterprise/resources/${inB.body.resource.id}`).set('X-API-Key', wsKey.apiKey)).status, 404);
  // Creating through the workspace key always lands in its own workspace.
  const wsCreate = await request(app).post('/api/enterprise/resources').set('X-API-Key', wsKey.apiKey)
    .send({ resourceType: 'RESUME', workspaceId: workspaceB, payload: {} });
  assert.equal(wsCreate.status, 201);
  assert.equal(wsCreate.body.resource.workspaceId, workspaceA);

  // Tenant-scoped key: sees BOTH workspaces and can narrow via header.
  const tenantList = await request(app).get('/api/enterprise/resources').set('X-API-Key', tenantKey.apiKey);
  assert.equal(tenantList.status, 200);
  const seen = new Set(tenantList.body.resources.map(resource => resource.workspaceId));
  assert.ok(seen.has(workspaceA) && seen.has(workspaceB), 'tenant-scoped key should span workspaces');
  const narrowed = await request(app).get('/api/enterprise/resources').set('X-API-Key', tenantKey.apiKey).set('X-Workspace-Id', workspaceB);
  assert.equal(narrowed.status, 200);
  assert.ok(narrowed.body.resources.every(resource => resource.workspaceId === workspaceB));

  // A non-owner cannot create tenant-scoped accounts: resolve a workspace-only
  // caller by granting bob a membership into workspace B with MEMBER role.
  await request(app).post('/api/enterprise/memberships')
    .set('Authorization', bearer('alice')).set('X-Tenant-Id', tenantId)
    .send({ principalId: tokens.bob.uid, roles: ['MEMBER'], workspaceId: workspaceB });
  const bobEscalation = await request(app).post('/api/enterprise/service-accounts')
    .set('Authorization', bearer('bob')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceB)
    .send({ displayName: 'Sneaky tenant bot', scopes: ['resource.read'], scope: 'TENANT' });
  assert.equal(bobEscalation.status, 403);
  void service;
});

// ─── 7. Audit identifies the service actor ───────────────────────────────────

test('M2M operations are audited as service principals, distinct from users and support', async () => {
  installService();
  const { tenantId, apiKey, serviceAccount } = await provision({ user: 'alice', scopes: ['resource.create', 'tenant.audit.read'] });
  const created = await request(app).post('/api/enterprise/resources').set('X-API-Key', apiKey).send({ resourceType: 'RESUME', payload: {} });
  assert.equal(created.status, 201);

  const audit = await request(app).get('/api/enterprise/audit').set('X-API-Key', apiKey);
  assert.equal(audit.status, 200);
  const resourceEvents = audit.body.events.filter(event => event.action === 'RESOURCE_CREATED');
  assert.ok(resourceEvents.length >= 1, 'expected a RESOURCE_CREATED audit event');
  const serviceEvent = resourceEvents.find(event => event.actorType === 'service');
  assert.ok(serviceEvent, 'audit must identify the actor as a SERVICE ACCOUNT');
  assert.equal(serviceEvent.principalId, serviceAccount.id);
  assert.equal(serviceEvent.identityIssuer, 'service');
  assert.equal(serviceEvent.tenantId, tenantId);
});

// ─── 8. Support / break-glass reaches operational endpoints ─────────────────

test('support grants authorize real operations: workspace-scoped and tenant-scoped', async () => {
  installService();
  // Platform admin provisions a named tenant and becomes its TENANT_OWNER.
  const provisioned = await request(app).post('/api/enterprise/tenants').set('Authorization', bearer('admin')).send({ displayName: 'Support Co', slug: 'support-co' });
  assert.equal(provisioned.status, 201);
  const tenantId = provisioned.body.tenant.id;
  const workspaceId = provisioned.body.workspace.id;

  // Workspace-scoped diagnostic grant.
  const grant = await request(app).post('/api/enterprise/support-grants')
    .set('Authorization', bearer('admin')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId)
    .send({ supportSubjectId: tokens.support.uid, reason: 'Investigate audit trail for ticket INC-4242', expiresInMinutes: 30, scopes: ['tenant.audit.read', 'tenant.read', 'workspace.read', 'resource.read'] });
  assert.equal(grant.status, 201);

  // The support engineer can now actually READ the tenant audit trail (this was
  // impossible before: grants resolved but could not drive operational calls).
  const auditViaGrant = await request(app).get('/api/enterprise/audit')
    .set('Authorization', bearer('support'))
    .set('X-Support-Grant-Id', grant.body.grant.id)
    .set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId);
  assert.equal(auditViaGrant.status, 200);
  assert.ok(Array.isArray(auditViaGrant.body.events));

  // Support elevation cannot reach control-plane endpoints.
  const blocked = await request(app).get('/api/enterprise/memberships')
    .set('Authorization', bearer('support'))
    .set('X-Support-Grant-Id', grant.body.grant.id)
    .set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, 'SUPPORT_OPERATION_NOT_PERMITTED');

  // A different support-eligible identity cannot use someone else's grant.
  const stolen = await request(app).get('/api/enterprise/audit')
    .set('Authorization', bearer('intruder'))
    .set('X-Support-Grant-Id', grant.body.grant.id)
    .set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId);
  assert.equal(stolen.status, 403);

  // Tenant-scoped grant allows tenant-wide diagnostics and workspace narrowing.
  const tenantGrant = await request(app).post('/api/enterprise/support-grants')
    .set('Authorization', bearer('admin')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId)
    .send({ supportSubjectId: tokens.support.uid, reason: 'Tenant-wide quota investigation INC-5150', expiresInMinutes: 30, scopes: ['tenant.usage.read', 'tenant.read'], scope: 'TENANT' });
  assert.equal(tenantGrant.status, 201);
  assert.equal(tenantGrant.body.grant.workspaceId, null);
  const usage = await request(app).get('/api/enterprise/usage/ai')
    .set('Authorization', bearer('support'))
    .set('X-Support-Grant-Id', tenantGrant.body.grant.id)
    .set('X-Tenant-Id', tenantId);
  assert.equal(usage.status, 200);

  // Revocation is immediate.
  const revoke = await request(app).post(`/api/enterprise/support-grants/${grant.body.grant.id}/revoke`)
    .set('Authorization', bearer('admin')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId);
  assert.equal(revoke.status, 204);
  const afterRevoke = await request(app).get('/api/enterprise/audit')
    .set('Authorization', bearer('support'))
    .set('X-Support-Grant-Id', grant.body.grant.id)
    .set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId);
  assert.equal(afterRevoke.status, 403);
});

test('support repair scopes respect the tenant approval policy (fail closed by default)', async () => {
  installService();
  const provisioned = await request(app).post('/api/enterprise/tenants').set('Authorization', bearer('admin')).send({ displayName: 'Repair Co', slug: 'repair-co' });
  const tenantId = provisioned.body.tenant.id;
  const workspaceId = provisioned.body.workspace.id;

  // Default policy: repair scopes are rejected at grant time.
  const deniedRepair = await request(app).post('/api/enterprise/support-grants')
    .set('Authorization', bearer('admin')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId)
    .send({ supportSubjectId: tokens.support.uid, reason: 'Repair attempt without policy change', expiresInMinutes: 30, scopes: ['resource.update'] });
  assert.equal(deniedRepair.status, 403);
  assert.equal(deniedRepair.body.error.code, 'SUPPORT_SCOPE_NOT_PERMITTED');

  // Tenant explicitly records the decision to allow repair scopes.
  const configuration = await request(app).get('/api/enterprise/configuration').set('Authorization', bearer('admin')).set('X-Tenant-Id', tenantId);
  const saved = await request(app).patch('/api/enterprise/configuration').set('Authorization', bearer('admin')).set('X-Tenant-Id', tenantId)
    .send({ expectedRevision: configuration.body.configuration.revision, configuration: { securityPolicy: { supportAccessRequiresApproval: false } } });
  assert.equal(saved.status, 200);

  const repairGrant = await request(app).post('/api/enterprise/support-grants')
    .set('Authorization', bearer('admin')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId)
    .send({ supportSubjectId: tokens.support.uid, reason: 'Approved repair for ticket INC-6000', expiresInMinutes: 30, scopes: ['resource.read', 'resource.update'] });
  assert.equal(repairGrant.status, 201);

  // Seed a resource and let support repair it.
  const seeded = await request(app).post('/api/enterprise/resources')
    .set('Authorization', bearer('admin')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId)
    .send({ resourceType: 'RESUME', payload: { broken: true } });
  const repaired = await request(app).patch(`/api/enterprise/resources/${seeded.body.resource.id}`)
    .set('Authorization', bearer('support'))
    .set('X-Support-Grant-Id', repairGrant.body.grant.id)
    .set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId)
    .send({ payload: { broken: false }, expectedRevision: 1 });
  assert.equal(repaired.status, 200);

  // Support still cannot create resources beyond allowlist (delete is not a repair op).
  const deleteBlocked = await request(app).delete(`/api/enterprise/resources/${seeded.body.resource.id}`)
    .set('Authorization', bearer('support'))
    .set('X-Support-Grant-Id', repairGrant.body.grant.id)
    .set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId);
  assert.equal(deleteBlocked.status, 403);
});

test('expired support grants fail closed', async () => {
  const { supportGrantStore } = installService();
  const provisioned = await request(app).post('/api/enterprise/tenants').set('Authorization', bearer('admin')).send({ displayName: 'Expiry Co', slug: 'expiry-co' });
  const tenantId = provisioned.body.tenant.id;
  const workspaceId = provisioned.body.workspace.id;
  const grant = await request(app).post('/api/enterprise/support-grants')
    .set('Authorization', bearer('admin')).set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId)
    .send({ supportSubjectId: tokens.support.uid, reason: 'Short-lived diagnostics session', expiresInMinutes: 5, scopes: ['tenant.audit.read'] });
  assert.equal(grant.status, 201);
  // Fast-forward the grant past its expiry directly in the store.
  const storedGrant = supportGrantStore.grants.get(grant.body.grant.id);
  supportGrantStore.grants.set(storedGrant.id, { ...storedGrant, expiresAt: new Date(Date.now() - 1000).toISOString() });
  const expired = await request(app).get('/api/enterprise/audit')
    .set('Authorization', bearer('support'))
    .set('X-Support-Grant-Id', grant.body.grant.id)
    .set('X-Tenant-Id', tenantId).set('X-Workspace-Id', workspaceId);
  assert.equal(expired.status, 403);
});

// ─── 9. Tenant lifecycle affects M2M immediately ────────────────────────────

test('a suspended tenant cuts off its service keys immediately', async () => {
  installService();
  const provisioned = await request(app).post('/api/enterprise/tenants').set('Authorization', bearer('admin')).send({ displayName: 'Suspend Co', slug: 'suspend-co' });
  const tenantId = provisioned.body.tenant.id;
  const created = await request(app).post('/api/enterprise/service-accounts')
    .set('Authorization', bearer('admin')).set('X-Tenant-Id', tenantId)
    .send({ displayName: 'Suspend probe bot', scopes: ['resource.read'] });
  const apiKey = created.body.apiKey;
  assert.equal((await request(app).get('/api/enterprise/resources').set('X-API-Key', apiKey)).status, 200);

  const suspended = await request(app).post(`/api/enterprise/platform/tenants/${tenantId}/suspend`).set('Authorization', bearer('admin'));
  assert.equal(suspended.status, 200);

  const after = await request(app).get('/api/enterprise/resources').set('X-API-Key', apiKey);
  assert.equal(after.status, 403);
  assert.equal(after.body.error.code, 'TENANT_INACTIVE');
});
