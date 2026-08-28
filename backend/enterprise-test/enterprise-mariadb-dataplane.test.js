'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { InMemoryEnterpriseRepository } = require('../test/helpers/inMemoryEnterpriseRepository');
const { safePayload } = require('../enterprise/mysqlEnterpriseRepository');
const { createEnterpriseRepository } = require('../enterprise/enterpriseRepository');
const { ServerKeyEncryptionProvider, createEncryptionProvider } = require('../enterprise/encryptionProvider');
const { freezeContext } = require('../enterprise/tenantContext');

const KEY = crypto.randomBytes(32).toString('base64');
const ROTATED_KEY = crypto.randomBytes(32).toString('base64');

function buildContext({ tenantId, workspaceId, principal, roles = ['MEMBER'], workspaceScope = 'WORKSPACE' }) {
  return freezeContext({
    tenantId, workspaceId, principalId: principal,
    subjectId: `subject-${principal.slice(0, 8)}`, identityIssuer: 'firebase',
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD' },
    membership: { status: 'ACTIVE', roles }, roles, permissions: ['resource.read'], workspaceScope,
    dataPlane: { id: 'mysql-primary', type: 'MYSQL', region: 'default', routingVersion: 1 },
  });
}

function provider(keys = { v1: Buffer.from(KEY, 'base64') }, activeVersion = null) {
  const normalized = new Map(Object.entries(keys).map(([version, key]) => [version, Buffer.isBuffer(key) ? key : Buffer.from(key, 'base64')]));
  return new ServerKeyEncryptionProvider({ keys: normalized, ...(activeVersion ? { activeVersion } : {}) });
}

function buildRepository({ encryptionProvider = provider(), resources = null } = {}) {
  return new InMemoryEnterpriseRepository({ encryptionProvider, resources });
}

function rawResource(repository, context, id) {
  return repository.resources.get(`${context.tenantId}:${id}`);
}

test('MariaDB repository contract: tenant reads and mutations cannot cross a tenant boundary', async () => {
  const repository = buildRepository();
  const alice = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const mallory = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const created = await repository.createResource(alice, { resourceType: 'RESUME', payload: { title: 'Alice resume' } });

  await assert.rejects(() => repository.getResource(mallory, created.id), error => error.code === 'TENANT_RESOURCE_NOT_FOUND');
  assert.deepEqual(await repository.listResources(mallory, {}), []);
  await assert.rejects(() => repository.updateResource(mallory, created.id, { expectedRevision: 1, payload: { pwn: true } }), error => error.code === 'TENANT_RESOURCE_NOT_FOUND');
  await assert.rejects(() => repository.deleteResource(mallory, created.id), error => error.code === 'TENANT_RESOURCE_NOT_FOUND');
  assert.equal((await repository.getResource(alice, created.id)).payload.title, 'Alice resume');
});

