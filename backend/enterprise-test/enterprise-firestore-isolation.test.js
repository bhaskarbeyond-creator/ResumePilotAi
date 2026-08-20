'use strict';

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { MemoryFirestore, createMemoryAdmin } = require('../test/helpers/memoryFirestore');
const { FirestoreTenantRegistry } = require('../enterprise/tenantRegistry');
const { FirestoreEnterpriseRepository } = require('../enterprise/firestoreEnterpriseRepository');
const { FirestoreServiceAccountStore } = require('../enterprise/serviceAccountStore');
const { FirestoreSupportGrantStore } = require('../enterprise/supportAccessStore');
const { FirestoreAtomicCounterStore, TenantQuotaGuard } = require('../enterprise/tenantQuota');
const { ServerKeyEncryptionProvider } = require('../enterprise/encryptionProvider');
const { TenantService } = require('../enterprise/tenantService');
const { setTokenVerifierForTests } = require('../security/auth');
const app = require('../index');

/**
 * Adversarial isolation suite against the CANONICAL Firestore stores — the
 * memory harness speaks the real Admin SDK surface, so these tests exercise
 * exactly the production code paths (registry, repository, stores, routes)
 * that used to be certified through PostgreSQL RLS.
 */

const ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const tokens = {
  alice: { uid: 'alice-iso', email: 'alice@iso.example.com', email_verified: true, role: 'USER' },
  bob: { uid: 'bob-iso', email: 'bob@iso.example.com', email_verified: true, role: 'USER' },
  carol: { uid: 'carol-iso', email: 'carol@iso.example.com', email_verified: true, role: 'USER' },
  dave: { uid: 'dave-iso', email: 'dave@iso.example.com', email_verified: true, role: 'USER' },
  support: { uid: 'support-iso', email: 'support@iso.example.com', email_verified: true, role: 'SUPPORT', auth_time: Math.floor(Date.now() / 1000) },
};

function bearer(name) { return `Bearer ${name}`; }

function installFirestoreBackedService() {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const encryptionProvider = new ServerKeyEncryptionProvider({
    keys: new Map([['v1', Buffer.from(ENCRYPTION_KEY, 'base64')]]),
  });
  const repository = new FirestoreEnterpriseRepository({ db, admin, encryptionProvider });
  const registry = new FirestoreTenantRegistry({ db, admin });
  const service = new TenantService({
    registry,
    db,
    admin,
    repository,
    serviceAccountStore: new FirestoreServiceAccountStore({ db, admin }),
    supportGrantStore: new FirestoreSupportGrantStore({ db, admin }),
    quotaGuard: new TenantQuotaGuard({ store: new FirestoreAtomicCounterStore({ db, admin }) }),
    encryptionProvider,
    dataProviderName: 'firestore',
  });
  app.set('db', db);
  app.set('firebaseAdmin', admin);
  app.set('tenantService', service);
  return { db, admin, service, registry, repository };
}

async function contextFor(service, user, tenantId, workspaceId) {
  const resolved = await service.resolveContext({
    user: { uid: user, email: null, emailVerified: true, claims: {} },
    requestedTenantId: tenantId,
    requestedWorkspaceId: workspaceId,
    requestId: crypto.randomUUID(),
  });
  return resolved.context;
}

test.beforeEach(() => {
  setTokenVerifierForTests(async token => {
    if (!tokens[token]) throw new Error('bad token');
    return tokens[token];
  });
});

