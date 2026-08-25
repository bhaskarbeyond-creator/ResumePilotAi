'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  InMemoryTenantRegistry,
  membershipDocumentId,
} = require('../enterprise/tenantRegistry');
const { canonicalPrincipalId, freezeContext, tenantContextAuditProjection } = require('../enterprise/tenantContext');
const { hasTenantPermission } = require('../enterprise/tenantPolicy');
const { globalCacheKey, tenantCacheKey, tenantCachePrefix, tenantRateLimitKey } = require('../enterprise/tenantCache');
const { createTenantJobEnvelope, validateTenantJobEnvelope } = require('../enterprise/tenantJobs');
const { assertStorageContext, tenantObjectKey } = require('../enterprise/tenantStorage');
const { classifyLegacyResource, createMigrationLedgerRecord } = require('../enterprise/firebaseBridge');
const { queueEmailInTransaction } = require('../services/notificationOutbox');
const { InMemoryAtomicCounterStore, TenantQuotaGuard } = require('../enterprise/tenantQuota');
const { applyTenantAiPolicy, assertNoClientAuthority, buildTenantAiOperation } = require('../enterprise/tenantAi');
const { createApiKeyMaterial, verifyApiKeyRecord } = require('../enterprise/serviceIdentity');
const { buildPersonalResumeMigrationPlan, reconcileAggregate, reconcileCollection } = require('../enterprise/firebaseMigrationAdapter');
const { createTenantArtifactToken, verifyTenantArtifactToken } = require('../enterprise/tenantSignedArtifacts');
const { buildTenantTelemetry, tenantMetricLabels } = require('../enterprise/tenantTelemetry');
const { assertSameInfrastructureRoute, resolveTenantInfrastructure } = require('../enterprise/tenantRouting');
const { legacyDocumentPath, tenantMigrationTarget } = require('../enterprise/certifiedModuleBridge');

const PRINCIPAL_A = 'firebase-user-a';
const PRINCIPAL_B = 'firebase-user-b';

async function contextFor(registry, principalId, tenantId = null) {
  const resolved = await registry.resolveMembership({ principalId, requestedTenantId: tenantId, profile: { displayName: principalId } });
  return freezeContext({
    requestId: 'req-enterprise',
    principalId: resolved.membership.canonicalPrincipalId,
    subjectId: principalId,
    tenantId: resolved.tenant.id,
    workspaceId: resolved.workspace.id,
    tenant: resolved.tenant,
    membership: resolved.membership,
    permissions: ['resource.read', 'resource.create', 'ai.use'],
    workspaceScope: resolved.membership.roles.some(role => ['TENANT_OWNER', 'TENANT_ADMIN'].includes(role)) ? 'TENANT' : 'WORKSPACE',
    dataPlane: resolved.tenant.dataPlane,
  });
}

test('personal tenants are deterministic per principal and cross-tenant membership is denied', async () => {
  const registry = new InMemoryTenantRegistry();
  const first = await registry.ensurePersonalTenant(PRINCIPAL_A, { displayName: 'Asha' });
  const again = await registry.ensurePersonalTenant(PRINCIPAL_A, { displayName: 'Asha' });
  const other = await registry.ensurePersonalTenant(PRINCIPAL_B, { displayName: 'Bala' });
  assert.deepEqual(again, first);
  assert.notEqual(first.tenantId, other.tenantId);
  assert.match(first.tenantId, /^[0-9a-f-]{36}$/i);
  await assert.rejects(() => registry.resolveMembership({ principalId: PRINCIPAL_A, requestedTenantId: other.tenantId }), error => error.code === 'TENANT_MEMBERSHIP_NOT_FOUND');
  assert.equal(membershipDocumentId(first.tenantId, PRINCIPAL_A), membershipDocumentId(first.tenantId, PRINCIPAL_A));
});

