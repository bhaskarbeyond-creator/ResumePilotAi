'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TENANT_TABLES,
  checksum,
  exportTenantSnapshot,
  restoreTenantSnapshot,
  verifySnapshot,
} = require('../enterprise/enterpriseBackup');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const MEMBERSHIP_ID = 'membership-1';

function scopedRows() {
  return {
    enterprise_tenants: [{ id: TENANT_ID, displayName: 'Backup Tenant' }],
    enterprise_workspaces: [{ id: WORKSPACE_ID, tenantId: TENANT_ID }],
    enterprise_memberships: [{ id: MEMBERSHIP_ID, tenantId: TENANT_ID, principalId: 'user-1' }],
    enterprise_membership_invitations: [{ id: 'invitation-1', membershipId: MEMBERSHIP_ID, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, principalId: 'user-1' }],
    enterprise_workspace_memberships: [{ id: 'workspace-member-1', tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, principalId: 'user-1' }],
    enterprise_tenant_configurations: [{ tenantId: TENANT_ID }],
    enterprise_principal_tenants: [{ principalId: 'user-1', personalTenantId: TENANT_ID }],
    enterprise_teams: [],
    enterprise_team_members: [],
    enterprise_resources: [],
    enterprise_audit_events: [],
    enterprise_ai_usage: [],
    enterprise_support_grants: [],
    enterprise_outbox: [],
    notification_outbox: [{ id: 'notification-1', tenant_id: TENANT_ID }],
  };
}

function exportPool({ failTable = null } = {}) {
  const calls = [];
  const rows = scopedRows();
  const connection = {
    async query(sql) {
      calls.push(sql);
      const match = sql.match(/SELECT \* FROM `([^`]+)`/);
      if (!match) return [[]];
      if (match[1] === failTable) throw Object.assign(new Error('read failed'), { code: 'ER_QUERY_INTERRUPTED' });
      return [rows[match[1]] || []];
    },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
  };
  return { calls, pool: { async getConnection() { return connection; } } };
}

test('v3 export uses one consistent read-only transaction and includes invitation delivery state', async () => {
  const harness = exportPool();
  const snapshot = await exportTenantSnapshot({ pool: harness.pool, tenantId: TENANT_ID, now: '2026-08-28T00:00:00.000Z' });
  assert.equal(snapshot.version, 3);
  assert.equal(snapshot.tables.length, TENANT_TABLES.length);
  assert.equal(snapshot.tables.find(table => table.name === 'enterprise_membership_invitations').count, 1);
  assert.equal(snapshot.tables.find(table => table.name === 'notification_outbox').count, 1);
  assert.equal(verifySnapshot(snapshot).ok, true);
  assert.equal(harness.calls[0], 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  assert.equal(harness.calls[1], 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  assert.equal(harness.calls.filter(call => call === 'COMMIT').length, 1);
  assert.equal(harness.calls.includes('ROLLBACK'), false);
  assert.equal(harness.calls.at(-1), 'RELEASE');
});

test('export rolls back rather than returning a partial snapshot when any required table fails', async () => {
  const harness = exportPool({ failTable: 'enterprise_membership_invitations' });
  await assert.rejects(() => exportTenantSnapshot({ pool: harness.pool, tenantId: TENANT_ID }), /read failed/);
  assert.equal(harness.calls.includes('COMMIT'), false);
  assert.equal(harness.calls.includes('ROLLBACK'), true);
  assert.equal(harness.calls.at(-1), 'RELEASE');
});

test('snapshot verification rejects missing tables, duplicate keys and broken invitation references', async () => {
  const snapshot = await exportTenantSnapshot({ pool: exportPool().pool, tenantId: TENANT_ID });

  const missing = structuredClone(snapshot);
  missing.tables = missing.tables.filter(table => table.name !== 'notification_outbox');
  missing.recordCount = missing.tables.reduce((sum, table) => sum + table.rows.length, 0);
  missing.checksum = checksum(missing.tables.map(table => ({ name: table.name, count: table.count, rows: table.rows })));
  assert.match(verifySnapshot(missing).problems.join('; '), /required table is missing: notification_outbox/);

  const duplicate = structuredClone(snapshot);
  const memberships = duplicate.tables.find(table => table.name === 'enterprise_memberships');
  memberships.rows.push(structuredClone(memberships.rows[0]));
  memberships.count += 1;
  duplicate.recordCount += 1;
  duplicate.checksum = checksum(duplicate.tables.map(table => ({ name: table.name, count: table.count, rows: table.rows })));
  assert.match(verifySnapshot(duplicate).problems.join('; '), /duplicate row key in enterprise_memberships/);

  const broken = structuredClone(snapshot);
  broken.tables.find(table => table.name === 'enterprise_membership_invitations').rows[0].membershipId = 'missing-membership';
  broken.checksum = checksum(broken.tables.map(table => ({ name: table.name, count: table.count, rows: table.rows })));
  assert.match(verifySnapshot(broken).problems.join('; '), /invitation references a missing membership/);
});

test('dry-run validates a snapshot without acquiring a write connection', async () => {
  const snapshot = await exportTenantSnapshot({ pool: exportPool().pool, tenantId: TENANT_ID });
  let acquired = false;
  const report = await restoreTenantSnapshot({
    pool: { async getConnection() { acquired = true; throw new Error('must not connect'); } },
    snapshot,
    mode: 'dry-run',
  });
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.restored, snapshot.recordCount);
  assert.equal(acquired, false);
});
