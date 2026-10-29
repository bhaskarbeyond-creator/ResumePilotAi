'use strict';

/**
 * Admin audit log query (FP-A22 / DISC-035)
 *
 * Part 1: unit tests for security/adminAudit.js (queryAdminAuditLogs directly).
 * Part 2: route-layer tests for GET /api/admin/audit-logs.
 */

process.env.NODE_ENV = 'test';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { queryAdminAuditLogs } = require('../security/adminAudit');
const auth = require('../security/auth');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');

// ---------------------------------------------------------------------------
// Part 1: queryAdminAuditLogs unit tests (existing coverage, preserved)
// ---------------------------------------------------------------------------

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

it('admin audit search filters records and redacts raw credential values at read time', async () => {
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

// ---------------------------------------------------------------------------
// Part 2: route-layer tests for GET /api/admin/audit-logs
// ---------------------------------------------------------------------------

auth.setTokenVerifierForTests(async token => {
  const IDENTITIES = {
    admin: {
      uid: 'adm-1', email: 'admin@audit-local.test', role: 'ADMIN', email_verified: true,
    },
    auditor: {
      uid: 'aud-1', email: 'auditor@audit-local.test', role: 'AUDITOR', email_verified: true,
    },
    employer: {
      uid: 'emp-1', email: 'employer@audit-local.test', role: 'EMPLOYER', email_verified: true,
    },
  };
  const identity = IDENTITIES[token];
  if (!identity) throw new Error('Unknown test token');
  return identity;
});

function bearer(token) { return `Bearer ${token}`; }

// ---------------------------------------------------------------------------
// Repository double: getAdminAuditLogs only
// ---------------------------------------------------------------------------
const NOW = new Date('2026-10-30T12:00:00.000Z');

function auditRepository(records = []) {
  return {
    async getAdminAuditLogs(options = {}) {
      const search = String(options.search || '').toLowerCase();
      let filtered = records.filter(record => {
        if (!search) return true;
        const haystack = JSON.stringify(record).toLowerCase();
        return haystack.includes(search);
      });
      if (options.startDate) {
        const start = new Date(options.startDate).getTime();
        filtered = filtered.filter(r => new Date(r.createdAt || r.occurredAt || 0).getTime() >= start);
      }
      if (options.endDate) {
        const end = new Date(options.endDate).getTime();
        filtered = filtered.filter(r => new Date(r.createdAt || r.occurredAt || 0).getTime() <= end);
      }
      if (options.severity) {
        filtered = filtered.filter(r => String(r.severity).toUpperCase() === String(options.severity).toUpperCase());
      }
      if (options.category) {
        filtered = filtered.filter(r => String(r.category).toUpperCase() === String(options.category).toUpperCase());
      }
      if (options.actorUid) {
        filtered = filtered.filter(r => String(r.actorUid) === String(options.actorUid));
      }
      const limit = Number(options.limit || 50);
      const page = filtered.slice(0, limit);
      return page;
    },
    async getAdminAuditLog(id) {
      return records.find(r => r.id === id) || null;
    },
  };
}

let repository;
beforeEach(() => {
  repository = auditRepository([
    {
      id: 'audit-1', createdAt: '2026-10-30T08:00:00.000Z', actorUid: 'adm-1',
      actorEmail: 'admin@audit-local.test', actorRole: 'ADMIN', action: 'TENANT_RENAMED',
      category: 'tenant', severity: 'HIGH', outcome: 'SUCCESS', method: 'PATCH',
      pathname: '/api/admin/tenants/t-1', statusCode: 200, requestId: 'req-1', metadata: {},
    },
    {
      id: 'audit-2', createdAt: '2026-10-30T09:00:00.000Z', actorUid: 'emp-1',
      actorEmail: 'employer@audit-local.test', actorRole: 'EMPLOYER', action: 'JOB_VIEWED',
      category: 'jobs', severity: 'LOW', outcome: 'SUCCESS', method: 'GET',
      pathname: '/api/jobs/j-1', statusCode: 200, requestId: 'req-2', metadata: {},
    },
    {
      id: 'audit-3', createdAt: '2026-10-30T10:00:00.000Z', actorUid: 'adm-1',
      actorEmail: 'admin@audit-local.test', actorRole: 'ADMIN', action: 'COUPON_DELETED',
      category: 'coupons', severity: 'CRITICAL', outcome: 'FAILURE', method: 'DELETE',
      pathname: '/api/admin/coupons/SUMMER22', statusCode: 403, requestId: 'req-3', metadata: {},
    },
    {
      id: 'audit-4', createdAt: '2026-10-29T14:00:00.000Z', actorUid: 'aud-1',
      actorEmail: 'auditor@audit-local.test', actorRole: 'AUDITOR', action: 'SETTINGS_READ',
      category: 'settings', severity: 'MEDIUM', outcome: 'SUCCESS', method: 'GET',
      pathname: '/api/admin/settings', statusCode: 200, requestId: 'req-4', metadata: {},
    },
  ]);
  setRepositoryForTests(repository);
});

afterEach(() => {
  resetRepositoryCacheForTests();
  repository = null;
});

const app = require('../index');

describe('Admin audit log query (FP-A22 / DISC-035)', () => {
  it('GET /api/admin/audit-logs requires authentication', async () => {
    const res = await request(app).get('/api/admin/audit-logs');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  });

  it('GET /api/admin/audit-logs rejects non-audit roles with 403', async () => {
    const res = await request(app).get('/api/admin/audit-logs').set('Authorization', bearer('employer'));
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('GET /api/admin/audit-logs returns JSON logs for an admin', async () => {
    const res = await request(app).get('/api/admin/audit-logs').set('Authorization', bearer('admin'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.count, 4);
    assert.equal(res.body.limit, 50);
    assert.equal(res.body.source, 'mariadb');
    assert.ok(Array.isArray(res.body.logs));
    assert.equal(res.body.logs[0].id, 'audit-1');
  });

  it('GET /api/admin/audit-logs returns JSON logs for an auditor', async () => {
    const res = await request(app).get('/api/admin/audit-logs').set('Authorization', bearer('auditor'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.count, 4);
  });

  it('GET /api/admin/audit-logs applies limit (max 200) and offset', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?limit=2&offset=1')
      .set('Authorization', bearer('admin'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.limit, 2);
    assert.equal(res.body.offset, 1);
    assert.equal(res.body.logs.length, 2);
    assert.equal(res.body.logs[0].id, 'audit-2');
    assert.equal(res.body.logs[1].id, 'audit-3');
  });

  it('GET /api/admin/audit-logs caps limit at 200', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?limit=9999')
      .set('Authorization', bearer('admin'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.limit, 200);
  });

  it('GET /api/admin/audit-logs filters by severity', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?severity=CRITICAL')
      .set('Authorization', bearer('admin'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.count, 1);
    assert.equal(res.body.logs[0].id, 'audit-3');
    assert.equal(res.body.logs[0].severity, 'CRITICAL');
  });

  it('GET /api/admin/audit-logs filters by category', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?category=jobs')
      .set('Authorization', bearer('admin'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.count, 1);
    assert.equal(res.body.logs[0].id, 'audit-2');
  });

  it('GET /api/admin/audit-logs filters by actorUid', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?actorUid=adm-1')
      .set('Authorization', bearer('admin'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.count, 2);
    assert.ok(res.body.logs.every(l => l.actorUid === 'adm-1'));
  });

  it('GET /api/admin/audit-logs filters by date range', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?startDate=2026-10-30T00:00:00.000Z&endDate=2026-10-30T23:59:59.999Z')
      .set('Authorization', bearer('admin'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.count, 3);
    assert.ok(res.body.logs.every(l => l.createdAt.startsWith('2026-10-30')));
  });

  it('GET /api/admin/audit-logs returns CSV with text/csv content type', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?format=csv')
      .set('Authorization', bearer('admin'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.headers['content-disposition'].includes('attachment'));
    const lines = res.text.split('\n').filter(Boolean);
    assert.ok(lines[0].startsWith('id,createdAt,actorUid,actorEmail,actorRole,action,category,severity,'));
    assert.equal(lines.length, 5); // header + 4 records
  });

  it('GET /api/admin/audit-logs CSV escapes quoted fields', async () => {
    repository = auditRepository([{
      id: 'audit-csv', createdAt: NOW.toISOString(), actorUid: 'adm-1',
      actorEmail: 'admin@audit-local.test', actorRole: 'ADMIN', action: 'TEST_ACTION',
      category: 'tenant,sub', severity: 'HIGH', outcome: 'SUCCESS', method: 'POST',
      pathname: '/api/admin/test', statusCode: 200, requestId: 'req-csv', metadata: { note: 'has, comma' },
    }]);
    setRepositoryForTests(repository);
    const res = await request(app)
      .get('/api/admin/audit-logs?format=csv&actorUid=adm-1')
      .set('Authorization', bearer('admin'));
    assert.equal(res.status, 200);
    // RFC4180: fields containing commas are double-quoted
    assert.ok(res.text.includes('"tenant,sub"'));
  });
});
