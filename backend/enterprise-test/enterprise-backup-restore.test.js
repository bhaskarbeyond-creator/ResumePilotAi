'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TENANT_TABLES,
  checksum,
  exportTenantSnapshot,
  restoreTenantSnapshot,
  verifySnapshot,
  verifyTenantRestored,
} = require('../enterprise/enterpriseBackup');
const { InMemoryTenantBackupPool } = require('../test/helpers/inMemoryTenantBackupPool');
const { TenantService } = require('../enterprise/tenantService');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

function seed() {
  return {
    enterprise_tenants: [{ id: TENANT_ID, slug: 'backup-co', displayName: 'Backup Co' }],
    enterprise_workspaces: [{ id: WORKSPACE_ID, tenantId: TENANT_ID, name: 'Primary' }],
    enterprise_memberships: [{ id: 'membership-owner', tenantId: TENANT_ID, principalId: 'backup-owner', workspaceId: WORKSPACE_ID, status: 'ACTIVE' }],
    enterprise_membership_invitations: [{ id: 'invitation-1', membershipId: 'membership-owner', tenantId: TENANT_ID, principalId: 'backup-owner', workspaceId: WORKSPACE_ID }],
    enterprise_workspace_memberships: [{ id: 'workspace-member-1', tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, principalId: 'backup-owner' }],
    enterprise_tenant_configurations: [{ tenantId: TENANT_ID, revision: 1 }],
    enterprise_principal_tenants: [{ principalId: 'backup-owner', personalTenantId: TENANT_ID, defaultWorkspaceId: WORKSPACE_ID }],
    enterprise_teams: [{ id: 'team-1', tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, name: 'Team' }],
    enterprise_team_members: [{ id: 'team-member-1', tenantId: TENANT_ID, teamId: 'team-1', principalId: 'backup-owner' }],
    enterprise_resources: [{
      id: 'resource-1', tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, resourceType: 'RESUME',
      data: JSON.stringify({ payloadCipher: { __enterpriseEncrypted: true, alg: 'AES-256-GCM', keyVersion: 'v1', ciphertext: 'sealed-value', iv: 'iv', tag: 'tag' } }), revision: 1,
    }],
    enterprise_audit_events: [{ id: 'audit-1', tenantId: TENANT_ID, action: 'RESOURCE_CREATED' }],
    enterprise_ai_usage: [{ id: 'usage-1', tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, principalId: 'backup-owner', dayKey: '2026-08-28' }],
    enterprise_support_grants: [], enterprise_outbox: [],
    notification_outbox: [{ id: 'notification-1', tenant_id: TENANT_ID, state: 'DELIVERED' }],
  };
}

function resign(snapshot) {
  snapshot.recordCount = snapshot.tables.reduce((total, table) => total + table.rows.length, 0);
  snapshot.checksum = checksum(snapshot.tables.map(table => ({ name: table.name, count: table.count, rows: table.rows })));
  return snapshot;
}

test('tenant snapshot export contains every MariaDB tenant table and verifies its checksum', async () => {
  const pool = new InMemoryTenantBackupPool(seed());
  const snapshot = await exportTenantSnapshot({ pool, tenantId: TENANT_ID, now: '2026-08-28T00:00:00.000Z' });
  assert.equal(snapshot.format, 'resumepilot-enterprise-mariadb-tenant-snapshot');
  assert.equal(snapshot.version, 3);
  assert.equal(snapshot.tables.length, TENANT_TABLES.length);
  assert.equal(snapshot.tables.find(table => table.name === 'enterprise_resources').count, 1);
  assert.equal(snapshot.tables.find(table => table.name === 'notification_outbox').count, 1);
  assert.match(snapshot.checksum, /^[0-9a-f]{64}$/);
  assert.equal(verifySnapshot(snapshot).ok, true);
  assert.ok(!JSON.stringify(snapshot).includes('plaintext-api-key'));
  assert.ok(snapshot.notes.some(note => note.includes('service_accounts')));
});

test('tenant export audit describes the MariaDB snapshot rather than retired document metadata', async () => {
  const pool = new InMemoryTenantBackupPool(seed());
  let auditEvent = null;
  const repository = {
    pool,
    async appendAuditEvent(_context, event) { auditEvent = event; return event; },
  };
  const service = new TenantService({ registry: {}, repository });
  const context = {
    tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, workspaceScope: 'WORKSPACE',
    principalId: 'backup-owner', subjectId: 'firebase-backup-owner', identityIssuer: 'firebase',
    actorType: 'user', requestId: 'backup-request', correlationId: 'backup-correlation', policyVersion: 1,
    dataPlane: { id: 'mysql-primary', type: 'MYSQL', routingVersion: 1 },
  };
  const snapshot = await service.exportTenantData({ context });
  assert.equal(auditEvent.action, 'TENANT_DATA_EXPORTED');
  assert.deepEqual(auditEvent.metadata, {
    format: snapshot.format,
    version: '3',
    tables: String(TENANT_TABLES.length),
    records: String(snapshot.recordCount),
    checksum: snapshot.checksum,
  });
  assert.equal(Object.hasOwn(auditEvent.metadata, 'collections'), false);
  assert.equal(Object.hasOwn(auditEvent.metadata, 'documents'), false);
});

