'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MemoryFirestore, createMemoryAdmin } = require('../test/helpers/memoryFirestore');
const { FirestoreEnterpriseRepository, safePayload } = require('../enterprise/firestoreEnterpriseRepository');
const { createEnterpriseRepository } = require('../enterprise/enterpriseRepository');
const { ServerKeyEncryptionProvider, createEncryptionProvider } = require('../enterprise/encryptionProvider');
const { freezeContext } = require('../enterprise/tenantContext');

const KEY = crypto.randomBytes(32).toString('base64');
const ROTATED_KEY = crypto.randomBytes(32).toString('base64');

function buildContext({ tenantId, workspaceId, principal, roles = ['MEMBER'], workspaceScope = 'WORKSPACE' }) {
  return freezeContext({
    tenantId,
    workspaceId,
    principalId: principal,
    subjectId: 'subject-' + principal.slice(0, 8),
    identityIssuer: 'firebase',
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', routingVersion: 1 } },
    membership: { status: 'ACTIVE', roles },
    roles,
    permissions: ['resource.read'],
    workspaceScope,
  });
}

function buildRepository({ encryptionKeys = null } = {}) {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const keys = new Map(Object.entries(encryptionKeys || { v1: Buffer.from(KEY, 'base64') }).map(([version, key]) => [version, Buffer.isBuffer(key) ? key : Buffer.from(key, 'base64')]));
  const encryptionProvider = new ServerKeyEncryptionProvider({ keys });
  const repository = new FirestoreEnterpriseRepository({ db, admin, encryptionProvider });
  return { db, admin, repository, encryptionProvider };
}

test('tenant isolation: a tenant cannot read, list, update, or delete another tenant resources', async () => {
  const { repository } = buildRepository();
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const workspaceA = crypto.randomUUID();
  const workspaceB = crypto.randomUUID();
  const alice = buildContext({ tenantId: tenantA, workspaceId: workspaceA, principal: crypto.randomUUID() });
  const mallory = buildContext({ tenantId: tenantB, workspaceId: workspaceB, principal: crypto.randomUUID() });

  const created = await repository.createResource(alice, { resourceType: 'RESUME', payload: { title: 'Alice resume' } });

  assert.equal(await repository.getResource(mallory, created.id), null, 'cross-tenant read must return not-found');
  assert.deepEqual(await repository.listResources(mallory, {}), [], 'cross-tenant list must be empty');

  assert.equal(await repository.updateResource(mallory, created.id, { expectedRevision: 1, payload: { pwn: true } }), null, 'cross-tenant update must return not-found');
  assert.equal(await repository.deleteResource(mallory, created.id), false, 'cross-tenant delete must return not-found');
  const stillThere = await repository.getResource(alice, created.id);
  assert.equal(stillThere.payload.title, 'Alice resume', 'resource must be untouched after cross-tenant attempts');
});

test('workspace isolation: workspace-scoped principals only see their own workspace', async () => {
  const { repository } = buildRepository();
  const tenantId = crypto.randomUUID();
  const workspaceOne = crypto.randomUUID();
  const workspaceTwo = crypto.randomUUID();
  const principalOne = buildContext({ tenantId, workspaceId: workspaceOne, principal: crypto.randomUUID() });
  const principalTwo = buildContext({ tenantId, workspaceId: workspaceTwo, principal: crypto.randomUUID() });
  const tenantAdmin = buildContext({ tenantId, workspaceId: workspaceOne, principal: crypto.randomUUID(), roles: ['TENANT_ADMIN'], workspaceScope: 'TENANT' });

  await repository.createResource(principalOne, { resourceType: 'RESUME', payload: { ws: 1 } });
  await repository.createResource(principalTwo, { resourceType: 'RESUME', payload: { ws: 2 } });

  assert.equal((await repository.listResources(principalOne, {})).length, 1, 'workspace one sees only its resource');
  assert.equal((await repository.listResources(principalTwo, {})).length, 1, 'workspace two sees only its resource');
  assert.equal((await repository.listResources(tenantAdmin, {})).length, 2, 'tenant-scope admins see both workspaces');

  const twoOnly = (await repository.listResources(principalTwo, {}))[0];
  await assert.rejects(
    () => repository.updateResource(principalOne, twoOnly.id, { expectedRevision: 1, payload: {} }),
    error => error.code === 'WORKSPACE_RESOURCE_NOT_FOUND',
    'workspace-to-workspace update must be refused'
  );
});

