'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { queryAdminAuditLogs } = require('../security/adminAudit');

function fakeRepository(records) {
  return {
    async getAdminAuditLogs(options = {}) {
      const search = String(options.search || '').toLowerCase();
      return records
        .filter(record => !search || JSON.stringify(record).toLowerCase().includes(search))
        .slice(0, Number(options.limit || 50));
    },
  };
}

test('admin audit search filters records and redacts raw credential values at read time', async () => {
  const result = await queryAdminAuditLogs(fakeRepository([
    { id: 'tenant-event', actorUid: 'admin-1', actorEmail: 'admin@example.com', action: 'TENANT_RENAMED', pathname: '/api/platform/tenants', metadata: { tenantId: 'ZZ-CERT-TENANT', apiKey: 'sk_live_should_not_escape' }, occurredAt: '2026-08-23T00:00:00.000Z' },
    { id: 'other-event', actorUid: 'admin-2', actorEmail: 'other@example.com', action: 'READ_SETTINGS', pathname: '/api/admin/settings', metadata: {}, occurredAt: '2026-08-22T00:00:00.000Z' },
  ]), { search: 'zz-cert-tenant', limit: 10 });
  assert.equal(result.count, 1);
  assert.equal(result.logs[0].id, 'tenant-event');
  assert.equal(result.logs[0].metadata.apiKey, '[REDACTED]');
  assert.equal(result.hasMore, false);
  assert.equal(result.source, 'mariadb');
});