test('snapshot tampering and structural drift are detected before restore', async () => {
  const pool = new InMemoryTenantBackupPool(seed());
  const snapshot = await exportTenantSnapshot({ pool, tenantId: TENANT_ID });
  const tampered = structuredClone(snapshot);
  tampered.tables.find(table => table.name === 'enterprise_resources').rows[0].revision = 99;
  assert.match(verifySnapshot(tampered).problems.join('; '), /checksum mismatch/);

  const missing = structuredClone(snapshot);
  missing.tables = missing.tables.filter(table => table.name !== 'enterprise_ai_usage');
  resign(missing);
  assert.match(verifySnapshot(missing).problems.join('; '), /required table is missing: enterprise_ai_usage/);
  await assert.rejects(() => restoreTenantSnapshot({ pool, snapshot: missing, mode: 'apply' }), error => error.code === 'ENTERPRISE_BACKUP_CORRUPT');
});

test('restore dry-run writes nothing; apply recovers catastrophic tenant loss and reconciles every row', async () => {
  const pool = new InMemoryTenantBackupPool(seed());
  const snapshot = await exportTenantSnapshot({ pool, tenantId: TENANT_ID });
  const beforeDryRun = structuredClone(pool.rows);
  const dryRun = await restoreTenantSnapshot({ pool, snapshot, mode: 'dry-run' });
  assert.equal(dryRun.restored, snapshot.recordCount);
  assert.deepEqual(pool.rows, beforeDryRun);

  pool.clearTenant(TENANT_ID);
  assert.equal(pool.rows.enterprise_tenants.length, 0);
  const restored = await restoreTenantSnapshot({ pool, snapshot, mode: 'apply' });
  assert.equal(restored.restored, snapshot.recordCount);
  const reconciliation = await verifyTenantRestored({ pool, snapshot });
  assert.deepEqual(reconciliation, { ok: true, missing: [], mismatched: [] });
});

test('append-only restore rejects an alternate-unique collision and rolls back all table writes', async () => {
  const sourceSeed = seed();
  sourceSeed.enterprise_ai_usage[0] = {
    ...sourceSeed.enterprise_ai_usage[0], id: 'usage-from-snapshot', eventKey: 'shared-provider-event', totalTokens: 42,
  };
  const source = new InMemoryTenantBackupPool(sourceSeed);
  const snapshot = await exportTenantSnapshot({ pool: source, tenantId: TENANT_ID });

  const targetSeed = seed();
  targetSeed.enterprise_tenants[0].displayName = 'Target must roll back';
  targetSeed.enterprise_ai_usage[0] = {
    ...targetSeed.enterprise_ai_usage[0], id: 'different-existing-id', eventKey: 'shared-provider-event', totalTokens: 99,
  };
  const target = new InMemoryTenantBackupPool(targetSeed);
  const before = structuredClone(target.rows);

  await assert.rejects(
    () => restoreTenantSnapshot({ pool: target, snapshot, mode: 'apply' }),
    error => error.code === 'ENTERPRISE_BACKUP_CONFLICT' && /enterprise_ai_usage/.test(error.message)
  );
  assert.deepEqual(target.rows, before);
  assert.ok(target.calls.includes('ROLLBACK'));
});

test('restore refuses a checksum-valid snapshot containing a cross-tenant row', async () => {
  const pool = new InMemoryTenantBackupPool(seed());
  const snapshot = await exportTenantSnapshot({ pool, tenantId: TENANT_ID });
  const forged = structuredClone(snapshot);
  forged.tables.find(table => table.name === 'enterprise_resources').rows[0].tenantId = '33333333-3333-4333-8333-333333333333';
  resign(forged);
  const verification = verifySnapshot(forged);
  assert.equal(verification.ok, false);
  assert.match(verification.problems.join('; '), /tenant scope mismatch/);
  await assert.rejects(() => restoreTenantSnapshot({ pool, snapshot: forged, mode: 'apply' }), error => error.code === 'ENTERPRISE_BACKUP_CORRUPT');
});