test('certified-module Firebase bridge only maps a personal tenant to its verified legacy UID tree', async () => {
  const registry = new InMemoryTenantRegistry();
  const resolved = await registry.resolveMembership({ principalId: PRINCIPAL_A, profile: { displayName: 'Asha' } });
  const context = await contextFor(registry, PRINCIPAL_A);
  const path = legacyDocumentPath({ context, tenant: resolved.tenant, sourceUid: PRINCIPAL_A, collection: 'RESUME', documentId: 'resume_001' });
  assert.equal(path, `users/${PRINCIPAL_A}/resumes/resume_001`);
  assert.equal(tenantMigrationTarget({ tenantId: context.tenantId, workspaceId: context.workspaceId, resourceType: 'resume', legacyDocumentId: 'resume_001' }).tenantId, context.tenantId);
  const business = await registry.provisionTenant({ ownerPrincipalId: PRINCIPAL_B, displayName: 'Acme', slug: 'acme' });
  await registry.grantMembership({ tenantId: business.tenantId, principalId: PRINCIPAL_A, workspaceId: business.workspaceId, roles: ['MEMBER'] });
  const businessContext = await contextFor(registry, PRINCIPAL_A, business.tenantId);
  const businessTenant = await registry.getTenant(business.tenantId);
  assert.throws(() => legacyDocumentPath({ context: businessContext, tenant: businessTenant, sourceUid: PRINCIPAL_A, collection: 'RESUME', documentId: 'resume_001' }), error => error.code === 'LEGACY_TENANT_RESOURCE_NOT_FOUND');
});

test('verified external identity subjects map deterministically to canonical UUID principals for PostgreSQL', async () => {
  const first = canonicalPrincipalId(PRINCIPAL_A);
  assert.match(first, /^[0-9a-f-]{36}$/i);
  assert.equal(canonicalPrincipalId(PRINCIPAL_A), first);
  assert.notEqual(canonicalPrincipalId(PRINCIPAL_B), first);
  assert.notEqual(canonicalPrincipalId(PRINCIPAL_A, 'oidc:example'), first);
  const registry = new InMemoryTenantRegistry();
  const personal = await registry.ensurePersonalTenant(PRINCIPAL_A);
  const record = registry.memberships.get(membershipDocumentId(personal.tenantId, PRINCIPAL_A));
  record.canonicalPrincipalId = canonicalPrincipalId(PRINCIPAL_B);
  await assert.rejects(() => registry.getMembership(personal.tenantId, PRINCIPAL_A), error => error.code === 'TENANT_IDENTITY_MISMATCH');
});

test('a principal can safely belong to multiple tenants through explicit membership records', async () => {
  const registry = new InMemoryTenantRegistry();
  const personal = await registry.ensurePersonalTenant(PRINCIPAL_A, { displayName: 'Asha' });
  const business = await registry.provisionTenant({ ownerPrincipalId: PRINCIPAL_B, displayName: 'Northwind', slug: 'northwind' });
  const membership = await registry.grantMembership({ tenantId: business.tenantId, principalId: PRINCIPAL_A, workspaceId: business.workspaceId, roles: ['MEMBER'] });
  assert.equal(membership.status, 'ACTIVE');
  const memberships = await registry.listMemberships(PRINCIPAL_A);
  assert.equal(memberships.length, 2);
  assert.equal(memberships.some(item => item.tenant.id === personal.tenantId), true);
  assert.equal(memberships.some(item => item.tenant.id === business.tenantId), true);
  const businessContext = await contextFor(registry, PRINCIPAL_A, business.tenantId);
  assert.equal(businessContext.tenantId, business.tenantId);
  assert.equal(businessContext.roles.includes('MEMBER'), true);
  const hiddenWorkspaceId = '44444444-4444-4444-8444-444444444444';
  registry.workspaces.set(hiddenWorkspaceId, { id: hiddenWorkspaceId, tenantId: business.tenantId, name: 'Restricted', lifecycleState: 'ACTIVE', isDefault: false });
  await assert.rejects(() => registry.resolveMembership({ principalId: PRINCIPAL_A, requestedTenantId: business.tenantId, requestedWorkspaceId: hiddenWorkspaceId }), error => error.code === 'WORKSPACE_MEMBERSHIP_NOT_FOUND');
  const ownerContext = await contextFor(registry, PRINCIPAL_B, business.tenantId);
  const ownerAccess = await registry.resolveMembership({ principalId: PRINCIPAL_B, requestedTenantId: business.tenantId, requestedWorkspaceId: hiddenWorkspaceId });
  assert.equal(ownerContext.workspaceScope, 'TENANT');
  assert.equal(ownerAccess.workspace.id, hiddenWorkspaceId);
});

