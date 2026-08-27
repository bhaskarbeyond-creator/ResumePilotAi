'use strict';

const crypto = require('crypto');
const { assertUuid } = require('./tenantContext');
const { isEncryptedEnvelope } = require('./encryptionProvider');

const RESOURCE_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{2,80}$/;
const CLASSIFICATIONS = new Set(['PRIVATE', 'CONFIDENTIAL', 'INTERNAL', 'PUBLIC']);

function normalizedResourceType(value) {
  const type = String(value || '').toUpperCase();
  if (!RESOURCE_TYPE_PATTERN.test(type)) throw Object.assign(new Error('Resource type is invalid'), { code: 'INVALID_TENANT_RESOURCE', status: 400 });
  return type;
}

function normalizedClassification(value) {
  const classification = String(value || 'PRIVATE').toUpperCase();
  if (!CLASSIFICATIONS.has(classification)) throw Object.assign(new Error('Resource classification is invalid'), { code: 'INVALID_TENANT_RESOURCE', status: 400 });
  return classification;
}

function safePayload(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Resource payload must be an object'), { code: 'INVALID_TENANT_RESOURCE', status: 400 });
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > 100_000) throw Object.assign(new Error('Resource payload is too large'), { code: 'INVALID_TENANT_RESOURCE', status: 413 });
  return JSON.parse(serialized);
}

function requiresEncryption(classification) {
  return classification !== 'PUBLIC';
}

