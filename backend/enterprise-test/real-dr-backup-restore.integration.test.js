'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MemoryFirestore, createMemoryAdmin } = require('../test/helpers/memoryFirestore');
const { FirestoreTenantRegistry } = require('../enterprise/tenantRegistry');
const { FirestoreEnterpriseRepository } = require('../enterprise/firestoreEnterpriseRepository');
const { ServerKeyEncryptionProvider } = require('../enterprise/encryptionProvider');
const { freezeContext } = require('../enterprise/tenantContext');
const backup = require('../enterprise/enterpriseBackup');

/**
 * Disaster recovery on the canonical Firestore data plane. The previous
 * PostgreSQL-snapshot drill was removed together with the PostgreSQL adapter;
 * this drill exercises the real backup module end to end: snapshot → simulated
 * catastrophic loss → verified restore → reconciliation.
 */

function setup() {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const repository = new FirestoreEnterpriseRepository({
    db,
    admin,
    encryptionProvider: new ServerKeyEncryptionProvider({ keys: new Map([['v1', crypto.randomBytes(32)]]) }),
  });
  const registry = new FirestoreTenantRegistry({ db, admin });
  return { db, admin, repository, registry };
}

test('Disaster Recovery: full tenant snapshot, catastrophic loss, and verified restore', async () => {
  const { db, admin, repository, registry } = setup();
  const { tenantId, workspaceId } = await registry.provisionTenant({ ownerPrincipalId: 'dr-owner', displayName: 'DR Industries', slug: 'dr-industries' });
  const context = freezeContext({
    tenantId, workspaceId, principalId: crypto.randomUUID(),
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', routingVersion: 1 } },
    membership: { status: 'ACTIVE', roles: ['TENANT_OWNER'] }, roles: ['TENANT_OWNER'],
  });

  // Seed tenant state across every partitioned collection.
  const first = await repository.createResource(context, { resourceType: 'RESUME', payload: { title: 'Principal CV', revision: 1 } });
  const second = await repository.createResource(context, { resourceType: 'COVER', payload: { title: 'Principal Cover' } });
  await repository.recordAiUsage(context, { provider: 'openai', model: 'gpt-4o-mini', operation: 'generate-summary', inputTokens: 800, outputTokens: 400, idempotencyKey: 'dr-1' });

  // 1. Snapshot with deterministic checksums.
  const snapshot = await backup.exportTenantSnapshot({ db, admin, tenantId });
  assert.ok(backup.verifySnapshot(snapshot).ok, 'snapshot must verify before disaster');
  const resourceCount = snapshot.manifest.find(entry => entry.collection === 'tenants/{tenantId}/resources').count;
  assert.equal(resourceCount, 2);

  // 2. Simulated catastrophic loss: drop every document of this tenant.
  for (const path of [...db.documents.keys()]) {
    if (path.startsWith(`tenants/${tenantId}/`)) db.documents.delete(path);
  }
  db.documents.delete(`enterprise_tenants/${tenantId}`);
  assert.equal(await repository.getResource(context, first.id), null, 'tenant data must be gone after disaster');
  assert.equal(await registry.getTenant(tenantId).then(() => true, () => false), false, 'tenant record must be gone');

  // 3. Restore (apply) — idempotent, checksum-verified.
  const restored = await backup.restoreTenantSnapshot({ db, admin, snapshot, mode: 'apply' });
  assert.equal(restored.restored, snapshot.documents.length);
  assert.deepEqual(restored.refused, []);

  // 4. Post-restore reconciliation.
  const verification = await backup.verifyTenantRestored({ db, admin, snapshot });
  assert.equal(verification.ok, true, `restored state must reconcile: ${JSON.stringify(verification)}`);
  const recoveredFirst = await repository.getResource(context, first.id);
  assert.equal(recoveredFirst.payload.title, 'Principal CV', 'resource content must round-trip');
  const recoveredSecond = await repository.getResource(context, second.id);
  assert.equal(recoveredSecond.payload.title, 'Principal Cover');
  const usage = await repository.getAiUsageSummary(context, {});
  assert.equal(usage.requests, 1, 'usage ledger must survive restore');
  const tenant = await registry.getTenant(tenantId);
  assert.equal(tenant.displayName, 'DR Industries', 'tenant record must be restored');
});

test('Disaster Recovery: partial-failure recovery — re-running restore is idempotent', async () => {
  const { db, admin, repository, registry } = setup();
  const { tenantId, workspaceId } = await registry.provisionTenant({ ownerPrincipalId: 'dr-partial', displayName: 'Partial Co', slug: 'partial-co' });
  const context = freezeContext({
    tenantId, workspaceId, principalId: crypto.randomUUID(),
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', routingVersion: 1 } },
    membership: { status: 'ACTIVE', roles: ['TENANT_OWNER'] }, roles: ['TENANT_OWNER'],
  });
  await repository.createResource(context, { resourceType: 'RESUME', payload: { title: 'Survives' } });
  const snapshot = await backup.exportTenantSnapshot({ db, admin, tenantId });

  // First restore completes, then a second restore runs (operator re-ran the
  // job after a partial failure) — state must remain identical.
  await backup.restoreTenantSnapshot({ db, admin, snapshot, mode: 'apply' });
  await backup.restoreTenantSnapshot({ db, admin, snapshot, mode: 'apply' });
  const verification = await backup.verifyTenantRestored({ db, admin, snapshot });
  assert.equal(verification.ok, true);
  const fresh = await backup.exportTenantSnapshot({ db, admin, tenantId });
  assert.equal(fresh.documentCount, snapshot.documentCount, 're-running restore must not duplicate documents');
});
