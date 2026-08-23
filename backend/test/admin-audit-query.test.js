'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { queryAdminAuditLogs } = require('../security/adminAudit');

function fakeDb(records) {
  const items = records.map((data, index) => ({ id: data.id || `event-${index}`, data }));
  const makeQuery = (selected = items) => ({
    where(field, operator, value) {
      const filtered = selected.filter(item => operator === '==' ? item.data[field] === value : true);
      return makeQuery(filtered);
    },
    orderBy() { return makeQuery(selected); },
    limit(count) { return makeQuery(selected.slice(0, count)); },
    startAfter() { return makeQuery(selected.slice(1)); },
    async get() {
      return {
        docs: selected.map(item => ({ id: item.id, data: () => item.data })),
        forEach(callback) { selected.forEach(item => callback({ id: item.id, data: () => item.data })); },
      };
    },
  });
  return {
    collection() { return makeQuery(); },
    doc(path) {
      const found = items.find(item => item.id === path);
      return { async get() { return { exists: Boolean(found), data: () => found?.data }; } };
    },
  };
}

test('admin audit search filters sanitized records and does not return raw credential values', async () => {
  const result = await queryAdminAuditLogs(fakeDb([
    { id: 'tenant-event', actorUid: 'admin-1', actorEmail: 'admin@example.com', action: 'TENANT_RENAMED', pathname: '/api/platform/tenants', metadata: { tenantId: 'ZZ-CERT-TENANT', apiKey: 'sk_live_should_not_escape' }, occurredAt: '2026-08-23T00:00:00.000Z' },
    { id: 'other-event', actorUid: 'admin-2', actorEmail: 'other@example.com', action: 'READ_SETTINGS', pathname: '/api/admin/settings', metadata: {}, occurredAt: '2026-08-22T00:00:00.000Z' },
  ]), { search: 'zz-cert-tenant', limit: 10 });
  assert.equal(result.count, 1);
  assert.equal(result.logs[0].id, 'tenant-event');
  assert.equal(result.logs[0].metadata.apiKey, '[REDACTED]');
  assert.equal(result.hasMore, false);
});
