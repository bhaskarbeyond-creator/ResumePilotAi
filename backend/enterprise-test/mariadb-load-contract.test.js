'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { InMemoryTenantRegistry } = require('../test/helpers/inMemoryTenantRegistry');
const { InMemoryEnterpriseRepository } = require('../test/helpers/inMemoryEnterpriseRepository');
const { InMemoryAtomicCounterStore } = require('../test/helpers/inMemoryAtomicCounterStore');
const { TenantQuotaGuard } = require('../enterprise/tenantQuota');
const { ServerKeyEncryptionProvider } = require('../enterprise/encryptionProvider');
const { freezeContext } = require('../enterprise/tenantContext');

/**
 * Concurrent contract checks use explicit MariaDB-shaped test doubles. These
 * prove isolation and atomic semantics, not production throughput or latency.
 */

function setup() {
  const registry = new InMemoryTenantRegistry();
  const repository = new InMemoryEnterpriseRepository({
    encryptionProvider: new ServerKeyEncryptionProvider({ keys: new Map([['v1', crypto.randomBytes(32)]]) }),
  });
  const quotaGuard = new TenantQuotaGuard({ store: new InMemoryAtomicCounterStore() });
  return { repository, registry, quotaGuard };
}

async function ownerContext(registry, { owner, displayName, slug }) {
  const { tenantId, workspaceId } = await registry.provisionTenant({ ownerPrincipalId: owner, displayName, slug });
  return freezeContext({
    tenantId, workspaceId, principalId: crypto.randomUUID(),
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD' },
    dataPlane: { id: 'mysql-primary', type: 'MYSQL', routingVersion: 1 },
    membership: { status: 'ACTIVE', roles: ['TENANT_OWNER'] }, roles: ['TENANT_OWNER'],
  });
}

test('MariaDB contract concurrency: 10 tenants × 10 parallel writes maintain strict isolation and exact counts', async () => {
  const { repository, registry } = setup();
  const NUM_TENANTS = 10;
  const OPS_PER_TENANT = 10;

  const contexts = [];
  for (let index = 0; index < NUM_TENANTS; index += 1) {
    contexts.push(await ownerContext(registry, { owner: `load-owner-${index}`, displayName: `Load Co ${index}`, slug: `load-co-${index}` }));
  }

  await Promise.all(contexts.flatMap((context, tenantIndex) =>
    Array.from({ length: OPS_PER_TENANT }, (_, op) =>
      repository.createResource(context, { resourceType: 'RESUME', payload: { tenant: tenantIndex, op } })
    )
  ));
  for (const context of contexts) {
    const resources = await repository.listResources(context, { limit: 100 });
    assert.equal(resources.length, OPS_PER_TENANT, 'every tenant must see exactly its own writes');
    for (const resource of resources) {
      assert.equal(resource.tenantId, context.tenantId);
    }
  }
});

test('MariaDB contract concurrency: parallel revision updates produce exactly one winner per round', async () => {
  const { repository } = setup();
  const { registry } = setup();
  const context = await ownerContext(registry, { owner: 'rev-owner', displayName: 'Rev Co', slug: 'rev-co' });
  const created = await repository.createResource(context, { resourceType: 'RESUME', payload: { round: 0 } });

  for (let round = 1; round <= 3; round += 1) {
    const expectedRevision = round; // created at revision 1 → rounds 2,3,4
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) =>
        repository.updateResource(context, created.id, { expectedRevision, payload: { round, index } })
      )
    );
    const winners = attempts.filter(attempt => attempt.status === 'fulfilled');
    const conflicts = attempts.filter(attempt => attempt.status === 'rejected' && attempt.reason.code === 'REVISION_CONFLICT');
    assert.equal(winners.length, 1, `round ${round}: exactly one writer wins`);
    assert.equal(conflicts.length, 3, `round ${round}: all losers must see a revision conflict`);
    const current = await repository.getResource(context, created.id);
    assert.equal(current.revision, round + 1);
  }
});

test('MariaDB contract concurrency: parallel quota consumption never exceeds the configured limit', async () => {
  const { registry, quotaGuard } = setup();
  const context = await ownerContext(registry, { owner: 'quota-owner', displayName: 'Quota Co', slug: 'quota-co' });
  const LIMIT = 15;
  const attempts = await Promise.allSettled(
    Array.from({ length: 40 }, () =>
      quotaGuard.consume({ context, metric: 'load-minute', limit: LIMIT, windowMs: 60_000, principalScoped: false })
    )
  );
  const allowed = attempts.filter(attempt => attempt.status === 'fulfilled');
  const rejected = attempts.filter(attempt => attempt.status === 'rejected' && attempt.reason.code === 'TENANT_QUOTA_EXCEEDED');
  assert.equal(allowed.length, LIMIT, `exactly ${LIMIT} operations may consume the shared bucket`);
  assert.equal(rejected.length, 40 - LIMIT, 'every excess operation must be rejected');
  assert.equal(Math.max(...allowed.map(attempt => attempt.value.used)), LIMIT, 'the counter must never exceed the limit');
});
