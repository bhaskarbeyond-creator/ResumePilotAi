'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { exportTenantSnapshot, restoreTenantSnapshot, verifyTenantRestored } = require('../enterprise/enterpriseBackup');
const { InMemoryTenantBackupPool } = require('../test/helpers/inMemoryTenantBackupPool');

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORKSPACE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function state() {
  return {
    enterprise_tenants: [{ id: TENANT_ID, slug: 'dr-industries', displayName: 'DR Industries' }],
    enterprise_workspaces: [{ id: WORKSPACE_ID, tenantId: TENANT_ID, name: 'Primary' }],
    enterprise_memberships: [{ id: 'membership-owner', tenantId: TENANT_ID, principalId: 'dr-owner', workspaceId: WORKSPACE_ID, status: 'ACTIVE' }],
    enterprise_membership_invitations: [], enterprise_workspace_memberships: [],
    enterprise_tenant_configurations: [{ tenantId: TENANT_ID, revision: 1 }],
    enterprise_principal_tenants: [{ principalId: 'dr-owner', personalTenantId: TENANT_ID, defaultWorkspaceId: WORKSPACE_ID }],
    enterprise_teams: [], enterprise_team_members: [],
    enterprise_resources: [
      { id: 'resume-1', tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, resourceType: 'RESUME', data: '{"payload":{"title":"Principal CV"}}', revision: 1 },
      { id: 'cover-1', tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, resourceType: 'COVER', data: '{"payload":{"title":"Principal Cover"}}', revision: 1 },
    ],
    enterprise_audit_events: [{ id: 'audit-1', tenantId: TENANT_ID, action: 'DR_SEED' }],
    enterprise_ai_usage: [{ id: 'usage-1', tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, principalId: 'dr-owner', dayKey: '2026-08-28', totalTokens: 1200 }],
    enterprise_support_grants: [], enterprise_outbox: [], notification_outbox: [],
  };
}

test('MariaDB DR contract simulation: consistent snapshot survives tenant loss and reconciles after restore', async () => {
  const pool = new InMemoryTenantBackupPool(state());
  const snapshot = await exportTenantSnapshot({ pool, tenantId: TENANT_ID, now: '2026-08-28T10:00:00.000Z' });
  assert.equal(snapshot.recordCount, Object.values(state()).reduce((count, rows) => count + rows.length, 0));

  pool.clearTenant(TENANT_ID);
  assert.equal(pool.rows.enterprise_resources.length, 0);
  assert.equal(pool.rows.enterprise_ai_usage.length, 0);

  const report = await restoreTenantSnapshot({ pool, snapshot, mode: 'apply' });
  assert.equal(report.restored, snapshot.recordCount);
  assert.equal(report.skipped, 0);
  assert.deepEqual(await verifyTenantRestored({ pool, snapshot }), { ok: true, missing: [], mismatched: [] });

  // This is a deterministic contract simulation only. A physical backup,
  // point-in-time recovery, and genuine MariaDB restore remain separate drills.
  assert.equal(pool.rows.enterprise_resources.length, 2);
  assert.equal(pool.rows.enterprise_ai_usage[0].totalTokens, 1200);
});