test('membership grants verify known server-side identities when an identity provider is available', async () => {
  const registry = new InMemoryTenantRegistry();
  const owner = await contextFor(registry, PRINCIPAL_A);
  const { TenantService } = require('../enterprise/tenantService');
  const service = new TenantService({ registry, admin: { auth: () => ({ getUser: async uid => {
    if (uid === 'known-principal') return { uid, disabled: false };
    const error = new Error('not found');
    error.code = 'auth/user-not-found';
    throw error;
  } }) } });
  const granted = await service.grantMembership({ context: owner, input: { principalId: 'known-principal', roles: ['MEMBER'] } });
  assert.equal(granted.principalId, 'known-principal');
  await assert.rejects(() => service.grantMembership({ context: owner, input: { principalId: 'unknown-principal', roles: ['MEMBER'] } }), error => error.code === 'TARGET_PRINCIPAL_NOT_FOUND');
  const nonOwner = { ...owner, roles: ['TENANT_ADMIN'] };
  await assert.rejects(() => service.grantMembership({ context: nonOwner, input: { principalId: 'known-principal', roles: ['TENANT_OWNER'] } }), error => error.code === 'TENANT_OWNER_GRANT_FORBIDDEN');
});

test('workspace access consistently uses external subject for control-plane membership and canonical principal for data rows', async () => {
  const registry = new InMemoryTenantRegistry();
  const business = await registry.provisionTenant({ ownerPrincipalId: PRINCIPAL_B, displayName: 'Northwind', slug: 'northwind-subject-check' });
  await registry.grantMembership({ tenantId: business.tenantId, principalId: PRINCIPAL_A, workspaceId: business.workspaceId, roles: ['MEMBER'] });
  const { TenantService } = require('../enterprise/tenantService');
  const service = new TenantService({ registry });
  const resolved = await service.resolveContext({ user: { uid: PRINCIPAL_A, email: 'a@example.com', claims: {} }, requestedTenantId: business.tenantId, requestedWorkspaceId: business.workspaceId, requestId: 'subject-check' });
  assert.notEqual(resolved.context.principalId, PRINCIPAL_A);
  assert.equal(resolved.context.subjectId, PRINCIPAL_A);
  const workspaces = await service.listWorkspaces({ context: resolved.context });
  assert.deepEqual(workspaces.map(item => item.id), [business.workspaceId]);
});

test('tenant lifecycle transitions suspend access and reject unsafe direct deletion jumps', async () => {
  const registry = new InMemoryTenantRegistry();
  const personal = await registry.ensurePersonalTenant(PRINCIPAL_A, { displayName: 'Asha' });
  const suspended = await registry.setTenantLifecycleState({ tenantId: personal.tenantId, nextState: 'SUSPENDED' });
  assert.equal(suspended.lifecycleState, 'SUSPENDED');
  await assert.rejects(() => registry.resolveMembership({ principalId: PRINCIPAL_A, requestedTenantId: personal.tenantId }), error => error.code === 'TENANT_INACTIVE');
  const active = await registry.setTenantLifecycleState({ tenantId: personal.tenantId, nextState: 'ACTIVE' });
  assert.equal(active.lifecycleState, 'ACTIVE');
  await assert.rejects(() => registry.setTenantLifecycleState({ tenantId: personal.tenantId, nextState: 'DELETED' }), error => error.code === 'INVALID_TENANT_LIFECYCLE_TRANSITION');
});

test('tenant context is immutable, policy-derived, and cannot be created for a suspended tenant', async () => {
  const registry = new InMemoryTenantRegistry();
  const context = await contextFor(registry, PRINCIPAL_A);
  assert.equal(Object.isFrozen(context), true);
  assert.equal(context.roles.includes('TENANT_OWNER'), true);
  assert.equal(hasTenantPermission(context, 'resource.read'), true);
  assert.throws(() => { context.tenantId = 'changed'; }, TypeError);
  const tenant = registry.tenants.get(context.tenantId);
  tenant.lifecycleState = 'SUSPENDED';
  await assert.rejects(() => contextFor(registry, PRINCIPAL_A), error => error.code === 'TENANT_INACTIVE');
});