test('optimistic concurrency: stale revisions conflict and concurrent updates serialize', async () => {
  const { repository } = buildRepository();
  const context = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const created = await repository.createResource(context, { resourceType: 'RESUME', payload: { rev: 1 } });

  await assert.rejects(
    () => repository.updateResource(context, created.id, { expectedRevision: 99, payload: { rev: 2 } }),
    error => error.code === 'TENANT_RESOURCE_CONFLICT' && error.status === 409
  );

  const concurrent = await Promise.allSettled([
    repository.updateResource(context, created.id, { expectedRevision: 1, payload: { rev: 'a' } }),
    repository.updateResource(context, created.id, { expectedRevision: 1, payload: { rev: 'b' } }),
  ]);
  const fulfilled = concurrent.filter(result => result.status === 'fulfilled');
  const rejected = concurrent.filter(result => result.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'exactly one writer may win a revision');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, 'TENANT_RESOURCE_CONFLICT');
  const final = await repository.getResource(context, created.id);
  assert.equal(final.revision, 2);
});

test('encryption: payloads are sealed at rest, tamper is detected, keys never leave the server', async () => {
  const { db, repository } = buildRepository();
  const context = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const created = await repository.createResource(context, { resourceType: 'RESUME', classification: 'CONFIDENTIAL', payload: { secret: 'compensation-band-9' } });

  const raw = db.documents.get(`tenants/${context.tenantId}/resources/${created.id}`);
  assert.ok(raw.payloadCipher, 'payload must be stored as a cipher envelope');
  assert.ok(!JSON.stringify(raw).includes('compensation-band-9'), 'plaintext must never be persisted');
  const read = await repository.getResource(context, created.id);
  assert.equal(read.payload.secret, 'compensation-band-9');

  // Tamper with the ciphertext → authenticated decryption fails.
  const tampered = JSON.parse(JSON.stringify(raw));
  tampered.payloadCipher.ciphertext = Buffer.from('tampered-data').toString('base64');
  db.documents.set(`tenants/${context.tenantId}/resources/${created.id}`, tampered);
  await assert.rejects(() => repository.getResource(context, created.id), /Unsupported state|authenticate|decrypt|cipher/i);
});

test('encryption: key rotation decrypts old documents and writes with the active version', async () => {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const context = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const v1Provider = new ServerKeyEncryptionProvider({ keys: new Map([['v1', Buffer.from(KEY, 'base64')]]) });
  const repositoryV1 = new FirestoreEnterpriseRepository({ db, admin, encryptionProvider: v1Provider });

  const first = await repositoryV1.createResource(context, { resourceType: 'RESUME', payload: { era: 'v1' } });
  const rawFirst = db.documents.get(`tenants/${context.tenantId}/resources/${first.id}`);
  assert.equal(rawFirst.payloadCipher.keyVersion, 'v1');

  const bothKeys = new Map([['v1', Buffer.from(KEY, 'base64')], ['v2', Buffer.from(ROTATED_KEY, 'base64')]]);
  const rotatedProvider = new ServerKeyEncryptionProvider({ keys: bothKeys, activeVersion: 'v2' });
  const repositoryBoth = new FirestoreEnterpriseRepository({ db, admin, encryptionProvider: rotatedProvider });
  const migrated = await repositoryBoth.updateResource(context, first.id, { expectedRevision: 1, payload: { era: 'v2' } });
  assert.equal(migrated.payload.era, 'v2');
  const rawSecond = db.documents.get(`tenants/${context.tenantId}/resources/${first.id}`);
  assert.equal(rawSecond.payloadCipher.keyVersion, 'v2', 'rewrites must seal with the active key version');

  // Removing an old key fails closed on reads of documents sealed with it.
  const missingOldKeyProvider = new ServerKeyEncryptionProvider({ keys: new Map([['v2', Buffer.from(ROTATED_KEY, 'base64')]]) });
  const repositoryMissingOldKey = new FirestoreEnterpriseRepository({ db, admin, encryptionProvider: missingOldKeyProvider });
  const legacy = await repositoryV1.createResource(context, { resourceType: 'RESUME', classification: 'PRIVATE', payload: { era: 'v1-old' } });
  await assert.rejects(
    () => repositoryMissingOldKey.getResource(context, legacy.id),
    error => error.code === 'ENTERPRISE_ENCRYPTION_UNAVAILABLE',
    'reading a v1-sealed document without v1 configured must fail closed'
  );
});

test('encryption: missing keys fail closed for non-public payloads; public payloads stay readable', async () => {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const repository = new FirestoreEnterpriseRepository({ db, admin, encryptionProvider: null });
  const context = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });

  await assert.rejects(
    () => repository.createResource(context, { resourceType: 'RESUME', classification: 'PRIVATE', payload: { a: 1 } }),
    error => error.code === 'ENTERPRISE_ENCRYPTION_UNAVAILABLE' && error.status === 503,
    'private payload without a key must fail closed'
  );
  const published = await repository.createResource(context, { resourceType: 'ANNOUNCEMENT', classification: 'PUBLIC', payload: { a: 1 } });
  assert.equal(published.payload.a, 1, 'public payloads remain functional without keys');
});

