'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MemoryFirestore, createMemoryAdmin } = require('../test/helpers/memoryFirestore');
const { FirestoreEnterpriseRepository } = require('../enterprise/firestoreEnterpriseRepository');
const { ServerKeyEncryptionProvider } = require('../enterprise/encryptionProvider');
const { freezeContext } = require('../enterprise/tenantContext');
const migration = require('../enterprise/enterpriseMigration');
const { stableChecksum } = require('../enterprise/firebaseBridge');

function setup() {
  const db = new MemoryFirestore();
  const admin = createMemoryAdmin({ db });
  const encryptionProvider = new ServerKeyEncryptionProvider({ keys: new Map([['v1', crypto.randomBytes(32)]]) });
  const repository = new FirestoreEnterpriseRepository({ db, admin, encryptionProvider });
  return { db, admin, repository };
}

function ownerContext(tenantId, workspaceId) {
  return freezeContext({
    tenantId, workspaceId, principalId: crypto.randomUUID(),
    tenant: { id: tenantId, lifecycleState: 'ACTIVE', isolationTier: 'STANDARD', dataPlane: { id: 'firestore-primary', type: 'FIRESTORE', routingVersion: 1 } },
    membership: { status: 'ACTIVE', roles: ['TENANT_OWNER'] }, roles: ['TENANT_OWNER'],
  });
}

async function legacyResume(db, uid, resumeId, data) {
  await db.doc(`users/${uid}/resumes/${resumeId}`).set(data);
  return data;
}

test('migration: dry-run plans without writes; execute creates tenant resource; idempotent re-run skips', async () => {
  const { db, repository } = setup();
  const tenantId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const context = ownerContext(tenantId, workspaceId);
  const uid = 'legacy-user-1';
  const data = await legacyResume(db, uid, 'resume-1', { title: 'Legacy Resume', skills: ['Node.js'] });

  const plan = migration.buildLegacyResourcePlan({ kind: 'resume', sourceUid: uid, sourceDocumentId: 'resume-1', sourceData: data, sourceRevision: 3, tenantId, workspaceId });
  const dry = await migration.executeMigrationPlan({ db, repository, context, plan, dryRun: true });
  assert.equal(dry.status, 'DRY_RUN_PLANNED');
  assert.equal((await repository.listResources(context, {})).length, 0, 'dry-run must not migrate');

  const executed = await migration.executeMigrationPlan({ db, repository, context, plan });
  assert.equal(executed.status, 'MIGRATED');
  const resource = await repository.getResource(context, executed.targetResourceId);
  assert.equal(resource.payload.title, 'Legacy Resume');
  assert.equal(resource.resourceType, 'RESUME');

  const rerun = await migration.executeMigrationPlan({ db, repository, context, plan });
  assert.equal(rerun.status, 'SKIPPED_ALREADY_MIGRATED');
  assert.equal(rerun.targetResourceId, executed.targetResourceId);
  assert.equal((await repository.listResources(context, {})).length, 1, 'idempotent migration must not duplicate');
});

test('migration: source drift after planning is refused (checksum contract)', async () => {
  const { db, repository } = setup();
  const tenantId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const context = ownerContext(tenantId, workspaceId);
  const uid = 'legacy-user-2';
  await legacyResume(db, uid, 'resume-2', { title: 'v1' });
  const plan = migration.buildLegacyResourcePlan({ kind: 'resume', sourceUid: uid, sourceDocumentId: 'resume-2', sourceData: { title: 'v1' }, tenantId, workspaceId });
  await db.doc(`users/${uid}/resumes/resume-2`).set({ title: 'v2 edited' });
  await assert.rejects(
    () => migration.executeMigrationPlan({ db, repository, context, plan }),
    error => error.code === 'MIGRATION_SOURCE_CHANGED'
  );
});

test('migration: cross-tenant execution is refused', async () => {
  const { db, repository } = setup();
  const plan = migration.buildLegacyResourcePlan({ kind: 'resume', sourceUid: 'u', sourceDocumentId: 'r', sourceData: { a: 1 }, tenantId: crypto.randomUUID(), workspaceId: crypto.randomUUID() });
  const otherContext = ownerContext(crypto.randomUUID(), crypto.randomUUID());
  await assert.rejects(
    () => migration.executeMigrationPlan({ db, repository, context: otherContext, plan }),
    error => error.code === 'MIGRATION_TARGET_MISMATCH'
  );
});

test('migration: rollback removes the tenant resource and keeps the legacy source intact', async () => {
  const { db, repository } = setup();
  const tenantId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const context = ownerContext(tenantId, workspaceId);
  const uid = 'legacy-user-3';
  const data = await legacyResume(db, uid, 'resume-3', { title: 'Roll me back' });
  const plan = migration.buildLegacyResourcePlan({ kind: 'resume', sourceUid: uid, sourceDocumentId: 'resume-3', sourceData: data, tenantId, workspaceId });
  const executed = await migration.executeMigrationPlan({ db, repository, context, plan });
  assert.equal(executed.status, 'MIGRATED');

  const rolledBack = await migration.rollbackMigration({ db, repository, context, ledgerId: executed.ledgerId });
  assert.equal(rolledBack.status, 'ROLLED_BACK');
  assert.equal(await repository.getResource(context, executed.targetResourceId), null);
  const source = await db.doc(`users/${uid}/resumes/resume-3`).get();
  assert.equal(source.data().title, 'Roll me back', 'legacy source must remain authoritative and untouched');

  const rerun = await migration.executeMigrationPlan({ db, repository, context, plan });
  assert.equal(rerun.status, 'MIGRATED', 'post-rollback re-migration is allowed');
});

test('migration: reconciliation checksums source against target and detects divergence', async () => {
  const { db, repository } = setup();
  const tenantId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const context = ownerContext(tenantId, workspaceId);
  const uid = 'legacy-user-4';
  const data = await legacyResume(db, uid, 'resume-4', { title: 'Reconcile me', skills: ['React'] });
  const plan = migration.buildLegacyResourcePlan({ kind: 'resume', sourceUid: uid, sourceDocumentId: 'resume-4', sourceData: data, tenantId, workspaceId });
  await migration.executeMigrationPlan({ db, repository, context, plan });

  const reconciled = await migration.reconcileMigration({ db, repository, context, plans: [plan] });
  assert.equal(reconciled.matches, true);
  assert.equal(reconciled.sourceChecksumOf || undefined, undefined);
  assert.equal(reconciled.results[0].targetChecksum, stableChecksum(data));

  // Divergence: mutate the legacy source; a NEW plan for the new data detects
  // the already-migrated target no longer matches.
  await db.doc(`users/${uid}/resumes/resume-4`).set({ title: 'Reconcile me', skills: ['React', 'TypeScript'] });
  const driftedPlan = migration.buildLegacyResourcePlan({ kind: 'resume', sourceUid: uid, sourceDocumentId: 'resume-4', sourceData: { title: 'Reconcile me', skills: ['React', 'TypeScript'] }, tenantId, workspaceId });
  const drifted = await migration.reconcileMigration({ db, repository, context, plans: [driftedPlan] });
  assert.equal(drifted.matches, false);
  assert.equal(drifted.results[0].status, 'CHECKSUM_MISMATCH');
});