test('IDOR/BOLA: cross-tenant resource access is structurally impossible through the API', async () => {
  const { service } = installFirestoreBackedService();

  const aliceContext = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  assert.equal(aliceContext.status, 200);
  const aliceTenant = aliceContext.body.context.tenantId;
  const aliceWorkspace = aliceContext.body.context.workspaceId;

  // Provision a second, independent tenant for Bob.
  const provisioned = await service.registry.provisionTenant({ ownerPrincipalId: 'bob-iso', displayName: 'Bob Industries', slug: 'bob-industries' });
  const bobTenant = provisioned.tenantId;

  const created = await request(app)
    .post('/api/enterprise/resources')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', aliceTenant)
    .set('X-Workspace-Id', aliceWorkspace)
    .send({ resourceType: 'RESUME', payload: { secret: 'alice-compensation' } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const resourceId = created.body.resource.id;

  // Bob requests the same resource id inside his own tenant context.
  const intruded = await request(app)
    .get(`/api/enterprise/resources/${resourceId}`)
    .set('Authorization', bearer('bob'))
    .set('X-Tenant-Id', bobTenant);
  assert.equal(intruded.status, 404);
  assert.equal(intruded.body.error.code, 'TENANT_RESOURCE_NOT_FOUND');

  // Bob cannot smuggle himself in with Alice's headers.
  const spoofed = await request(app)
    .get(`/api/enterprise/resources/${resourceId}`)
    .set('Authorization', bearer('bob'))
    .set('X-Tenant-Id', aliceTenant);
  assert.equal(spoofed.status, 404);
  assert.equal(spoofed.body.error.code, 'TENANT_MEMBERSHIP_NOT_FOUND');

  // Bodies and queries cannot override the verified context either.
  const bodySpoof = await request(app)
    .patch(`/api/enterprise/resources/${resourceId}`)
    .set('Authorization', bearer('bob'))
    .set('X-Tenant-Id', bobTenant)
    .send({ tenantId: aliceTenant, expectedRevision: 1, payload: { stolen: true } });
  assert.equal(bodySpoof.status, 404);

  // Tenant A audit trail is invisible to tenant B.
  const auditLeak = await request(app)
    .get('/api/enterprise/audit')
    .set('Authorization', bearer('bob'))
    .set('X-Tenant-Id', bobTenant);
  assert.equal(auditLeak.status, 200);
  assert.ok(auditLeak.body.events.every(event => event.tenantId !== aliceTenant));
});

test('workspace isolation: members cannot read, write, or cross into other workspaces', async () => {
  const { service } = installFirestoreBackedService();

  const owner = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  const tenantId = owner.body.context.tenantId;
  const defaultWorkspace = owner.body.context.workspaceId;

  const second = await request(app)
    .post('/api/enterprise/workspaces')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantId)
    .send({ name: 'Restricted Ops' });
  assert.equal(second.status, 201);
  const restrictedWorkspace = second.body.workspace.id;

  // Dave is granted MEMBER scoped to the default workspace only.
  await service.registry.grantMembership({ tenantId, principalId: 'dave-iso', workspaceId: defaultWorkspace, roles: ['MEMBER'] });

  const daveDefault = await request(app)
    .get('/api/enterprise/context')
    .set('Authorization', bearer('dave'))
    .set('X-Tenant-Id', tenantId)
    .set('X-Workspace-Id', defaultWorkspace);
  assert.equal(daveDefault.status, 200, 'Dave can enter his granted workspace');

  const daveRestricted = await request(app)
    .get('/api/enterprise/context')
    .set('Authorization', bearer('dave'))
    .set('X-Tenant-Id', tenantId)
    .set('X-Workspace-Id', restrictedWorkspace);
  assert.equal(daveRestricted.status, 404);
  assert.equal(daveRestricted.body.error.code, 'WORKSPACE_MEMBERSHIP_NOT_FOUND');

  // Dave creates a resource in his workspace; a member of the OTHER workspace
  // cannot see it, and Dave cannot see hers.
  const daveResource = await request(app)
    .post('/api/enterprise/resources')
    .set('Authorization', bearer('dave'))
    .set('X-Tenant-Id', tenantId)
    .set('X-Workspace-Id', defaultWorkspace)
    .send({ resourceType: 'RESUME', payload: { owner: 'dave' } });
  assert.equal(daveResource.status, 201);

  await service.registry.grantMembership({ tenantId, principalId: 'carol-iso', workspaceId: restrictedWorkspace, roles: ['MEMBER'] });
  const carolResource = await request(app)
    .post('/api/enterprise/resources')
    .set('Authorization', bearer('carol'))
    .set('X-Tenant-Id', tenantId)
    .set('X-Workspace-Id', restrictedWorkspace)
    .send({ resourceType: 'RESUME', payload: { owner: 'carol' } });
  assert.equal(carolResource.status, 201);

  const daveList = await request(app)
    .get('/api/enterprise/resources')
    .set('Authorization', bearer('dave'))
    .set('X-Tenant-Id', tenantId)
    .set('X-Workspace-Id', defaultWorkspace);
  assert.equal(daveList.status, 200);
  const daveIds = daveList.body.resources.map(resource => resource.id);
  assert.ok(daveIds.includes(daveResource.body.resource.id), 'Dave sees his own resource');
  assert.equal(daveIds.indexOf(carolResource.body.resource.id), -1, 'Dave must not see the restricted workspace resource');

  const carolList = await request(app)
    .get('/api/enterprise/resources')
    .set('Authorization', bearer('carol'))
    .set('X-Tenant-Id', tenantId)
    .set('X-Workspace-Id', restrictedWorkspace);
  assert.equal(carolList.status, 200);
  const carolIds = carolList.body.resources.map(resource => resource.id);
  assert.ok(carolIds.includes(carolResource.body.resource.id));
  assert.equal(carolIds.indexOf(daveResource.body.resource.id), -1, 'Carol must not see the default workspace resource');

  // Direct cross-workspace fetch by id is refused for workspace members.
  const daveIntrusion = await request(app)
    .get(`/api/enterprise/resources/${carolResource.body.resource.id}`)
    .set('Authorization', bearer('dave'))
    .set('X-Tenant-Id', tenantId)
    .set('X-Workspace-Id', defaultWorkspace);
  assert.equal(daveIntrusion.status, 404);
  assert.equal(daveIntrusion.body.error.code, 'WORKSPACE_RESOURCE_NOT_FOUND');
});

test('RBAC: role escalation and admin operations are denied without the role', async () => {
  const { service } = installFirestoreBackedService();
  const owner = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  const tenantId = owner.body.context.tenantId;
  const workspaceId = owner.body.context.workspaceId;
  await service.registry.grantMembership({ tenantId, principalId: 'carol-iso', workspaceId, roles: ['MEMBER'] });

  // Carol (MEMBER) tries to grant herself TENANT_OWNER.
  const escalation = await request(app)
    .post('/api/enterprise/memberships')
    .set('Authorization', bearer('carol'))
    .set('X-Tenant-Id', tenantId)
    .send({ principalId: 'carol-iso', roles: ['TENANT_OWNER'] });
  assert.equal(escalation.status, 403);
  assert.equal(escalation.body.error.code, 'TENANT_FORBIDDEN');

  // Carol tries member management, audit, security, settings — all denied.
  for (const [method, path] of [
    ['get', '/api/enterprise/memberships'],
    ['get', '/api/enterprise/audit'],
    ['get', '/api/enterprise/service-accounts'],
  ]) {
    const denied = await request(app)[method](path).set('Authorization', bearer('carol')).set('X-Tenant-Id', tenantId);
    assert.equal(denied.status, 403, `${method.toUpperCase()} ${path} must be forbidden for MEMBER`);
    assert.equal(denied.body.error.code, 'TENANT_FORBIDDEN');
  }
  const configDenied = await request(app)
    .patch('/api/enterprise/configuration')
    .set('Authorization', bearer('carol'))
    .set('X-Tenant-Id', tenantId)
    .send({ expectedRevision: 1, configuration: {} });
  assert.equal(configDenied.status, 403);

  // Owner cannot be demoted away: last-owner protection is enforced.
  const demote = await request(app)
    .patch('/api/enterprise/memberships/alice-iso')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantId)
    .send({ roles: ['MEMBER'] });
  assert.equal(demote.status, 409);
  assert.equal(demote.body.error.code, 'LAST_TENANT_OWNER');
});

