'use strict';

const crypto = require('crypto');
const { assertUuid } = require('./tenantContext');

/**
 * Firestore-native enterprise backup/restore.
 *
 * The enterprise data plane is Firestore; therefore backups are Firestore
 * exports — a PostgreSQL snapshot would be meaningless here. This module
 * produces tenant-scoped, checksum-verified snapshots with:
 *   - a collection manifest with per-collection document counts
 *   - canonical (key-sorted, timestamp-normalized) checksums
 *   - idempotent restore (dry-run or apply)
 *   - rollback by re-applying the previous snapshot
 *
 * The full-project export/restore *pipeline* (scheduled Cloud Firestore export
 * to GCS, or `gcloud firestore export`) remains an infrastructure operation for
 * the platform operator; see docs/ENTERPRISE_LOCAL_INFRASTRUCTURE_HANDOFF.md.
 * What this module provides is the in-application, tenant-scoped logical
 * backup used for verification, tenant portability, and recovery drills.
 */

const TENANT_CONTROL_COLLECTIONS = Object.freeze([
  // Top-level control-plane collections whose documents carry a tenantId.
  { name: 'enterprise_memberships', filterBy: 'tenantId', memberships: true },
  { name: 'enterprise_workspaces', filterBy: 'tenantId' },
  { name: 'enterprise_teams', filterBy: 'tenantId' },
  { name: 'enterprise_service_accounts', filterBy: 'tenantId' },
  { name: 'enterprise_support_grants', filterBy: 'tenantId' },
  { name: 'enterprise_outbox', filterBy: 'tenantId' },
]);

const TENANT_PARTITIONED_COLLECTIONS = Object.freeze([
  // Subcollections under tenants/{tenantId}/…
  'resources',
  'audit_events',
  'ai_usage',
  'ai_usage_daily',
]);

