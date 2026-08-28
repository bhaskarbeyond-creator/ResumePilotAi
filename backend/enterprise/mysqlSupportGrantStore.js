'use strict';

const { assertUuid } = require('./tenantContext');
const { createSupportGrant, activeGrant } = require('./supportAccessStore');

class MySqlSupportGrantStore {
  constructor({ pool }) {
    if (!pool) {
      const { getPool } = require('../database/mysql');
      this.pool = getPool();
    } else {
      this.pool = pool;
    }
  }

  assertAvailable() {
    if (!this.pool || this.pool._closed) {
      throw Object.assign(new Error('Support access store is unavailable: MySQL pool is closed'), { code: 'SUPPORT_ACCESS_UNAVAILABLE', status: 503 });
    }
  }

  async create(input) {
    this.assertAvailable();
    const grant = createSupportGrant(input);
    await this.pool.query(
      `INSERT INTO enterprise_support_grants (id, tenantId, workspaceId, grantedBy, grantedTo, reason, scopes, status, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
      [
        grant.id,
        grant.tenantId,
        grant.workspaceId || null,
        grant.requestedBySubjectId,
        grant.supportSubjectId,
        grant.reason,
        JSON.stringify(grant.scopes),
        new Date(grant.expiresAt),
      ]
    );
    return grant;
  }

  async validate({ grantId, supportSubjectId, tenantId, workspaceId, now = Date.now() }) {
    this.assertAvailable();
    const [rows] = await this.pool.query(
      'SELECT * FROM enterprise_support_grants WHERE id = ?',
      [String(grantId || '')]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    const grant = {
      id: r.id,
      tenantId: r.tenantId,
      workspaceId: r.workspaceId || null,
      requestedBySubjectId: r.grantedBy,
      supportSubjectId: r.grantedTo,
      reason: r.reason,
      status: r.status,
      expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      scopes: typeof r.scopes === 'string' ? JSON.parse(r.scopes) : (r.scopes || []),
    };
    return activeGrant(grant, { supportSubjectId, tenantId, workspaceId, now }) ? grant : null;
  }

  async revoke(grantId, { tenantId = null, workspaceId = null } = {}) {
    this.assertAvailable();
    let sql = `UPDATE enterprise_support_grants SET status = 'REVOKED', revokedAt = CURRENT_TIMESTAMP WHERE id = ? AND status = 'ACTIVE'`;
    const params = [String(grantId || '')];
    if (tenantId) {
      sql += ' AND tenantId = ?';
      params.push(assertUuid(tenantId, 'Tenant identifier'));
    }
    if (workspaceId) {
      sql += ' AND workspaceId = ?';
      params.push(assertUuid(workspaceId, 'Workspace identifier'));
    }
    const [res] = await this.pool.query(sql, params);
    return res.affectedRows > 0;
  }

  async list({ tenantId, workspaceId = null }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const sql = workspaceId
      ? 'SELECT * FROM enterprise_support_grants WHERE tenantId = ? AND workspaceId = ? AND status = "ACTIVE" ORDER BY created_at DESC'
      : 'SELECT * FROM enterprise_support_grants WHERE tenantId = ? AND status = "ACTIVE" ORDER BY created_at DESC';
    const params = workspaceId ? [tenantId, workspaceId] : [tenantId];
    const [rows] = await this.pool.query(sql, params);

    return rows.map(r => ({
      id: r.id,
      tenantId: r.tenantId,
      workspaceId: r.workspaceId || null,
      requestedBySubjectId: r.grantedBy,
      supportSubjectId: r.grantedTo,
      reason: r.reason,
      status: r.status,
      expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      scopes: typeof r.scopes === 'string' ? JSON.parse(r.scopes) : (r.scopes || []),
    }));
  }
}

module.exports = {
  MySqlSupportGrantStore,
};