test('service accounts: tenant A key cannot act in tenant B and revocation is immediate', async () => {
  const { db, service } = installFirestoreBackedService();
  const owner = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  const tenantId = owner.body.context.tenantId;

  const bobTenant = (await service.registry.provisionTenant({ ownerPrincipalId: 'bob-iso', displayName: 'Bob Co', slug: 'bob-co' })).tenantId;

  const created = await request(app)
    .post('/api/enterprise/service-accounts')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantId)
    .send({ displayName: 'HR Integration', scopes: ['resource.read', 'resource.create'] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const apiKey = created.body.apiKey;
  const accountId = created.body.serviceAccount.id;
  assert.ok(!JSON.stringify(created.body).includes('secretHash'), 'hashes must never be returned');
  assert.ok(!JSON.stringify(db.dump()).includes(apiKey), 'plaintext key must never be persisted');

  // Correct tenant: M2M context resolves.
  const allowed = await request(app)
    .get('/api/enterprise/m2m/context')
    .set('X-API-Key', apiKey)
    .set('X-Tenant-Id', tenantId);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.context.tenantId, tenantId);

  // Wrong tenant: refused.
  const wrongTenant = await request(app)
    .get('/api/enterprise/m2m/context')
    .set('X-API-Key', apiKey)
    .set('X-Tenant-Id', bobTenant);
  assert.equal(wrongTenant.status, 404);

  // Revocation is immediate.
  const revoked = await request(app)
    .post(`/api/enterprise/service-accounts/${accountId}/revoke`)
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantId);
  assert.equal(revoked.status, 204);
  const afterRevoke = await request(app)
    .get('/api/enterprise/m2m/context')
    .set('X-API-Key', apiKey)
    .set('X-Tenant-Id', tenantId);
  assert.equal(afterRevoke.status, 401);
});