function assertResourceInScope(context, resource) {
  if (!resource || String(context.tenantId) !== String(resource.tenantId)) {
    const error = new Error('Resource is not available in the active tenant');
    error.code = 'TENANT_RESOURCE_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  if (context.workspaceScope !== 'TENANT' && resource.workspaceId && context.workspaceId && String(context.workspaceId) !== String(resource.workspaceId)) {
    const error = new Error('Resource is not available in the active workspace');
    error.code = 'WORKSPACE_RESOURCE_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  return true;
}

class MySqlEnterpriseRepository {
  constructor({ pool, encryptionProvider = null }) {
    if (!pool) {
      const { getPool } = require('../database/mysql');
      this.pool = getPool();
    } else {
      this.pool = pool;
    }
    this.encryptionProvider = encryptionProvider;
    this.providerName = 'mysql';
  }

  assertContext(context) {
    if (!context?.tenantId || !context?.principalId) {
      throw Object.assign(new Error('Verified tenant context is required for data-plane access'), { code: 'TENANT_CONTEXT_REQUIRED', status: 403 });
    }
    return context;
  }

  sealPayload(context, payload, classification) {
    if (!requiresEncryption(classification)) return { payload: safePayload(payload) };
    if (!this.encryptionProvider) {
      throw Object.assign(
        new Error('Enterprise resource encryption is required but no server-side key is configured (set ENTERPRISE_ENCRYPTION_KEYS)'),
        { code: 'ENTERPRISE_ENCRYPTION_UNAVAILABLE', status: 503 }
      );
    }
    return { payloadCipher: this.encryptionProvider.encryptValue(safePayload(payload)) };
  }

  openPayload(document) {
    const cipher = document.payloadCipher;
    if (!cipher) return document.payload || {};
    if (!isEncryptedEnvelope(cipher)) {
      throw Object.assign(new Error('Stored resource payload is not a valid encrypted envelope'), { code: 'ENTERPRISE_ENCRYPTION_CORRUPT', status: 500 });
    }
    if (!this.encryptionProvider) {
      throw Object.assign(
        new Error('Encrypted enterprise resource cannot be read because no server-side key is configured (set ENTERPRISE_ENCRYPTION_KEYS)'),
        { code: 'ENTERPRISE_ENCRYPTION_UNAVAILABLE', status: 503 }
      );
    }
    return this.encryptionProvider.decryptValue(cipher);
  }

  mapResource(row) {
    if (!row) return null;
    let dataObj = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
    let payload = {};
    if (dataObj.payloadCipher) {
      payload = this.openPayload(dataObj);
    } else {
      payload = dataObj.payload || dataObj;
    }
    return {
      id: row.id,
      tenantId: row.tenantId,
      workspaceId: row.workspaceId || null,
      resourceType: row.resourceType,
      ownerPrincipalId: row.created_by,
      classification: row.classification || 'PRIVATE',
      revision: Number(row.revision || 0),
      payload,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  }

  async ping() {
    const [rows] = await this.pool.query('SELECT 1 AS alive');
    return Boolean(rows[0]?.alive);
  }

  async createResource(context, { id = crypto.randomUUID(), resourceType, classification = 'PRIVATE', payload = {} }) {
    this.assertContext(context);
    if (!context.workspaceId) {
      throw Object.assign(new Error('A workspace context is required to create tenant resources'), { code: 'WORKSPACE_CONTEXT_REQUIRED', status: 400 });
    }
    id = assertUuid(id, 'Resource identifier');
    const type = normalizedResourceType(resourceType);
    const cls = normalizedClassification(classification);
    const sealed = this.sealPayload(context, payload, cls);

    const [existing] = await this.pool.query(
      'SELECT id FROM enterprise_resources WHERE tenantId = ? AND resourceType = ? AND id = ?',
      [context.tenantId, type, id]
    );
    if (existing.length > 0) {
      throw Object.assign(new Error('Resource already exists'), { code: 'RESOURCE_CONFLICT', status: 409 });
    }

    await this.pool.query(
      `INSERT INTO enterprise_resources (id, tenantId, workspaceId, resourceType, classification, data, revision, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, context.tenantId, context.workspaceId, type, cls, JSON.stringify(sealed), context.principalId, context.principalId]
    );

    return this.getResource(context, id);
  }

  async getResource(context, resourceId) {
    this.assertContext(context);
    resourceId = assertUuid(resourceId, 'Resource identifier');
    const [rows] = await this.pool.query(
      'SELECT * FROM enterprise_resources WHERE tenantId = ? AND id = ?',
      [context.tenantId, resourceId]
    );
    if (rows.length === 0) {
      throw Object.assign(new Error('Resource was not found in the active tenant'), { code: 'TENANT_RESOURCE_NOT_FOUND', status: 404 });
    }
    const resource = this.mapResource(rows[0]);
    assertResourceInScope(context, resource);
    return resource;
  }

  async listResources(context, { resourceType = null, limit = 50, cursor = null } = {}) {
    this.assertContext(context);
    const bounded = Math.max(1, Math.min(Number(limit) || 50, 200));
    let sql = 'SELECT * FROM enterprise_resources WHERE tenantId = ?';
    const params = [context.tenantId];

    if (context.workspaceScope !== 'TENANT' && context.workspaceId) {
      sql += ' AND workspaceId = ?';
      params.push(context.workspaceId);
    }
    if (resourceType) {
      sql += ' AND resourceType = ?';
      params.push(normalizedResourceType(resourceType));
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(bounded);

    const [rows] = await this.pool.query(sql, params);
    const items = rows.map(r => this.mapResource(r)).filter(r => {
      try {
        return assertResourceInScope(context, r);
      } catch {
        return false;
      }
    });
    return items;
  }

  async updateResource(context, resourceId, { payload = null, classification = null, expectedRevision = null } = {}) {
    this.assertContext(context);
    resourceId = assertUuid(resourceId, 'Resource identifier');
    const current = await this.getResource(context, resourceId);

    if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      throw Object.assign(new Error('Resource revision conflict'), { code: 'REVISION_CONFLICT', status: 409 });
    }

    const cls = classification ? normalizedClassification(classification) : current.classification;
    const nextPayload = payload !== null && payload !== undefined ? payload : current.payload;
    const sealed = this.sealPayload(context, nextPayload, cls);

    await this.pool.query(
      `UPDATE enterprise_resources
       SET data = ?, classification = ?, revision = revision + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenantId = ? AND id = ?`,
      [JSON.stringify(sealed), cls, context.principalId, context.tenantId, resourceId]
    );

    return this.getResource(context, resourceId);
  }

  async deleteResource(context, resourceId) {
    this.assertContext(context);
    resourceId = assertUuid(resourceId, 'Resource identifier');
    await this.getResource(context, resourceId);
    await this.pool.query('DELETE FROM enterprise_resources WHERE tenantId = ? AND id = ?', [context.tenantId, resourceId]);
    return { success: true };
  }

  async appendAuditEvent(context, event) {
    this.assertContext(context);
    const id = event?.id || crypto.randomUUID();
    const action = String(event.action || 'UNKNOWN');
    const category = String(event.category || 'tenant');
    const severity = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(event.severity || '').toUpperCase()) ? String(event.severity).toUpperCase() : 'INFO';
    const metadata = event.metadata ? JSON.stringify(event.metadata) : null;

    await this.pool.query(
      `INSERT INTO enterprise_audit_events (id, tenantId, workspaceId, actorPrincipalId, action, category, severity, resourceType, resourceId, metadata, occurredAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [id, context.tenantId, context.workspaceId || null, context.principalId, action, category, severity, event.resource?.type || null, event.resource?.id || null, metadata]
    );

    return { id, tenantId: context.tenantId, action, category, severity };
  }

  async listAuditEvents(context, { limit = 100, action = null, actor = null, outcome = null, severity = null, category = null, since = null, until = null, cursor = null } = {}) {
    this.assertContext(context);
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
    let sql = 'SELECT * FROM enterprise_audit_events WHERE tenantId = ?';
    const params = [context.tenantId];

    if (action) {
      sql += ' AND action LIKE ?';
      params.push(`%${String(action).toUpperCase()}%`);
    }
    if (category) {
      sql += ' AND category LIKE ?';
      params.push(`%${String(category).toLowerCase()}%`);
    }
    if (severity) {
      sql += ' AND severity = ?';
      params.push(String(severity).toUpperCase());
    }
    sql += ' ORDER BY occurredAt DESC LIMIT ?';
    params.push(boundedLimit);

    const [rows] = await this.pool.query(sql, params);
    const items = rows.map(r => ({
      ...r,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {}),
      occurredAt: r.occurredAt ? new Date(r.occurredAt).toISOString() : null,
    }));
    return items;
  }

  async recordAiUsage(context, usageEvent = {}) {
    this.assertContext(context);
    const id = crypto.randomUUID();
    const dayKey = usageEvent.dayKey || new Date().toISOString().slice(0, 10);
    const promptTokens = Number(usageEvent.promptTokens || 0);
    const completionTokens = Number(usageEvent.completionTokens || 0);
    const totalTokens = promptTokens + completionTokens;

    await this.pool.query(
      `INSERT INTO enterprise_ai_usage (id, tenantId, workspaceId, principalId, dayKey, model, promptTokens, completionTokens, totalTokens, costEstimate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, context.tenantId, context.workspaceId || null, context.principalId, dayKey, usageEvent.model || 'default', promptTokens, completionTokens, totalTokens, Number(usageEvent.costEstimate || 0)]
    );

    return { id, totalTokens, dayKey };
  }

  async getAiUsageSummary(context, { days = 30 } = {}) {
    this.assertContext(context);
    const boundedDays = Math.max(1, Math.min(Number(days) || 30, 365));
    const [rows] = await this.pool.query(
      `SELECT dayKey, SUM(promptTokens) as promptTokens, SUM(completionTokens) as completionTokens, SUM(totalTokens) as totalTokens, COUNT(*) as requestCount
       FROM enterprise_ai_usage
       WHERE tenantId = ? AND recordedAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY dayKey
       ORDER BY dayKey DESC`,
      [context.tenantId, boundedDays]
    );
    return rows;
  }

  async listAiUsageEvents(context, { limit = 100 } = {}) {
    this.assertContext(context);
    const bounded = Math.max(1, Math.min(Number(limit) || 100, 500));
    const [rows] = await this.pool.query(
      'SELECT * FROM enterprise_ai_usage WHERE tenantId = ? ORDER BY recordedAt DESC LIMIT ?',
      [context.tenantId, bounded]
    );
    return rows;
  }
}

module.exports = {
  MySqlEnterpriseRepository,
  normalizedClassification,
  normalizedResourceType,
  safePayload,
};
