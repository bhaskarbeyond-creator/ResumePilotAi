'use strict';

const crypto = require('crypto');
const { createApiKeyMaterial, hashSecret, verifyApiKeyRecord } = require('./serviceIdentity');
const { assertUuid } = require('./tenantContext');

const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,99}$/u;

function normalizeName(value) {
  const name = String(value || '').trim();
  if (!NAME_PATTERN.test(name)) {
    throw Object.assign(new Error('Service account name is invalid'), { code: 'INVALID_SERVICE_ACCOUNT', status: 400 });
  }
  return name;
}

class MySqlServiceAccountStore {
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
      throw Object.assign(new Error('Service account store is unavailable: MySQL pool is closed'), { code: 'SERVICE_ACCOUNT_STORE_UNAVAILABLE', status: 503 });
    }
  }

  async create({ tenantId, workspaceId = null, displayName, scopes, now = new Date() }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = workspaceId ? assertUuid(workspaceId, 'Workspace identifier') : null;
    const id = crypto.randomUUID();
    const material = createApiKeyMaterial({ tenantId, workspaceId, serviceAccountId: id, scopes, now });
    const cleanName = normalizeName(displayName);

    await this.pool.query(
      `INSERT INTO enterprise_service_accounts (id, tenantId, workspaceId, displayName, status, keyId, keyPrefix, secretHash, scopes, expiresAt)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        workspaceId,
        cleanName,
        material.record.id,
        material.record.prefix,
        material.record.secretHash,
        JSON.stringify(material.record.scopes),
        material.record.expiresAt ? new Date(material.record.expiresAt) : null,
      ]
    );

    const account = {
      id,
      tenantId,
      workspaceId,
      scope: workspaceId ? 'WORKSPACE' : 'TENANT',
      displayName: cleanName,
      status: 'ACTIVE',
      createdAt: new Date(now).toISOString(),
      scopes: [...material.record.scopes],
      apiKeyId: material.record.id,
      apiKeyPrefix: material.record.prefix,
      expiresAt: material.record.expiresAt,
    };

    return { account, material };
  }

  async authenticate(plaintext, options = {}) {
    this.assertAvailable();
    const secretHash = hashSecret(plaintext);
    const [rows] = await this.pool.query(
      'SELECT * FROM enterprise_service_accounts WHERE secretHash = ? AND status = "ACTIVE"',
      [secretHash]
    );
    if (rows.length === 0) return null;
    const row = rows[0];

    const scopes = typeof row.scopes === 'string' ? JSON.parse(row.scopes) : (row.scopes || []);
    const keyRecord = {
      id: row.keyId,
      serviceAccountId: row.id,
      tenantId: row.tenantId,
      workspaceId: row.workspaceId || null,
      prefix: row.keyPrefix,
      secretHash: row.secretHash,
      scopes,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    };

    if (!verifyApiKeyRecord(keyRecord, plaintext, options)) return null;

    // Update last used timestamp
    this.pool.query('UPDATE enterprise_service_accounts SET lastUsedAt = CURRENT_TIMESTAMP WHERE id = ?', [row.id]).catch(() => {});

    const account = {
      id: row.id,
      tenantId: row.tenantId,
      workspaceId: row.workspaceId || null,
      displayName: row.displayName,
      status: row.status,
    };

    return { account, key: keyRecord };
  }

  async list({ tenantId, workspaceId = null }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const sql = workspaceId
      ? 'SELECT * FROM enterprise_service_accounts WHERE tenantId = ? AND workspaceId = ? AND status != "REVOKED" ORDER BY created_at DESC'
      : 'SELECT * FROM enterprise_service_accounts WHERE tenantId = ? AND status != "REVOKED" ORDER BY created_at DESC';
    const params = workspaceId ? [tenantId, workspaceId] : [tenantId];
    const [rows] = await this.pool.query(sql, params);

    return rows.map(r => ({
      id: r.id,
      tenantId: r.tenantId,
      workspaceId: r.workspaceId || null,
      displayName: r.displayName,
      status: r.status,
      scopes: typeof r.scopes === 'string' ? JSON.parse(r.scopes) : (r.scopes || []),
      apiKeyId: r.keyId,
      apiKeyPrefix: r.keyPrefix,
      expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    }));
  }

  async revoke({ tenantId, serviceAccountId }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    serviceAccountId = assertUuid(serviceAccountId, 'Service account identifier');
    await this.pool.query(
      'UPDATE enterprise_service_accounts SET status = "REVOKED", updated_at = CURRENT_TIMESTAMP WHERE tenantId = ? AND id = ?',
      [tenantId, serviceAccountId]
    );
    return { success: true };
  }
}

module.exports = {
  MySqlServiceAccountStore,
};