test('support grants: expired, revoked, wrong-tenant, and wrong-workspace access all fail closed', async () => {
  const { service } = installFirestoreBackedService();
  const owner = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  const tenantId = owner.body.context.tenantId;
  const workspaceId = owner.body.context.workspaceId;

  const secondWorkspace = (await request(app)
    .post('/api/enterprise/workspaces')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantId)
    .send({ name: 'Secret Wing' })).body.workspace.id;

  // Note: this test suite has no Firebase Auth user store; support eligibility
  // is enforced when admin.auth() exists. The grant store semantics below are
  // exercised directly (creation through the store) to validate time/scope.
  const grantStore = service.supportGrantStore;
  const grant = await grantStore.create({
    tenantId, workspaceId, supportSubjectId: 'support-iso',
    requestedBySubjectId: 'alice-iso', reason: 'Investigate billing discrepancy ticket INC-42',
    expiresInMinutes: 5, scopes: ['tenant.audit.read'],
  });

  const valid = await grantStore.validate({ grantId: grant.id, supportSubjectId: 'support-iso', tenantId, workspaceId, now: Date.now() });
  assert.ok(valid, 'active grant validates');

  const expired = await grantStore.validate({ grantId: grant.id, supportSubjectId: 'support-iso', tenantId, workspaceId, now: Date.now() + 6 * 60_000 });
  assert.equal(expired, null, 'expired grant must fail');

  const wrongWorkspace = await grantStore.validate({ grantId: grant.id, supportSubjectId: 'support-iso', tenantId, workspaceId: secondWorkspace, now: Date.now() });
  assert.equal(wrongWorkspace, null, 'grant is workspace-bound');

  const wrongSubject = await grantStore.validate({ grantId: grant.id, supportSubjectId: 'mallory-iso', tenantId, workspaceId, now: Date.now() });
  assert.equal(wrongSubject, null, 'grant is subject-bound');

  await grantStore.revoke(grant.id, { tenantId, workspaceId });
  const revoked = await grantStore.validate({ grantId: grant.id, supportSubjectId: 'support-iso', tenantId, workspaceId, now: Date.now() });
  assert.equal(revoked, null, 'revoked grant must fail immediately');
});

test('AI quota enforcement is durable and tenant-isolated without any Redis in the process', async () => {
  delete process.env.TENANT_REDIS_URL;
  delete process.env.REDIS_URL;
  const { service } = installFirestoreBackedService();
  const owner = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  const tenantId = owner.body.context.tenantId;

  // Pin a one-request-per-minute quota.
  const pinned = await request(app)
    .patch('/api/enterprise/configuration')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantId)
    .send({ expectedRevision: 1, configuration: { quotaPolicy: { aiRequestsPerMinute: 1, aiRequestsPerDay: 10, renderConcurrency: 2 } } });
  assert.equal(pinned.status, 200, JSON.stringify(pinned.body));

  const headers = { Authorization: bearer('alice'), 'X-Tenant-Id': tenantId };
  // No AI provider is configured in tests: the call still consumes quota
  // (metering precedes provider invocation) and then fails closed.
  const first = await request(app).post('/api/enterprise/ai/generate-content').set(headers).send({ operation: 'generate-summary', payload: { text: 'hello' } });
  assert.ok([403, 502].includes(first.status), `first call consumed quota then failed closed (${first.status})`);

  const second = await request(app).post('/api/enterprise/ai/generate-content').set(headers).send({ operation: 'generate-summary', payload: { text: 'hello' } });
  assert.equal(second.status, 429);
  assert.equal(second.body.error.code, 'TENANT_QUOTA_EXCEEDED');

  // Another tenant is unaffected: quota buckets are tenant-partitioned keys.
  const bobTenant = (await service.registry.provisionTenant({ ownerPrincipalId: 'bob-iso', displayName: 'Quota Co', slug: 'quota-co' })).tenantId;
  const bobFirst = await request(app)
    .post('/api/enterprise/ai/generate-content')
    .set('Authorization', bearer('bob'))
    .set('X-Tenant-Id', bobTenant)
    .send({ operation: 'generate-summary', payload: { text: 'hello' } });
  assert.ok([403, 502].includes(bobFirst.status), `tenant B has its own quota bucket (${bobFirst.status})`);
});