test('tenant cache keys cannot collide while intentionally global keys remain distinct', async () => {
  const registry = new InMemoryTenantRegistry();
  const a = await contextFor(registry, PRINCIPAL_A);
  const b = await contextFor(registry, PRINCIPAL_B);
  const aKey = tenantCacheKey({ tenantId: a.tenantId, workspaceId: a.workspaceId, domain: 'resume', resourceId: 'same-id', revision: 1 });
  const bKey = tenantCacheKey({ tenantId: b.tenantId, workspaceId: b.workspaceId, domain: 'resume', resourceId: 'same-id', revision: 1 });
  assert.notEqual(aKey, bKey);
  assert.match(aKey, new RegExp(`tenant:${a.tenantId}`));
  assert.match(tenantRateLimitKey({ tenantId: a.tenantId, principalId: PRINCIPAL_A, operation: 'ai', window: '60s' }), /rate-ai-60s/);
  assert.notEqual(tenantCachePrefix({ tenantId: a.tenantId, workspaceId: a.workspaceId }), tenantCachePrefix({ tenantId: b.tenantId, workspaceId: b.workspaceId }));
  assert.equal(globalCacheKey({ domain: 'template-catalog', revision: 3 }), 'v1:global:domain:template-catalog:revision:3');
});

test('tenant telemetry carries audit correlation while avoiding raw tenant IDs in broad metric labels', async () => {
  const registry = new InMemoryTenantRegistry();
  const context = await contextFor(registry, PRINCIPAL_A);
  const telemetry = buildTenantTelemetry(context, { event: 'resource.read', operation: 'resume.load', durationMs: 42, resource: { type: 'RESUME', id: 'r1' } });
  assert.equal(telemetry.tenantId, context.tenantId);
  assert.equal(telemetry.correlationId, context.correlationId);
  const labels = tenantMetricLabels(context, { operation: 'resume.load', outcome: 'success' });
  assert.equal(Object.hasOwn(labels, 'tenantId'), false);
  assert.equal(labels.dataPlaneType, context.dataPlane.type);
});

test('tenant quota guard partitions noisy-neighbor limits by tenant and principal scope', async () => {
  let now = Date.parse('2026-08-20T00:00:00Z');
  const registry = new InMemoryTenantRegistry();
  const a = await contextFor(registry, PRINCIPAL_A);
  const b = await contextFor(registry, PRINCIPAL_B);
  const guard = new TenantQuotaGuard({ store: new InMemoryAtomicCounterStore({ now: () => now }), now: () => now });
  const first = await guard.consume({ context: a, metric: 'ai', limit: 2, windowMs: 60_000 });
  assert.equal(first.remaining, 1);
  await guard.consume({ context: a, metric: 'ai', limit: 2, windowMs: 60_000 });
  await assert.rejects(() => guard.consume({ context: a, metric: 'ai', limit: 2, windowMs: 60_000 }), error => error.code === 'TENANT_QUOTA_EXCEEDED');
  const otherTenant = await guard.consume({ context: b, metric: 'ai', limit: 2, windowMs: 60_000 });
  assert.equal(otherTenant.used, 1);
  now += 61_000;
  const nextWindow = await guard.consume({ context: a, metric: 'ai', limit: 2, windowMs: 60_000 });
  assert.equal(nextWindow.used, 1);
});

test('tenant file namespace rejects cross-tenant storage keys', async () => {
  const registry = new InMemoryTenantRegistry();
  const a = await contextFor(registry, PRINCIPAL_A);
  const b = await contextFor(registry, PRINCIPAL_B);
  const key = tenantObjectKey({ tenantId: a.tenantId, workspaceId: a.workspaceId, resourceType: 'resume', resourceId: 'same-resource', category: 'generated', extension: 'pdf' });
  assert.match(key, new RegExp(`^tenants/${a.tenantId}/workspaces/${a.workspaceId}/`));
  assert.equal(assertStorageContext(a, key).tenantId, a.tenantId);
  assert.throws(() => assertStorageContext(b, key), error => error.code === 'TENANT_STORAGE_NOT_FOUND');
});