test('encryption provider factory: malformed configuration is refused loudly', () => {
  assert.throws(() => createEncryptionProvider({ ENTERPRISE_ENCRYPTION_KEY: 'short' }), /32-byte/);
  assert.throws(() => createEncryptionProvider({ ENTERPRISE_ENCRYPTION_KEYS: '{not-json' }), /ENTERPRISE_ENCRYPTION_KEYS/);
  assert.throws(() => createEncryptionProvider({ ENTERPRISE_ENCRYPTION_PROVIDER: 'hsm' }), /Unknown enterprise encryption provider/);
});

test('repository factory: provider selection is explicit and interface-complete', async () => {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const repository = createEnterpriseRepository({ environment: { ENTERPRISE_DATA_PROVIDER: 'firestore' }, db, admin });
  assert.equal(repository.providerName, 'firestore');

  assert.throws(
    () => createEnterpriseRepository({ environment: { ENTERPRISE_DATA_PROVIDER: 'postgres' }, db, admin }),
    error => error.code === 'ENTERPRISE_DATA_PROVIDER_UNAVAILABLE',
    'postgres without TENANT_DATABASE_URL must fail closed'
  );
  assert.throws(
    () => createEnterpriseRepository({ environment: { ENTERPRISE_DATA_PROVIDER: 'db2' }, db, admin }),
    error => error.code === 'ENTERPRISE_DATA_PROVIDER_INVALID'
  );
});

test('audit events are partitioned per tenant and never leak across contexts', async () => {
  const { repository } = buildRepository();
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const alice = buildContext({ tenantId: tenantA, workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const bob = buildContext({ tenantId: tenantB, workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });

  await repository.createResource(alice, { resourceType: 'RESUME', payload: {} });
  await repository.appendAuditEvent(bob, { action: 'TENANT_B_EVENT', category: 'tenant.test' });

  const aliceEvents = await repository.listAuditEvents(alice, {});
  assert.ok(aliceEvents.every(event => event.tenantId === tenantA));
  assert.ok(aliceEvents.some(event => event.action === 'RESOURCE_CREATED'));
  const bobEvents = await repository.listAuditEvents(bob, {});
  assert.ok(bobEvents.every(event => event.tenantId === tenantB));
  assert.ok(!bobEvents.some(event => event.action === 'RESOURCE_CREATED'), 'tenant B must not observe tenant A audit trail');
});

test('AI usage ledger is idempotent per correlation and isolated per tenant', async () => {
  const { repository } = buildRepository();
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const alice = buildContext({ tenantId: tenantA, workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const bob = buildContext({ tenantId: tenantB, workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });

  const first = await repository.recordAiUsage(alice, { provider: 'openai', model: 'gpt-4o-mini', operation: 'IMPROVE_BULLET', inputTokens: 120, outputTokens: 80, idempotencyKey: 'corr-1' });
  const duplicate = await repository.recordAiUsage(alice, { provider: 'openai', model: 'gpt-4o-mini', operation: 'IMPROVE_BULLET', inputTokens: 120, outputTokens: 80, idempotencyKey: 'corr-1' });
  assert.equal(first.outcome, 'RECORDED');
  assert.equal(duplicate.outcome, 'DUPLICATE_IGNORED');

  await repository.recordAiUsage(bob, { provider: 'openai', model: 'gpt-4o-mini', operation: 'IMPROVE_BULLET', inputTokens: 500, outputTokens: 500, idempotencyKey: 'corr-1' });

  const summaryA = await repository.getAiUsageSummary(alice, {});
  const summaryB = await repository.getAiUsageSummary(bob, {});
  assert.equal(summaryA.requests, 1, 'duplicate delivery must not double count');
  assert.equal(summaryA.inputTokens, 120);
  assert.equal(summaryB.requests, 1, 'same idempotency key in another tenant is a distinct ledger entry');
  assert.equal(summaryB.inputTokens, 500);
});

test('concurrent AI accounting is atomic: parallel workers never lose increments', async () => {
  const { repository } = buildRepository();
  const context = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  await Promise.all(
    Array.from({ length: 25 }, (_, index) => repository.recordAiUsage(context, { provider: 'openai', model: 'gpt-4o-mini', operation: 'GENERATE', inputTokens: 10, outputTokens: 5, idempotencyKey: `burst-${index}` }))
  );
  const summary = await repository.getAiUsageSummary(context, {});
  assert.equal(summary.requests, 25, 'every recorded request must be counted exactly once');
  assert.equal(summary.inputTokens, 250);
  assert.equal(summary.outputTokens, 125);
  assert.equal(summary.byWorkspace[context.workspaceId].requests, 25, 'workspace rollup must match');
  assert.equal(summary.byProvider.openai, 25, 'provider rollup must match');
  assert.equal(summary.byModel['gpt-4o-mini'], 25, 'model rollup must match');
});

test('payload validation rejects malformed input before any write', () => {
  assert.throws(() => safePayload('not-an-object'), /must be an object/);
  assert.throws(() => safePayload([]), /must be an object/);
  assert.throws(() => safePayload({ giant: 'x'.repeat(200_000) }), /too large/);
});