test('durable queue endpoints enforce tenant scoping for listing and replay', async () => {
  const { db, admin, service } = installFirestoreBackedService();
  const owner = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  const tenantId = owner.body.context.tenantId;

  const enqueue = await request(app)
    .post('/api/enterprise/queue/jobs')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantId)
    .send({ jobType: 'EXPORT_PDF', resource: { type: 'RESUME', id: 'res-queue-1' }, idempotencyKey: 'q-1' });
  assert.equal(enqueue.status, 201, JSON.stringify(enqueue.body));

  const listed = await request(app)
    .get('/api/enterprise/queue/jobs')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantId);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.jobs.length, 1);
  assert.equal(listed.body.jobs[0].tenantId, tenantId);
  assert.ok(!listed.body.jobs[0].envelope, 'signed envelope must not be exposed via the API');

  // Tenant B sees nothing and cannot replay tenant A jobs.
  const bobTenant = (await service.registry.provisionTenant({ ownerPrincipalId: 'bob-iso', displayName: 'Queue Co', slug: 'queue-co' })).tenantId;
  const bobList = await request(app)
    .get('/api/enterprise/queue/jobs')
    .set('Authorization', bearer('bob'))
    .set('X-Tenant-Id', bobTenant);
  assert.equal(bobList.status, 200);
  assert.equal(bobList.body.jobs.length, 0);

  const jobId = enqueue.body.jobId;
  const replayDenied = await request(app)
    .post('/api/enterprise/queue/replay')
    .set('Authorization', bearer('bob'))
    .set('X-Tenant-Id', bobTenant)
    .send({ jobId });
  assert.equal(replayDenied.status, 404);

  // Status is truthful and durable.
  const status = await request(app)
    .get('/api/enterprise/queue/status')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantId);
  assert.equal(status.status, 200);
  assert.equal(status.body.queue.durable, true);
  assert.equal(status.body.queue.engine, 'firestore-durable-outbox');
  assert.ok(db && admin, 'harness wired');
});

test('usage endpoint reports real durable accounting for the active tenant only', async () => {
  const { service } = installFirestoreBackedService();
  const owner = await request(app).get('/api/enterprise/context').set('Authorization', bearer('alice'));
  const tenantId = owner.body.context.tenantId;
  const workspaceId = owner.body.context.workspaceId;
  const context = await contextFor(service, 'alice-iso', tenantId, workspaceId);
  await service.recordAiUsage({ context, input: { provider: 'openai', model: 'gpt-4o-mini', operation: 'generate-summary', inputTokens: 500, outputTokens: 250, idempotencyKey: crypto.randomUUID() } });

  const usage = await request(app)
    .get('/api/enterprise/usage/ai')
    .set('Authorization', bearer('alice'))
    .set('X-Tenant-Id', tenantId);
  assert.equal(usage.status, 200);
  assert.equal(usage.body.usage.requests, 1);
  assert.equal(usage.body.usage.inputTokens, 500);

  const bobTenant = (await service.registry.provisionTenant({ ownerPrincipalId: 'bob-iso', displayName: 'Usage Co', slug: 'usage-co' })).tenantId;
  const bobUsage = await request(app)
    .get('/api/enterprise/usage/ai')
    .set('Authorization', bearer('bob'))
    .set('X-Tenant-Id', bobTenant);
  assert.equal(bobUsage.status, 200);
  assert.equal(bobUsage.body.usage.requests, 0, 'tenant B must not observe tenant A usage');
});