test('tenant artifact tokens are purpose-bound, short-lived, signed and unavailable to another tenant', async () => {
  const registry = new InMemoryTenantRegistry();
  const a = await contextFor(registry, PRINCIPAL_A);
  const b = await contextFor(registry, PRINCIPAL_B);
  const objectKey = tenantObjectKey({ tenantId: a.tenantId, workspaceId: a.workspaceId, resourceType: 'resume', resourceId: 'same', category: 'generated', extension: 'pdf' });
  const secret = 's'.repeat(48);
  const token = createTenantArtifactToken({ context: a, objectKey, purpose: 'DOWNLOAD', signingSecret: secret, now: 1_000, expiresInMs: 60_000 });
  assert.equal(verifyTenantArtifactToken({ context: a, token, purpose: 'DOWNLOAD', signingSecret: secret, now: 2_000 }).objectKey, objectKey);
  assert.throws(() => verifyTenantArtifactToken({ context: b, token, purpose: 'DOWNLOAD', signingSecret: secret, now: 2_000 }), error => error.code === 'TENANT_ARTIFACT_NOT_FOUND');
  assert.throws(() => verifyTenantArtifactToken({ context: a, token, purpose: 'UPLOAD', signingSecret: secret, now: 2_000 }), error => error.code === 'INVALID_TENANT_ARTIFACT_TOKEN');
  assert.throws(() => verifyTenantArtifactToken({ context: a, token, purpose: 'DOWNLOAD', signingSecret: secret, now: 62_000 }), error => error.code === 'INVALID_TENANT_ARTIFACT_TOKEN');
});

test('service-account API keys are tenant-bound, scoped, hashed, expirable and never verified by prefix alone', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const workspaceId = '22222222-2222-4222-8222-222222222222';
  const serviceAccountId = '33333333-3333-4333-8333-333333333333';
  const material = createApiKeyMaterial({ tenantId, workspaceId, serviceAccountId, scopes: ['resource.read', 'ai.use'], expiresAt: '2026-12-01T00:00:00.000Z', now: new Date('2026-08-20T00:00:00.000Z') });
  assert.match(material.plaintext, /^rpa_/);
  assert.equal(material.record.tenantId, tenantId);
  assert.equal(material.record.secretHash.includes(material.plaintext), false);
  assert.equal(verifyApiKeyRecord(material.record, material.plaintext, { now: new Date('2026-09-01T00:00:00.000Z') }), true);
  assert.equal(verifyApiKeyRecord(material.record, `${material.plaintext}tampered`, { now: new Date('2026-09-01T00:00:00.000Z') }), false);
  assert.equal(verifyApiKeyRecord(material.record, material.plaintext, { now: new Date('2027-01-01T00:00:00.000Z') }), false);
});

test('tenant AI policy rejects client-controlled authority and prevents cross-tenant source/cache contamination', async () => {
  const registry = new InMemoryTenantRegistry();
  const a = await contextFor(registry, PRINCIPAL_A);
  const b = await contextFor(registry, PRINCIPAL_B);
  assert.throws(() => assertNoClientAuthority({ tenantId: b.tenantId }), error => error.code === 'CLIENT_AI_CONTEXT_REJECTED');
  assert.throws(() => buildTenantAiOperation({ context: a, operation: 'generate-summary', payload: { occupation: 'Engineer' }, sourceResources: [{ id: 'r1', revision: 1, tenantId: b.tenantId, workspaceId: b.workspaceId }] }), error => error.code === 'TENANT_AI_SOURCE_DENIED');
  const operation = buildTenantAiOperation({ context: a, operation: 'generate-summary', payload: { occupation: 'Engineer' }, sourceResources: [{ id: 'r1', revision: 1, tenantId: a.tenantId, workspaceId: a.workspaceId }] });
  assert.match(operation.cacheKey, new RegExp(`tenant:${a.tenantId}`));
  const config = applyTenantAiPolicy({ primary: 'gemini', providers: { gemini: { enabled: true, key: 'gemini-fixture' }, openai: { enabled: true, key: 'sk-fixture' } } }, a, { allowedProviders: ['openai'], version: 4 });
  assert.equal(config.providers.gemini.enabled, false);
  assert.equal(config.primary, 'openai');
  assert.throws(() => applyTenantAiPolicy({ primary: 'gemini', providers: { gemini: { enabled: true, key: 'gemini-fixture' } } }, a, { allowedProviders: [] }), error => error.code === 'TENANT_AI_PROVIDER_UNAVAILABLE');
  // Regression: a provider without an effective key is disabled (fail closed),
  // because loadProviderConfiguration() only marks keyless providers disabled.
  const keyless = applyTenantAiPolicy({ primary: 'gemini', providers: { gemini: { enabled: true }, openai: { enabled: true, key: 'sk-fixture' } } }, a, { allowedProviders: ['gemini', 'openai'] });
  assert.equal(keyless.providers.gemini.enabled, false, 'keyless provider is disabled');
  assert.equal(keyless.primary, 'openai', 'primary falls through to a keyed provider');
  assert.throws(() => applyTenantAiPolicy({ primary: 'gemini', providers: { gemini: { enabled: true } } }, a, { allowedProviders: ['gemini'] }), error => error.code === 'TENANT_AI_PROVIDER_UNAVAILABLE');
});

