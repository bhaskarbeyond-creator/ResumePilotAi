'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MySqlTenantRegistry } = require('../enterprise/mysqlTenantRegistry');
const { TenantService } = require('../enterprise/tenantService');

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function purgeHarness({ lifecycleState = 'DELETING', exists = true, failOn = null } = {}) {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push({ type: 'BEGIN' }); },
    async query(sql, params = []) {
      const compact = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ type: 'QUERY', sql: compact, params });
      if (/SELECT lifecycleState FROM enterprise_tenants/.test(compact)) {
        return [[...(exists ? [{ lifecycleState }] : [])]];
      }
      if (failOn && new RegExp(failOn).test(compact)) throw Object.assign(new Error('simulated purge failure'), { code: 'ER_LOCK_DEADLOCK' });
      return [{ affectedRows: 1 }];
    },
    async commit() { calls.push({ type: 'COMMIT' }); },
    async rollback() { calls.push({ type: 'ROLLBACK' }); },
    release() { calls.push({ type: 'RELEASE' }); },
  };
  return { calls, pool: { async getConnection() { return connection; } } };
}

function queryIndex(calls, pattern) {
  return calls.findIndex(call => call.type === 'QUERY' && pattern.test(call.sql));
}

test('hard purge locks a DELETING tenant and removes every tenant-owned MariaDB domain in FK-safe order', async () => {
  const harness = purgeHarness();
  const registry = new MySqlTenantRegistry({ pool: harness.pool });
  const result = await registry.purgeTenantRecords(TENANT_ID, { requestId: 'purge-request-1' });
  assert.deepEqual(result, { success: true, alreadyPurged: false });

  const requiredDeletes = [
    'enterprise_membership_invitations', 'enterprise_team_members', 'enterprise_teams',
    'enterprise_workspace_memberships', 'enterprise_resources', 'enterprise_ai_usage',
    'enterprise_service_accounts', 'enterprise_support_grants', 'enterprise_outbox',
    'notification_outbox', 'enterprise_audit_events', 'enterprise_memberships',
    'enterprise_principal_tenants', 'enterprise_tenant_configurations',
    'enterprise_workspaces', 'enterprise_tenants',
  ];
  for (const table of requiredDeletes) {
    assert.ok(queryIndex(harness.calls, new RegExp(`DELETE FROM ${table}\\b`)) >= 0, `${table} must be purged`);
  }
  assert.ok(queryIndex(harness.calls, /DELETE FROM enterprise_ai_usage/) < queryIndex(harness.calls, /DELETE FROM enterprise_workspaces/), 'AI rows must precede workspace deletion');
  assert.ok(queryIndex(harness.calls, /DELETE FROM enterprise_membership_invitations/) < queryIndex(harness.calls, /DELETE FROM notification_outbox/), 'invitation FK must be released before notification deletion');
  assert.ok(queryIndex(harness.calls, /INSERT INTO security_audit_logs/) < queryIndex(harness.calls, /DELETE FROM enterprise_tenants/), 'retained platform audit must commit with the purge');
  assert.equal(harness.calls.some(call => call.type === 'COMMIT'), true);
  assert.equal(harness.calls.some(call => call.type === 'ROLLBACK'), false);
  for (const call of harness.calls.filter(call => call.type === 'QUERY' && /^(?:DELETE|UPDATE).*tenant/i.test(call.sql))) {
    if (call.params.length) assert.equal(call.params[0], TENANT_ID, `${call.sql} must bind the tenant`);
  }
});

test('hard purge refuses an active tenant before any destructive statement', async () => {
  const harness = purgeHarness({ lifecycleState: 'ACTIVE' });
  const registry = new MySqlTenantRegistry({ pool: harness.pool });
  await assert.rejects(() => registry.purgeTenantRecords(TENANT_ID), error => error.code === 'TENANT_PURGE_STATE_INVALID' && error.status === 409);
  assert.equal(harness.calls.some(call => call.type === 'QUERY' && /^DELETE /.test(call.sql)), false);
  assert.equal(harness.calls.some(call => call.type === 'ROLLBACK'), true);
});

test('hard purge is idempotent when the tenant row is already absent', async () => {
  const harness = purgeHarness({ exists: false });
  const registry = new MySqlTenantRegistry({ pool: harness.pool });
  assert.deepEqual(await registry.purgeTenantRecords(TENANT_ID), { success: true, alreadyPurged: true });
  assert.equal(harness.calls.some(call => call.type === 'QUERY' && /^DELETE /.test(call.sql)), false);
  assert.equal(harness.calls.some(call => call.type === 'COMMIT'), true);
});

test('a mid-purge database failure rolls back the whole tenant transaction', async () => {
  const harness = purgeHarness({ failOn: 'DELETE FROM enterprise_ai_usage' });
  const registry = new MySqlTenantRegistry({ pool: harness.pool });
  await assert.rejects(() => registry.purgeTenantRecords(TENANT_ID), error => error.code === 'ER_LOCK_DEADLOCK');
  assert.equal(harness.calls.some(call => call.type === 'COMMIT'), false);
  assert.equal(harness.calls.some(call => call.type === 'ROLLBACK'), true);
  assert.equal(queryIndex(harness.calls, /DELETE FROM enterprise_tenants/), -1);
});

test('garbage collection honors grace periods and isolates one tenant purge failure from others', async () => {
  const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const candidates = [
    { id: '11111111-1111-4111-8111-111111111111', lifecycleState: 'DELETING', updatedAt: old },
    { id: '22222222-2222-4222-8222-222222222222', lifecycleState: 'DELETING', updatedAt: old },
    { id: '33333333-3333-4333-8333-333333333333', lifecycleState: 'DELETING', updatedAt: recent },
  ];
  const purged = [];
  const registry = {
    async listTenantsByLifecycleState(state) { assert.equal(state, 'DELETING'); return candidates; },
    async purgeTenantRecords(id, options) {
      assert.equal(options.requestId, 'gc-request');
      if (id.startsWith('2222')) throw new Error('simulated lock timeout');
      purged.push(id);
    },
  };
  const service = new TenantService({ registry });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await service.executeTenantGarbageCollection({ gracePeriodDays: 7, requestId: 'gc-request' });
    assert.equal(result.considered, 3);
    assert.equal(result.purgedCount, 1);
    assert.equal(result.failures.length, 1);
    assert.deepEqual(purged, ['11111111-1111-4111-8111-111111111111']);
  } finally {
    console.warn = originalWarn;
  }
});
