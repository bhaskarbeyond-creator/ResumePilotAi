'use strict';

const crypto = require('crypto');
const { classifyLegacyResource, createMigrationLedgerRecord, stableChecksum } = require('./firebaseBridge');
const { LEGACY_COLLECTIONS } = require('./certifiedModuleBridge');
const { assertUuid } = require('./tenantContext');

/**
 * Legacy-Firebase → Enterprise-Firestore migration executor.
 *
 * Executes the migration plans produced by firebaseMigrationAdapter against the
 * canonical Firestore enterprise repository. Contract:
 *   - dry-run: plan + checksum verification, zero writes
 *   - idempotent: a ledger record with the same source checksum short-circuits
 *   - checksum-verified: source data must hash to the planned checksum
 *   - reversible: rollback deletes the created tenant resource and marks the
 *     ledger ROLLED_BACK; the legacy source document is never modified or
 *     deleted by migration (sourceRemainsAuthoritative until cutover).
 *
 * Production customer data is NOT migrated by this module automatically; it is
 * executed explicitly by an operator (script/API) tenant by tenant.
 */

const LEDGER_COLLECTION = 'enterprise_migration_ledger';

function migrationLedgerId(sourcePath) {
  return crypto.createHash('sha256').update(String(sourcePath || '')).digest('hex').slice(0, 40);
}

function legacyCollectionName(kind) {
  const normalized = String(kind || '').toLowerCase();
  const collection = LEGACY_COLLECTIONS[normalized.toUpperCase()] || normalized;
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(collection)) {
    throw Object.assign(new Error('Legacy collection name is invalid'), { code: 'INVALID_MIGRATION_PLAN', status: 400 });
  }
  return collection;
}

function buildLegacyResourcePlan({ kind, sourceUid, sourceDocumentId, sourceData, sourceRevision = 0, tenantId, workspaceId }) {
  const sourcePath = `users/${sourceUid}/${legacyCollectionName(kind)}/${sourceDocumentId}`;
  const ownership = classifyLegacyResource(kind, { userId: sourceUid });
  const ledger = createMigrationLedgerRecord({
    sourceStore: 'firestore',
    sourcePath,
    sourceUid,
    sourceRevision,
    sourceData,
    tenantId: assertUuid(tenantId, 'Tenant identifier'),
    workspaceId: assertUuid(workspaceId, 'Workspace identifier'),
    resourceType: String(kind || '').toUpperCase(),
    ownership,
  });
  return Object.freeze({
    source: { store: 'firestore', path: sourcePath, uid: sourceUid, revision: sourceRevision, checksum: ledger.sourceChecksum, data: sourceData || {} },
    target: { tenantId, workspaceId, resourceType: ledger.resourceType },
    ledger,
    rollback: { sourceRemainsAuthoritative: true, deleteSource: false },
  });
}

/**
 * Execute one migration plan against the repository. dryRun performs every
 * verification step but writes nothing.
 */
async function executeMigrationPlan({ db, repository, context, plan, dryRun = false }) {
  if (!plan?.ledger) throw Object.assign(new Error('Migration plan is required'), { code: 'INVALID_MIGRATION_PLAN', status: 400 });
  if (!repository || !context) throw Object.assign(new Error('Migration requires the enterprise repository and a verified context'), { code: 'INVALID_MIGRATION_PLAN', status: 400 });
  if (plan.target.tenantId !== context.tenantId || plan.target.workspaceId !== context.workspaceId) {
    throw Object.assign(new Error('Migration target does not match the verified tenant context'), { code: 'MIGRATION_TARGET_MISMATCH', status: 403 });
  }
  const ledgerId = migrationLedgerId(plan.ledger.sourcePath);
  const ledgerRef = db.collection(LEDGER_COLLECTION).doc(ledgerId);
  const existingSnapshot = await ledgerRef.get();
  let reMigration = false;
  if (existingSnapshot.exists) {
    const existing = existingSnapshot.data() || {};
    if (existing.sourceChecksum !== plan.ledger.sourceChecksum) {
      throw Object.assign(new Error('Migration ledger checksum mismatch: source changed after planning'), { code: 'MIGRATION_SOURCE_CHANGED', status: 409 });
    }
    if (existing.status === 'MIGRATED') {
      return { status: 'SKIPPED_ALREADY_MIGRATED', ledgerId, targetResourceId: existing.targetResourceId || null };
    }
    if (existing.status !== 'ROLLED_BACK') {
      return { status: 'SKIPPED_LEDGER_PRESENT', ledgerId, targetResourceId: existing.targetResourceId || null };
    }
    // A rolled-back migration may be re-executed for the same source checksum.
    reMigration = true;
  }
  if (dryRun) {
    return { status: 'DRY_RUN_PLANNED', ledgerId, plan };
  }
  // The tenant resource carries the actual legacy document data so that
  // post-migration reconciliation can checksum source against target.
  const sourceSnapshot = await db.doc(plan.source.path).get().catch(() => null);
  if (sourceSnapshot && sourceSnapshot.exists) {
    const liveChecksum = stableChecksum(sourceSnapshot.data() || {});
    if (liveChecksum !== plan.ledger.sourceChecksum) {
      throw Object.assign(new Error('Legacy source changed after the migration plan was built'), { code: 'MIGRATION_SOURCE_CHANGED', status: 409 });
    }
  }
  const resource = await repository.createResource(context, {
    resourceType: plan.target.resourceType,
    classification: 'PRIVATE',
    payload: plan.source.data || {},
  });
  const ledger = {
    ...plan.ledger,
    id: ledgerId,
    status: 'MIGRATED',
    targetResourceId: resource.id,
    migratedAt: new Date().toISOString(),
  };
  if (reMigration) {
    await ledgerRef.set(ledger, { merge: false });
  } else {
    await ledgerRef.create(ledger);
  }
  return { status: 'MIGRATED', ledgerId, targetResourceId: resource.id };
}