test('tenant repository enforces tenant partitioning and workspace scope in queries', async () => {
  const { MemoryFirestore, createMemoryAdmin } = require('../test/helpers/memoryFirestore');
  const { FirestoreEnterpriseRepository } = require('../enterprise/firestoreEnterpriseRepository');
  const { ServerKeyEncryptionProvider } = require('../enterprise/encryptionProvider');
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const repository = new FirestoreEnterpriseRepository({
    db,
    admin,
    encryptionProvider: new ServerKeyEncryptionProvider({ keys: new Map([['v1', require('node:crypto').randomBytes(32)]]) }),
  });
  const context = { ...(await contextFor(new InMemoryTenantRegistry(), PRINCIPAL_A)), workspaceScope: 'WORKSPACE' };
  const otherWorkspaceContext = { ...context, workspaceId: '99999999-9999-4999-8999-999999999999', workspaceScope: 'WORKSPACE' };
  await repository.createResource(context, { id: '11111111-1111-4111-8111-111111111111', resourceType: 'NOTE', payload: { a: 1 } });
  // A different workspace of the same tenant cannot list or read it.
  assert.equal((await repository.listResources(otherWorkspaceContext, {})).length, 0, 'listing applies the workspace predicate');
  await assert.rejects(
    () => repository.getResource(otherWorkspaceContext, '11111111-1111-4111-8111-111111111111'),
    error => error.code === 'WORKSPACE_RESOURCE_NOT_FOUND' && error.status === 404,
    'cross-workspace reads must fail closed'
  );
  const own = await repository.getResource(context, '11111111-1111-4111-8111-111111111111');
  assert.equal(own.tenantId, context.tenantId);
  assert.ok(db.documents.has(`tenants/${context.tenantId}/resources/11111111-1111-4111-8111-111111111111`), 'writes land in the tenant partition');
});

test('tenant jobs are signed, context complete, tamper resistant, and expire', async () => {
  const registry = new InMemoryTenantRegistry();
  const context = await contextFor(registry, PRINCIPAL_A);
  const secret = 'a'.repeat(48);
  const envelope = createTenantJobEnvelope({
    context,
    jobType: 'AI_GENERATE',
    resource: { type: 'RESUME', id: 'resume-1', revision: 4 },
    idempotencyKey: 'job:resume-1:4',
    signingSecret: secret,
    now: new Date('2026-08-20T00:00:00Z'),
  });
  assert.equal(validateTenantJobEnvelope(envelope, secret, { now: Date.parse('2026-08-20T00:01:00Z') }).tenantId, context.tenantId);
  await assert.rejects(async () => validateTenantJobEnvelope({ ...envelope, tenantId: cryptoRandomTenant() }, secret), error => error.code === 'INVALID_TENANT_JOB_SIGNATURE');
  await assert.rejects(async () => validateTenantJobEnvelope(envelope, secret, { now: Date.parse('2026-08-22T00:00:00Z') }), error => error.code === 'EXPIRED_TENANT_JOB');
});

function cryptoRandomTenant() {
  return '11111111-1111-4111-8111-111111111111';
}

test('tenant-bound notification outbox records persist immutable tenant context for worker reauthorization', async () => {
  const registry = new InMemoryTenantRegistry();
  const context = await contextFor(registry, PRINCIPAL_A);
  let written;
  const db = { collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }) };
  const transaction = { set(reference, value) { written = { reference, value }; } };
  const admin = { firestore: { Timestamp: { fromMillis: value => ({ value }) }, FieldValue: { serverTimestamp: () => ({ server: true }) } } };
  queueEmailInTransaction(transaction, db, admin, { eventId: 'tenant-event-1', recipient: 'user@example.com', templateType: 'notification', tenantContext: context });
  assert.equal(written.value.tenant.tenantId, context.tenantId);
  assert.equal(written.value.tenant.workspaceId, context.workspaceId);
  assert.equal(written.value.tenant.correlationId, context.correlationId);
});

