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

function setup() {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const encryptionProvider = new ServerKeyEncryptionProvider({ keys: new Map([['v1', crypto.randomBytes(32)]]) });
  const repository = new FirestoreEnterpriseRepository({ db, admin, encryptionProvider });
  const registry = new FirestoreTenantRegistry({ db, admin });
  return { db, admin, repository, registry, encryptionProvider };
}

test('tenant snapshot export includes partition tree and control plane with verified checksums', async () => {
  const { db, admin, repository, registry } = setup();
  const { tenantId, workspaceId } = await registry.provisionTenant({ ownerPrincipalId: 'backup-owner', displayName: 'Backup Co', slug: 'backup-co' });
  const context = freezeContext({
    tenantId, workspaceId, principalId: crypto.randomUUID(),
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', routingVersion: 1 } },
    membership: { status: 'ACTIVE', roles: ['TENANT_OWNER'] }, roles: ['TENANT_OWNER'],
  });
  await repository.createResource(context, { resourceType: 'RESUME', payload: { title: 'Backup drill' } });
  await repository.recordAiUsage(context, { provider: 'openai', model: 'gpt-4o-mini', operation: 'generate-summary', inputTokens: 10, outputTokens: 5, idempotencyKey: crypto.randomUUID() });

  const snapshot = await backup.exportTenantSnapshot({ db, admin, tenantId });
  assert.ok(snapshot.checksum.match(/^[0-9a-f]{64}$/));
  assert.equal(snapshot.tenantId, tenantId);
  const manifestNames = snapshot.manifest.map(entry => entry.collection);
  assert.ok(manifestNames.includes('enterprise_tenants'));
  assert.ok(manifestNames.includes('tenants/{tenantId}/resources'));
  assert.ok(manifestNames.includes('tenants/{tenantId}/ai_usage'));
  assert.ok(snapshot.documents.some(document => document.path.startsWith(`tenants/${tenantId}/resources/`)));
  // Encrypted payloads remain sealed inside the backup envelope.
  assert.ok(!JSON.stringify(snapshot).includes('Backup drill'), 'snapshot must not leak decrypted payloads');

  const verification = backup.verifySnapshot(snapshot);
  assert.equal(verification.ok, true, JSON.stringify(verification.problems));
});

test('snapshot tampering is detected by checksum verification', async () => {
  const { db, admin, repository, registry } = setup();
  const { tenantId, workspaceId } = await registry.provisionTenant({ ownerPrincipalId: 'tamper-owner', displayName: 'Tamper Co', slug: 'tamper-co' });
  const context = freezeContext({
    tenantId, workspaceId, principalId: crypto.randomUUID(),
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', routingVersion: 1 } },
    membership: { status: 'ACTIVE', roles: ['TENANT_OWNER'] }, roles: ['TENANT_OWNER'],
  });
  await repository.createResource(context, { resourceType: 'RESUME', payload: { title: 'Original' } });
  const snapshot = await backup.exportTenantSnapshot({ db, admin, tenantId });

  const tampered = JSON.parse(JSON.stringify(snapshot));
  tampered.documents[0].data.displayName = 'Hacked Co';
  const verification = backup.verifySnapshot(tampered);
  assert.equal(verification.ok, false);
  assert.ok(verification.problems.some(problem => problem.includes('checksum')));
});

test('restore: dry-run performs zero writes, apply restores, and rollback re-applies the previous snapshot', async () => {
  const { db, admin, repository, registry } = setup();
  const { tenantId, workspaceId } = await registry.provisionTenant({ ownerPrincipalId: 'restore-owner', displayName: 'Restore Co', slug: 'restore-co' });
  const context = freezeContext({
    tenantId, workspaceId, principalId: crypto.randomUUID(),
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', routingVersion: 1 } },
    membership: { status: 'ACTIVE', roles: ['TENANT_OWNER'] }, roles: ['TENANT_OWNER'],
  });
  const resource = await repository.createResource(context, { resourceType: 'RESUME', payload: { title: 'Before disaster' } });
  const before = await backup.exportTenantSnapshot({ db, admin, tenantId });

  // Simulated catastrophic loss inside the tenant partition.
  for (const path of [...db.documents.keys()]) {
    if (path.startsWith(`tenants/${tenantId}/resources/`)) db.documents.delete(path);
  }
  assert.equal(await repository.getResource(context, resource.id), null);

  // Dry-run: verification passes, nothing is written.
  const dryRun = await backup.restoreTenantSnapshot({ db, admin, snapshot: before, mode: 'dry-run' });
  assert.equal(dryRun.mode, 'dry-run');
  assert.equal(await repository.getResource(context, resource.id), null, 'dry-run must not restore');

  // Apply: documents return byte-for-byte.
  const applied = await backup.restoreTenantSnapshot({ db, admin, snapshot: before, mode: 'apply' });
  assert.equal(applied.restored, before.documents.length);
  assert.deepEqual(applied.refused, []);
  const restored = await repository.getResource(context, resource.id);
  assert.equal(restored.payload.title, 'Before disaster');

  const postRestore = await backup.verifyTenantRestored({ db, admin, snapshot: before });
  assert.equal(postRestore.ok, true, JSON.stringify(postRestore));

  // Disaster during restore: re-apply the same snapshot (idempotent rollback).
  const rollback = await backup.restoreTenantSnapshot({ db, admin, snapshot: before, mode: 'apply' });
  assert.equal(rollback.restored, before.documents.length);
  const again = await repository.getResource(context, resource.id);
  assert.equal(again.payload.title, 'Before disaster');
});

test('restore refuses documents that do not belong to the snapshot tenant', async () => {
  const { db, admin, registry } = setup();
  const alice = await registry.provisionTenant({ ownerPrincipalId: 'restore-alice', displayName: 'Alice Co', slug: 'alice-restore' });
  const bob = await registry.provisionTenant({ ownerPrincipalId: 'restore-bob', displayName: 'Bob Co', slug: 'bob-restore' });
  const snapshot = await backup.exportTenantSnapshot({ db, admin, tenantId: alice.tenantId });

  // Forge a snapshot that tries to smuggle Bob's tenant document into Alice's restore.
  const forged = JSON.parse(JSON.stringify(snapshot));
  forged.documents.push({ path: `enterprise_tenants/${bob.tenantId}`, data: { id: bob.tenantId, displayName: 'Smuggled' } });
  forged.documents.sort((left, right) => left.path.localeCompare(right.path));
  forged.checksum = backup.checksum(forged.documents.map(document => ({ path: document.path, data: document.data })));
  forged.manifest.find(entry => entry.collection === 'enterprise_tenants').count += 1;

  const applied = await backup.restoreTenantSnapshot({ db, admin, snapshot: forged, mode: 'apply' });
  assert.deepEqual(applied.refused, [`enterprise_tenants/${bob.tenantId}`], 'foreign-tenant documents must be refused');
  const bobDoc = await db.collection('enterprise_tenants').doc(bob.tenantId).get();
  assert.notEqual(bobDoc.data().displayName, 'Smuggled');
});