test('MariaDB repository contract: workspace-scoped principals see only their workspace', async () => {
  const repository = buildRepository();
  const tenantId = crypto.randomUUID();
  const one = buildContext({ tenantId, workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const two = buildContext({ tenantId, workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const tenantAdmin = buildContext({ tenantId, workspaceId: one.workspaceId, principal: crypto.randomUUID(), roles: ['TENANT_ADMIN'], workspaceScope: 'TENANT' });
  await repository.createResource(one, { resourceType: 'RESUME', payload: { ws: 1 } });
  await repository.createResource(two, { resourceType: 'RESUME', payload: { ws: 2 } });

  assert.equal((await repository.listResources(one)).length, 1);
  assert.equal((await repository.listResources(two)).length, 1);
  assert.equal((await repository.listResources(tenantAdmin)).length, 2);
  const twoOnly = (await repository.listResources(two))[0];
  await assert.rejects(() => repository.updateResource(one, twoOnly.id, { expectedRevision: 1, payload: {} }), error => error.code === 'WORKSPACE_RESOURCE_NOT_FOUND');
});

test('MariaDB repository contract: optimistic revisions serialize concurrent updates', async () => {
  const repository = buildRepository();
  const context = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const created = await repository.createResource(context, { resourceType: 'RESUME', payload: { rev: 1 } });
  await assert.rejects(() => repository.updateResource(context, created.id, { expectedRevision: 99, payload: { rev: 2 } }), error => error.code === 'REVISION_CONFLICT' && error.status === 409);
  const concurrent = await Promise.allSettled([
    repository.updateResource(context, created.id, { expectedRevision: 1, payload: { rev: 'a' } }),
    repository.updateResource(context, created.id, { expectedRevision: 1, payload: { rev: 'b' } }),
  ]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter(result => result.status === 'rejected')[0].reason.code, 'REVISION_CONFLICT');
  assert.equal((await repository.getResource(context, created.id)).revision, 2);
});

test('encrypted resource contract seals private payloads and detects ciphertext tampering', async () => {
  const repository = buildRepository();
  const context = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const created = await repository.createResource(context, { resourceType: 'RESUME', classification: 'CONFIDENTIAL', payload: { secret: 'compensation-band-9' } });
  const raw = rawResource(repository, context, created.id);
  assert.ok(raw.payloadCipher);
  assert.ok(!JSON.stringify(raw).includes('compensation-band-9'));
  assert.equal((await repository.getResource(context, created.id)).payload.secret, 'compensation-band-9');
  raw.payloadCipher = { ...raw.payloadCipher, ciphertext: Buffer.from('tampered-data').toString('base64') };
  await assert.rejects(() => repository.getResource(context, created.id), /authenticate|decrypt|cipher/i);
});

test('encrypted resource contract supports explicit server-key rotation', async () => {
  const resources = new Map();
  const context = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const v1 = buildRepository({ resources, encryptionProvider: provider() });
  const first = await v1.createResource(context, { resourceType: 'RESUME', payload: { era: 'v1' } });
  assert.equal(rawResource(v1, context, first.id).payloadCipher.keyVersion, 'v1');

  const rotated = buildRepository({ resources, encryptionProvider: provider({ v1: Buffer.from(KEY, 'base64'), v2: Buffer.from(ROTATED_KEY, 'base64') }, 'v2') });
  const migrated = await rotated.updateResource(context, first.id, { expectedRevision: 1, payload: { era: 'v2' } });
  assert.equal(migrated.payload.era, 'v2');
  assert.equal(rawResource(rotated, context, first.id).payloadCipher.keyVersion, 'v2');

  const legacy = await v1.createResource(context, { resourceType: 'RESUME', payload: { era: 'v1-old' } });
  const v2Only = buildRepository({ resources, encryptionProvider: provider({ v2: Buffer.from(ROTATED_KEY, 'base64') }, 'v2') });
  await assert.rejects(() => v2Only.getResource(context, legacy.id), error => error.code === 'ENTERPRISE_ENCRYPTION_UNAVAILABLE');
});

test('private payloads fail closed without keys while explicitly public payloads remain readable', async () => {
  const repository = buildRepository({ encryptionProvider: null });
  const context = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  await assert.rejects(() => repository.createResource(context, { resourceType: 'RESUME', payload: { a: 1 } }), error => error.code === 'ENTERPRISE_ENCRYPTION_UNAVAILABLE' && error.status === 503);
  const published = await repository.createResource(context, { resourceType: 'ANNOUNCEMENT', classification: 'PUBLIC', payload: { a: 1 } });
  assert.equal(published.payload.a, 1);
});

test('encryption provider factory rejects malformed or unsupported configuration', () => {
  assert.throws(() => createEncryptionProvider({ ENTERPRISE_ENCRYPTION_KEY: 'short' }), /32-byte/);
  assert.throws(() => createEncryptionProvider({ ENTERPRISE_ENCRYPTION_KEYS: '{not-json' }), /ENTERPRISE_ENCRYPTION_KEYS/);
  assert.throws(() => createEncryptionProvider({ ENTERPRISE_ENCRYPTION_PROVIDER: 'hsm' }), /Unknown enterprise encryption provider/);
});

test('repository factory is immutable to MariaDB and interface-complete', () => {
  const pool = { query: async () => [[]] };
  const repository = createEnterpriseRepository({ environment: { ENTERPRISE_DATA_PROVIDER: 'mariadb' }, pool });
  assert.equal(repository.providerName, 'mysql');
  for (const providerName of ['firestore', 'postgres', 'db2']) {
    assert.throws(() => createEnterpriseRepository({ environment: { ENTERPRISE_DATA_PROVIDER: providerName }, pool }), error => error.code === 'ENTERPRISE_DATA_PROVIDER_IMMUTABLE');
  }
});

test('audit events remain tenant-partitioned', async () => {
  const repository = buildRepository();
  const alice = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const bob = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  await repository.appendAuditEvent(alice, { action: 'TENANT_A_EVENT', category: 'tenant.test' });
  await repository.appendAuditEvent(bob, { action: 'TENANT_B_EVENT', category: 'tenant.test' });
  const aliceEvents = await repository.listAuditEvents(alice);
  const bobEvents = await repository.listAuditEvents(bob);
  assert.ok(aliceEvents.every(event => event.tenantId === alice.tenantId));
  assert.ok(bobEvents.every(event => event.tenantId === bob.tenantId));
  assert.ok(!bobEvents.some(event => event.action === 'TENANT_A_EVENT'));
});

test('AI ledger contract is idempotent and tenant-isolated', async () => {
  const repository = buildRepository();
  const alice = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const bob = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  const usage = { provider: 'openai', model: 'gpt-4o-mini', operation: 'IMPROVE_BULLET', inputTokens: 120, outputTokens: 80, idempotencyKey: 'corr-1' };
  assert.equal((await repository.recordAiUsage(alice, usage)).outcome, 'RECORDED');
  assert.equal((await repository.recordAiUsage(alice, usage)).outcome, 'DUPLICATE_IGNORED');
  await repository.recordAiUsage(bob, { ...usage, inputTokens: 500, outputTokens: 500 });
  const summaryA = await repository.getAiUsageSummary(alice);
  const summaryB = await repository.getAiUsageSummary(bob);
  assert.equal(summaryA.requests, 1);
  assert.equal(summaryA.inputTokens, 120);
  assert.equal(summaryB.requests, 1);
  assert.equal(summaryB.inputTokens, 500);
});

test('AI accounting contract does not lose distinct parallel events', async () => {
  const repository = buildRepository();
  const context = buildContext({ tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), principal: crypto.randomUUID() });
  await Promise.all(Array.from({ length: 25 }, (_, index) => repository.recordAiUsage(context, {
    provider: 'openai', model: 'gpt-4o-mini', operation: 'GENERATE', inputTokens: 10, outputTokens: 5, idempotencyKey: `burst-${index}`,
  })));
  const summary = await repository.getAiUsageSummary(context);
  assert.equal(summary.requests, 25);
  assert.equal(summary.inputTokens, 250);
  assert.equal(summary.outputTokens, 125);
  assert.equal(summary.byWorkspace[context.workspaceId].requests, 25);
  assert.equal(summary.byProvider.openai, 25);
  assert.equal(summary.byModel['gpt-4o-mini'], 25);
});

test('MariaDB payload validation rejects malformed or oversized input before SQL', () => {
  assert.throws(() => safePayload('not-an-object'), /must be an object/);
  assert.throws(() => safePayload([]), /must be an object/);
  assert.throws(() => safePayload({ giant: 'x'.repeat(200_000) }), /too large/);
});