function canonicalize(value) {
  if (value === null || value === undefined) return null;
  if (typeof value.toMillis === 'function') return { __ts: value.toMillis() };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return { __ts: value.getTime() };
  if (typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function checksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function snapshotDocumentData(data) {
  return canonicalize(data);
}

/**
 * Export one tenant's logical snapshot: the tenant partition tree plus every
 * control-plane document that belongs to the tenant.
 */
async function exportTenantSnapshot({ db, tenantId, now = new Date() }) {
  if (!db) throw Object.assign(new Error('Enterprise backup requires a Firestore handle'), { code: 'ENTERPRISE_BACKUP_UNAVAILABLE', status: 503 });
  tenantId = assertUuid(tenantId, 'Tenant identifier');
  const manifest = [];
  const documents = [];

  const tenantRef = db.collection('enterprise_tenants').doc(tenantId);
  const tenantSnapshot = await tenantRef.get();
  if (tenantSnapshot.exists) {
    manifest.push({ collection: 'enterprise_tenants', count: 1 });
    documents.push({ path: `enterprise_tenants/${tenantId}`, data: snapshotDocumentData(tenantSnapshot.data()) });
  }
  const configurationSnapshot = await db.collection('enterprise_tenant_configurations').doc(tenantId).get();
  if (configurationSnapshot.exists) {
    manifest.push({ collection: 'enterprise_tenant_configurations', count: 1 });
    documents.push({ path: `enterprise_tenant_configurations/${tenantId}`, data: snapshotDocumentData(configurationSnapshot.data()) });
  }

  for (const definition of TENANT_CONTROL_COLLECTIONS) {
    const snapshot = await db.collection(definition.name).where('tenantId', '==', tenantId).get();
    manifest.push({ collection: definition.name, count: snapshot.size });
    for (const document of snapshot.docs) {
      documents.push({ path: `${definition.name}/${document.id}`, data: snapshotDocumentData(document.data()) });
    }
  }

  for (const name of TENANT_PARTITIONED_COLLECTIONS) {
    const snapshot = await db.collection(`tenants/${tenantId}/${name}`).get();
    manifest.push({ collection: `tenants/{tenantId}/${name}`, count: snapshot.size });
    for (const document of snapshot.docs) {
      documents.push({ path: `tenants/${tenantId}/${name}/${document.id}`, data: snapshotDocumentData(document.data()) });
    }
  }

  documents.sort((left, right) => left.path.localeCompare(right.path));
  const totalChecksum = checksum(documents.map(document => ({ path: document.path, data: document.data })));
  return Object.freeze({
    format: 'resumepilot-enterprise-tenant-snapshot',
    version: 1,
    tenantId,
    createdAt: new Date(now).toISOString(),
    manifest,
    documentCount: documents.length,
    checksum: totalChecksum,
    documents,
    notes: [
      'enterprise_quota_buckets are transient rate counters and are intentionally excluded',
      'enterprise_api_keys hold only hashes and are excluded from logical tenant snapshots',
    ],
  });
}

/**
 * Verify a snapshot: structural validation plus checksum recomputation.
 */
function verifySnapshot(snapshot) {
  const problems = [];
  if (!snapshot || snapshot.format !== 'resumepilot-enterprise-tenant-snapshot' || snapshot.version !== 1) {
    problems.push('snapshot format/version is invalid');
    return { ok: false, problems };
  }
  try {
    assertUuid(snapshot.tenantId, 'Tenant identifier');
  } catch {
    problems.push('snapshot tenantId is invalid');
  }
  const documents = Array.isArray(snapshot.documents) ? snapshot.documents : [];
  for (const document of documents) {
    if (typeof document.path !== 'string' || !/^[A-Za-z0-9_/\-.]{1,300}$/.test(document.path)) problems.push(`invalid document path: ${document.path}`);
  }
  const recomputed = checksum(documents.map(document => ({ path: document.path, data: document.data })));
  if (recomputed !== snapshot.checksum) problems.push('checksum mismatch: snapshot was altered or corrupted');
  const manifestTotal = (snapshot.manifest || []).reduce((total, entry) => total + Number(entry.count || 0), 0);
  if (manifestTotal !== documents.length) problems.push(`manifest counts (${manifestTotal}) do not match document count (${documents.length})`);
  return { ok: problems.length === 0, problems, checksum: recomputed };
}

/**
 * Restore a tenant snapshot. dry-run validates only; apply writes idempotently.
 * Returns a per-document report; unknown tenants' paths are refused.
 */
async function restoreTenantSnapshot({ db, admin, snapshot, mode = 'dry-run' }) {
  if (!db || !admin?.firestore?.FieldValue) throw Object.assign(new Error('Enterprise restore requires a Firestore handle'), { code: 'ENTERPRISE_BACKUP_UNAVAILABLE', status: 503 });
  const verification = verifySnapshot(snapshot);
  if (!verification.ok) {
    throw Object.assign(new Error(`Snapshot verification failed: ${verification.problems.join('; ')}`), { code: 'ENTERPRISE_BACKUP_CORRUPT', status: 409 });
  }
  const tenantId = assertUuid(snapshot.tenantId, 'Tenant identifier');
  const allowedPrefixes = [
    `tenants/${tenantId}/`,
    `enterprise_tenants/${tenantId}`,
    `enterprise_tenant_configurations/${tenantId}`,
    ...TENANT_CONTROL_COLLECTIONS.map(definition => `${definition.name}/`),
  ];
  const report = { mode, restored: 0, skipped: 0, refused: [], verifiedChecksum: verification.checksum };
  if (mode === 'dry-run') {
    for (const document of snapshot.documents) {
      if (!allowedPrefixes.some(prefix => document.path.startsWith(prefix))) report.refused.push(document.path);
    }
    report.restored = snapshot.documents.length - report.refused.length;
    return report;
  }
  if (mode !== 'apply') throw Object.assign(new Error('Restore mode must be dry-run or apply'), { code: 'ENTERPRISE_BACKUP_INVALID_MODE', status: 400 });
  const batch = db.batch();
  for (const document of snapshot.documents) {
    if (!allowedPrefixes.some(prefix => document.path.startsWith(prefix))) {
      report.refused.push(document.path);
      continue;
    }
    // Control-plane collections may contain other tenants' documents only via
    // tampering; the tenantId field inside the document is re-verified.
    const segments = document.path.split('/');
    const isControlCollection = TENANT_CONTROL_COLLECTIONS.some(definition => definition.name === segments[0]);
    if (isControlCollection && document.data?.tenantId && document.data.tenantId !== tenantId) {
      report.refused.push(document.path);
      continue;
    }
    batch.set(db.doc(document.path), reviveTimestamps(document.data), { merge: false });
    report.restored += 1;
  }
  await batch.commit();
  return report;
}

function reviveTimestamps(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(reviveTimestamps);
  if ('__ts' in value && Object.keys(value).length === 1) return new Date(value.__ts);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveTimestamps(item)]));
}

/**
 * Post-restore verification: re-export the tenant and compare checksums.
 */
async function verifyTenantRestored({ db, admin, snapshot }) {
  const fresh = await exportTenantSnapshot({ db, admin, tenantId: snapshot.tenantId });
  const verification = verifySnapshot(fresh);
  // Partition tree + control docs may legitimately gain audit/migration
  // documents after restore; the check requires the restored set to be present
  // byte-for-byte rather than forbidding later writes.
  const restoredPaths = new Set(snapshot.documents.map(document => document.path));
  const freshByPath = new Map(fresh.documents.map(document => [document.path, document.data]));
  const missing = [];
  const mismatched = [];
  for (const document of snapshot.documents) {
    const current = freshByPath.get(document.path);
    if (current === undefined) { missing.push(document.path); continue; }
    if (JSON.stringify(current) !== JSON.stringify(document.data)) mismatched.push(document.path);
  }
  return {
    ok: verification.ok && missing.length === 0 && mismatched.length === 0,
    checksumVerified: verification.ok,
    missing,
    mismatched,
  };
}

module.exports = {
  TENANT_CONTROL_COLLECTIONS,
  TENANT_PARTITIONED_COLLECTIONS,
  canonicalize,
  checksum,
  exportTenantSnapshot,
  restoreTenantSnapshot,
  verifySnapshot,
  verifyTenantRestored,
};
