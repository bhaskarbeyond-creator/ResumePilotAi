'use strict';

const { classifyLegacyResource, createMigrationLedgerRecord, stableChecksum } = require('./firebaseBridge');
const { assertUuid } = require('./tenantContext');

function firebaseResumePath(uid, resumeId) {
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(String(uid || '')) || !/^[A-Za-z0-9_-]{1,128}$/.test(String(resumeId || ''))) {
    throw Object.assign(new Error('Legacy resume path is invalid'), { code: 'INVALID_LEGACY_PATH', status: 400 });
  }
  return `users/${uid}/resumes/${resumeId}`;
}

function buildPersonalResumeMigrationPlan({ uid, resumeId, source, personalTenantId, personalWorkspaceId }) {
  assertUuid(personalTenantId, 'Personal tenant identifier');
  assertUuid(personalWorkspaceId, 'Personal workspace identifier');
  const ownership = classifyLegacyResource('resume', { userId: uid });
  const ledger = createMigrationLedgerRecord({
    sourceStore: 'firestore',
    sourcePath: firebaseResumePath(uid, resumeId),
    sourceUid: uid,
    sourceRevision: Number(source?.revision || 0),
    sourceData: source || {},
    tenantId: personalTenantId,
    workspaceId: personalWorkspaceId,
    resourceType: 'RESUME',
    targetResourceId: null,
    ownership,
  });
  return Object.freeze({
    mode: 'ADAPTER_FIRST',
    source: { store: 'firestore', path: ledger.sourcePath, revision: ledger.sourceRevision, checksum: ledger.sourceChecksum },
    target: { tenantId: personalTenantId, workspaceId: personalWorkspaceId, resourceType: 'RESUME' },
    ledger,
    rollback: { sourceRemainsAuthoritative: true, deleteSource: false, cutoverRequiresChecksum: true },
  });
}

function reconcileAggregate({ source, target }) {
  const sourceChecksum = stableChecksum(source?.data || source || {});
  const targetChecksum = stableChecksum(target?.data || target || {});
  return Object.freeze({
    sourceChecksum,
    targetChecksum,
    matches: sourceChecksum === targetChecksum,
    sourceRevision: Number(source?.revision || 0),
    targetRevision: Number(target?.revision || 0),
  });
}

function reconcileCollection({ sourceRecords = [], targetRecords = [], sourceKey = record => record?.id, targetLegacyKey = record => record?.legacyDocumentId }) {
  const source = new Map();
  const target = new Map();
  const duplicateSource = [];
  const duplicateTarget = [];
  for (const record of sourceRecords) {
    const key = String(sourceKey(record) || '');
    if (!key) continue;
    if (source.has(key)) duplicateSource.push(key);
    else source.set(key, record);
  }
  for (const record of targetRecords) {
    const key = String(targetLegacyKey(record) || '');
    if (!key) continue;
    if (target.has(key)) duplicateTarget.push(key);
    else target.set(key, record);
  }
  const missingTarget = [];
  const unexpectedTarget = [];
  const checksumMismatches = [];
  for (const [key, record] of source) {
    const migrated = target.get(key);
    if (!migrated) missingTarget.push(key);
    else if (stableChecksum(record?.data || record) !== stableChecksum(migrated?.data || migrated)) checksumMismatches.push(key);
  }
  for (const key of target.keys()) if (!source.has(key)) unexpectedTarget.push(key);
  return Object.freeze({
    sourceCount: source.size,
    targetCount: target.size,
    duplicateSource,
    duplicateTarget,
    missingTarget,
    unexpectedTarget,
    checksumMismatches,
    matches: !duplicateSource.length && !duplicateTarget.length && !missingTarget.length && !unexpectedTarget.length && !checksumMismatches.length,
  });
}

module.exports = {
  buildPersonalResumeMigrationPlan,
  firebaseResumePath,
  reconcileAggregate,
  reconcileCollection,
};