test('tenant outbox reauthorization resolves current membership, lifecycle and route before dispatch', async () => {
  const registry = new InMemoryTenantRegistry();
  const context = await contextFor(registry, PRINCIPAL_A);
  const { TenantService } = require('../enterprise/tenantService');
  const service = new TenantService({ registry });
  const event = { tenant: tenantContextAuditProjection(context) };
  assert.equal(await service.authorizeOutboxEvent(event), true);
  assert.equal(await service.authorizeOutboxEvent({ tenant: { ...event.tenant, identityIssuer: 'oidc:example' } }), false);
  assert.equal(await service.authorizeOutboxEvent({ tenant: { ...event.tenant, tenantId: '11111111-1111-4111-8111-111111111111' } }), false);
  await registry.setTenantLifecycleState({ tenantId: context.tenantId, nextState: 'SUSPENDED' });
  assert.equal(await service.authorizeOutboxEvent(event), false);
});

test('legacy bridge permits deterministic personal resources and blocks ambiguous ownership', () => {
  const resume = classifyLegacyResource('resume', { userId: PRINCIPAL_A });
  assert.equal(resume.migrationStatus, 'ELIGIBLE_AFTER_ADAPTER');
  const ledger = createMigrationLedgerRecord({
    sourceStore: 'firestore', sourcePath: `users/${PRINCIPAL_A}/resumes/r1`, sourceUid: PRINCIPAL_A,
    sourceData: { id: 'r1', summary: 'private' }, tenantId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222', resourceType: 'resume', ownership: resume,
  });
  assert.equal(ledger.status, 'PLANNED');
  const company = classifyLegacyResource('company', { employerId: PRINCIPAL_A });
  assert.equal(company.migrationStatus, 'BLOCKED_OWNERSHIP');
  assert.throws(() => createMigrationLedgerRecord({ sourcePath: 'companies/c1', sourceData: {}, resourceType: 'company', ownership: company }), error => error.code === 'LEGACY_OWNERSHIP_AMBIGUOUS');
});

test('Firebase adapter creates reversible personal-resume migration plans and checksum reconciliation', () => {
  const source = { revision: 3, firstname: 'Asha', employments: [{ id: 'e1', jobTitle: 'Engineer' }] };
  const plan = buildPersonalResumeMigrationPlan({
    uid: PRINCIPAL_A,
    resumeId: 'resume_1234',
    source,
    personalTenantId: '11111111-1111-4111-8111-111111111111',
    personalWorkspaceId: '22222222-2222-4222-8222-222222222222',
  });
  assert.equal(plan.mode, 'ADAPTER_FIRST');
  assert.equal(plan.rollback.sourceRemainsAuthoritative, true);
  assert.equal(plan.target.tenantId, '11111111-1111-4111-8111-111111111111');
  assert.equal(reconcileAggregate({ source, target: { ...source } }).matches, true);
  assert.equal(reconcileAggregate({ source, target: { ...source, firstname: 'Different' } }).matches, false);
  const reconciliation = reconcileCollection({
    sourceRecords: [{ id: 'a', data: { name: 'A' } }, { id: 'b', data: { name: 'B' } }],
    targetRecords: [{ legacyDocumentId: 'a', data: { name: 'A' } }, { legacyDocumentId: 'b', data: { name: 'Different' } }, { legacyDocumentId: 'extra', data: {} }],
  });
  assert.deepEqual(reconciliation.checksumMismatches, ['b']);
  assert.deepEqual(reconciliation.unexpectedTarget, ['extra']);
  assert.equal(reconciliation.matches, false);
});

test('database, job, artifact, cache, queue and AI profiles derive from one canonical infrastructure route', async () => {
  const registry = new InMemoryTenantRegistry();
  const context = await contextFor(registry, PRINCIPAL_A);
  const route = resolveTenantInfrastructure(context);
  assert.equal(route.dataPlaneId, context.dataPlane.id);
  assert.equal(route.cacheProfile, context.dataPlane.cacheProfile);
  assert.equal(route.queueProfile, context.dataPlane.queueProfile);
  assert.equal(route.storageProfile, context.dataPlane.storageProfile);
  assert.equal(route.aiProfile, context.dataPlane.aiProfile);
  assertSameInfrastructureRoute(context, route);
  assert.throws(() => assertSameInfrastructureRoute(context, { ...route, dataPlaneId: 'wrong-plane' }), error => error.code === 'TENANT_ROUTE_MISMATCH');
});