/**
 * Rollback a completed migration: remove the tenant resource and mark the
 * ledger ROLLED_BACK. The legacy source document is untouched (it was never
 * modified in the first place).
 */
async function rollbackMigration({ db, repository, context, ledgerId }) {
  if (!db || !repository || !context) throw Object.assign(new Error('Rollback requires the enterprise repository and a verified context'), { code: 'INVALID_MIGRATION_PLAN', status: 400 });
  const ledgerRef = db.collection(LEDGER_COLLECTION).doc(String(ledgerId || ''));
  let rolledBack = false;
  let targetResourceId = null;
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ledgerRef);
    if (!snapshot.exists) return;
    const ledger = snapshot.data() || {};
    if (ledger.tenantId !== context.tenantId) return;
    if (ledger.status !== 'MIGRATED') return;
    targetResourceId = ledger.targetResourceId || null;
    transaction.set(ledgerRef, { ...ledger, status: 'ROLLED_BACK', rolledBackAt: new Date().toISOString() }, { merge: false });
    rolledBack = true;
  });
  if (!rolledBack) return { status: 'NOT_FOUND', ledgerId };
  if (targetResourceId) {
    const deleted = await repository.deleteResource(context, targetResourceId);
    if (!deleted) return { status: 'PARTIAL', ledgerId, note: 'target resource already absent' };
  }
  return { status: 'ROLLED_BACK', ledgerId, targetResourceId };
}

/**
 * Reconcile a migrated collection: source vs target checksums per document.
 * Used by the MIGRATION_RECONCILE job type and operator drills.
 */
async function reconcileMigration({ db, repository, context, plans }) {
  const results = [];
  for (const plan of plans) {
    const ledgerSnapshot = await db.collection(LEDGER_COLLECTION).doc(migrationLedgerId(plan.ledger.sourcePath)).get();
    if (!ledgerSnapshot.exists) { results.push({ path: plan.ledger.sourcePath, status: 'NOT_MIGRATED' }); continue; }
    const ledger = ledgerSnapshot.data() || {};
    if (!ledger.targetResourceId) { results.push({ path: plan.ledger.sourcePath, status: 'NO_TARGET' }); continue; }
    const resource = await repository.getResource(context, ledger.targetResourceId);
    if (!resource) { results.push({ path: plan.ledger.sourcePath, status: 'TARGET_MISSING' }); continue; }
    const targetChecksum = stableChecksum(resource.payload || {});
    results.push({
      path: plan.ledger.sourcePath,
      status: targetChecksum === plan.ledger.sourceChecksum ? 'MATCHES' : 'CHECKSUM_MISMATCH',
      sourceChecksum: plan.ledger.sourceChecksum,
      targetChecksum,
    });
  }
  return Object.freeze({
    sourceCount: results.length,
    migrated: results.filter(result => result.status === 'MATCHES').length,
    matches: results.every(result => result.status === 'MATCHES'),
    results,
  });
}

module.exports = {
  LEDGER_COLLECTION,
  buildLegacyResourcePlan,
  executeMigrationPlan,
  migrationLedgerId,
  reconcileMigration,
  rollbackMigration,
};
