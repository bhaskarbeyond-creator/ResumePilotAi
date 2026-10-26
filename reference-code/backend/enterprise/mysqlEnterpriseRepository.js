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

function nonNegativeInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw Object.assign(new Error(`${label} must be a non-negative integer`), { code: 'INVALID_AI_USAGE_EVENT', status: 400 });
  }
  return parsed;
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
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      try {
        await connection.query(
          `INSERT INTO enterprise_resources (id, tenantId, workspaceId, resourceType, classification, data, revision, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [id, context.tenantId, context.workspaceId, type, cls, JSON.stringify(sealed), context.principalId, context.principalId]
        );
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          throw Object.assign(new Error('Resource already exists'), { code: 'RESOURCE_CONFLICT', status: 409 });
        }
        throw error;
      }
      await this.appendAuditEvent(context, {
        action: 'RESOURCE_CREATED', category: 'tenant.resource', severity: 'INFO',
        resource: { type, id }, metadata: { revision: 1, classification: cls },
      }, connection);
      const [rows] = await connection.query(
        'SELECT * FROM enterprise_resources WHERE tenantId = ? AND id = ? FOR UPDATE',
        [context.tenantId, id]
      );
      const resource = this.mapResource(rows[0]);
      assertResourceInScope(context, resource);
      await connection.commit();
      return resource;
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
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
    if (cursor !== null && cursor !== undefined && cursor !== '') {
      throw Object.assign(new Error('Resource pagination cursors are not supported by this endpoint'), {
        code: 'RESOURCE_CURSOR_UNSUPPORTED', status: 400,
      });
    }
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
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        'SELECT * FROM enterprise_resources WHERE tenantId = ? AND id = ? FOR UPDATE',
        [context.tenantId, resourceId]
      );
      if (!rows.length) throw Object.assign(new Error('Resource was not found in the active tenant'), { code: 'TENANT_RESOURCE_NOT_FOUND', status: 404 });
      const current = this.mapResource(rows[0]);
      assertResourceInScope(context, current);
      const revision = Number(current.revision);
      if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== revision) {
        throw Object.assign(new Error('Resource revision conflict'), { code: 'REVISION_CONFLICT', status: 409 });
      }
      const cls = classification ? normalizedClassification(classification) : current.classification;
      const nextPayload = payload !== null && payload !== undefined ? payload : current.payload;
      const sealed = this.sealPayload(context, nextPayload, cls);
      const [updated] = await connection.query(
        `UPDATE enterprise_resources
         SET data = ?, classification = ?, revision = revision + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE tenantId = ? AND id = ? AND revision = ?`,
        [JSON.stringify(sealed), cls, context.principalId, context.tenantId, resourceId, revision]
      );
      if (Number(updated.affectedRows || 0) !== 1) {
        throw Object.assign(new Error('Resource revision conflict'), { code: 'REVISION_CONFLICT', status: 409 });
      }
      await this.appendAuditEvent(context, {
        action: 'RESOURCE_UPDATED', category: 'tenant.resource', severity: 'INFO',
        resource: { type: current.resourceType, id: resourceId },
        metadata: { revision: revision + 1, classification: cls },
      }, connection);
      const [updatedRows] = await connection.query(
        'SELECT * FROM enterprise_resources WHERE tenantId = ? AND id = ? FOR UPDATE',
        [context.tenantId, resourceId]
      );
      const resource = this.mapResource(updatedRows[0]);
      await connection.commit();
      return resource;
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteResource(context, resourceId) {
    this.assertContext(context);
    resourceId = assertUuid(resourceId, 'Resource identifier');
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        'SELECT * FROM enterprise_resources WHERE tenantId = ? AND id = ? FOR UPDATE',
        [context.tenantId, resourceId]
      );
      if (!rows.length) throw Object.assign(new Error('Resource was not found in the active tenant'), { code: 'TENANT_RESOURCE_NOT_FOUND', status: 404 });
      const current = this.mapResource(rows[0]);
      assertResourceInScope(context, current);
      const [deleted] = await connection.query(
        'DELETE FROM enterprise_resources WHERE tenantId = ? AND id = ? AND revision = ?',
        [context.tenantId, resourceId, current.revision]
      );
      if (Number(deleted.affectedRows || 0) !== 1) {
        throw Object.assign(new Error('Resource revision conflict'), { code: 'REVISION_CONFLICT', status: 409 });
      }
      await this.appendAuditEvent(context, {
        action: 'RESOURCE_DELETED', category: 'tenant.resource', severity: 'HIGH',
        resource: { type: current.resourceType, id: resourceId }, metadata: { revision: current.revision },
      }, connection);
      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }

  async appendAuditEvent(context, event, executor = this.pool) {
    this.assertContext(context);
    const id = event?.id || crypto.randomUUID();
    const action = String(event.action || 'UNKNOWN');
    const category = String(event.category || 'tenant');
    const severity = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(event.severity || '').toUpperCase()) ? String(event.severity).toUpperCase() : 'INFO';
    const outcome = ['SUCCESS', 'DENIED', 'FAILURE'].includes(String(event.outcome || '').toUpperCase()) ? String(event.outcome).toUpperCase() : 'SUCCESS';
    const actorType = String(event.actorType || context.actorType || 'user').slice(0, 32);
    const subjectId = String(event.subjectId || context.subjectId || '').slice(0, 128) || null;
    const requestId = String(event.requestId || context.requestId || '').slice(0, 128) || null;
    const correlationId = String(event.correlationId || context.correlationId || '').slice(0, 128) || null;
    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();
    if (!Number.isFinite(occurredAt.getTime())) throw Object.assign(new Error('Audit event time is invalid'), { code: 'INVALID_TENANT_AUDIT', status: 400 });
    const metadata = event.metadata ? JSON.stringify(event.metadata) : null;

    await executor.query(
      `INSERT INTO enterprise_audit_events
       (id, tenantId, workspaceId, actorPrincipalId, action, category, severity, outcome,
        actorType, subjectId, requestId, correlationId, resourceType, resourceId, metadata, occurredAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, context.tenantId, context.workspaceId || null, context.principalId, action, category,
        severity, outcome, actorType, subjectId, requestId, correlationId,
        event.resource?.type || event.resourceType || null, event.resource?.id || event.resourceId || null,
        metadata, occurredAt]
    );

    return { id, tenantId: context.tenantId, action, category, severity, outcome, actorSubjectId: subjectId, occurredAt: occurredAt.toISOString() };
  }

  async listAuditEvents(context, { limit = 100, action = null, actor = null, outcome = null, severity = null, category = null, since = null, until = null, cursor = null } = {}) {
    this.assertContext(context);
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
    let sql = 'SELECT * FROM enterprise_audit_events WHERE tenantId = ?';
    const params = [context.tenantId];
    const appendTime = (value, label) => {
      if (!value) return null;
      const parsed = new Date(value);
      if (!Number.isFinite(parsed.getTime())) throw Object.assign(new Error(`Audit ${label} time is invalid`), { code: 'INVALID_TENANT_AUDIT_FILTER', status: 400 });
      return parsed;
    };

    if (action) { sql += ' AND action LIKE ?'; params.push(`%${String(action).toUpperCase()}%`); }
    if (actor) { sql += ' AND (subjectId = ? OR actorPrincipalId = ?)'; params.push(String(actor), String(actor)); }
    if (outcome) { sql += ' AND outcome = ?'; params.push(String(outcome).toUpperCase()); }
    if (category) { sql += ' AND category LIKE ?'; params.push(`%${String(category).toLowerCase()}%`); }
    if (severity) { sql += ' AND severity = ?'; params.push(String(severity).toUpperCase()); }
    const from = appendTime(since, 'start');
    const through = appendTime(until, 'end');
    if (from) { sql += ' AND occurredAt >= ?'; params.push(from); }
    if (through) { sql += ' AND occurredAt <= ?'; params.push(through); }
    if (cursor) {
      let decoded;
      try { decoded = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8')); } catch { decoded = null; }
      const cursorTime = decoded?.occurredAt ? new Date(decoded.occurredAt) : null;
      if (!decoded?.id || !cursorTime || !Number.isFinite(cursorTime.getTime())) {
        throw Object.assign(new Error('Audit cursor is invalid'), { code: 'INVALID_TENANT_AUDIT_CURSOR', status: 400 });
      }
      sql += ' AND (occurredAt < ? OR (occurredAt = ? AND id < ?))';
      params.push(cursorTime, cursorTime, String(decoded.id));
    }
    sql += ' ORDER BY occurredAt DESC, id DESC LIMIT ?';
    params.push(boundedLimit + 1);

    const [rows] = await this.pool.query(sql, params);
    const hasMore = rows.length > boundedLimit;
    const items = rows.slice(0, boundedLimit).map(r => ({
      ...r,
      principalId: r.actorPrincipalId,
      actorSubjectId: r.subjectId || null,
      identityIssuer: r.identityIssuer || (r.actorType === 'service' ? 'service' : 'firebase'),
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {}),
      occurredAt: r.occurredAt ? new Date(r.occurredAt).toISOString() : null,
    }));
    if (hasMore && items.length) {
      const last = items.at(-1);
      Object.defineProperty(items, 'nextCursor', { value: Buffer.from(JSON.stringify({ occurredAt: last.occurredAt, id: last.id })).toString('base64url'), enumerable: false });
    }
    return items;
  }

  async recordAiUsage(context, usageEvent = {}) {
    this.assertContext(context);
    const inputTokens = nonNegativeInteger(usageEvent.inputTokens ?? usageEvent.promptTokens, 'Input tokens', 4_294_967_295);
    const outputTokens = nonNegativeInteger(usageEvent.outputTokens ?? usageEvent.completionTokens, 'Output tokens', 4_294_967_295);
    const estimatedCostMicros = nonNegativeInteger(usageEvent.estimatedCostMicros, 'Estimated cost');
    const totalTokens = inputTokens + outputTokens;
    if (!Number.isSafeInteger(totalTokens) || totalTokens > 4_294_967_295) {
      throw Object.assign(new Error('Total tokens exceed the supported ledger range'), { code: 'INVALID_AI_USAGE_EVENT', status: 400 });
    }
    const eventSource = String(usageEvent.idempotencyKey || usageEvent.correlationId || context.correlationId || crypto.randomUUID()).slice(0, 300);
    const eventKey = crypto.createHash('sha256').update(`${context.tenantId}\u0000${eventSource}`).digest('hex');
    const id = eventKey;
    const now = usageEvent.now ? new Date(usageEvent.now) : new Date();
    if (!Number.isFinite(now.getTime())) throw Object.assign(new Error('Usage event time is invalid'), { code: 'INVALID_TENANT_USAGE', status: 400 });
    const dayKey = String(usageEvent.dayKey || now.toISOString().slice(0, 10));
    const provider = String(usageEvent.provider || 'unknown').slice(0, 80);
    const model = String(usageEvent.model || 'default').slice(0, 128);
    const operation = String(usageEvent.operation || 'unknown').slice(0, 120);
    const correlationId = String(usageEvent.correlationId || context.correlationId || '').slice(0, 160);
    const policyVersion = nonNegativeInteger(context.policyVersion, 'Policy version', 4_294_967_295);

    const [result] = await this.pool.query(
      `INSERT INTO enterprise_ai_usage
       (id, tenantId, workspaceId, principalId, dayKey, provider, model, operation,
        eventKey, correlationId, policyVersion, promptTokens, completionTokens,
        totalTokens, costEstimate, costMicros, recordedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = VALUES(id)`,
      [
        id, context.tenantId, context.workspaceId || null, context.principalId, dayKey,
        provider, model, operation, eventKey, correlationId, policyVersion,
        inputTokens, outputTokens, totalTokens, estimatedCostMicros / 1_000_000,
        estimatedCostMicros, now,
      ]
    );
    const usage = {
      id, tenantId: context.tenantId, workspaceId: context.workspaceId || null,
      principalId: context.principalId, provider, model, operation, inputTokens,
      outputTokens, estimatedCostMicros, totalTokens, dayKey,
    };
    if (Number(result.affectedRows || 0) === 1) return { ...usage, outcome: 'RECORDED' };

    const [rows] = await this.pool.query(
      `SELECT id, workspaceId, principalId, provider, model, operation, correlationId,
              policyVersion, promptTokens, completionTokens, totalTokens, costMicros
       FROM enterprise_ai_usage WHERE tenantId = ? AND eventKey = ?`,
      [context.tenantId, eventKey]
    );
    const existing = rows[0];
    const sameIntent = existing
      && existing.id === id
      && (existing.workspaceId || null) === (context.workspaceId || null)
      && existing.principalId === context.principalId
      && existing.provider === provider
      && existing.model === model
      && existing.operation === operation
      && String(existing.correlationId || '') === correlationId
      && Number(existing.policyVersion) === policyVersion
      && Number(existing.promptTokens) === inputTokens
      && Number(existing.completionTokens) === outputTokens
      && Number(existing.totalTokens) === totalTokens
      && Number(existing.costMicros) === estimatedCostMicros;
    if (!sameIntent) {
      throw Object.assign(new Error('AI usage idempotency key is already bound to a different ledger event'), {
        code: 'AI_USAGE_IDEMPOTENCY_CONFLICT', status: 409,
      });
    }
    return { ...usage, outcome: 'DUPLICATE_IGNORED' };
  }

  async getAiUsageSummary(context, { days = 30 } = {}) {
    this.assertContext(context);
    const boundedDays = Math.max(1, Math.min(Number(days) || 30, 366));
    const where = 'tenantId = ? AND recordedAt >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)';
    const params = [context.tenantId, boundedDays - 1];
    const [dayRows, workspaceRows, userRows, providerRows, modelRows] = await Promise.all([
      this.pool.query(`SELECT dayKey AS day, COUNT(*) AS requests, SUM(promptTokens) AS inputTokens, SUM(completionTokens) AS outputTokens, SUM(costMicros) AS estimatedCostMicros FROM enterprise_ai_usage WHERE ${where} GROUP BY dayKey ORDER BY dayKey ASC`, params).then(([rows]) => rows),
      this.pool.query(`SELECT COALESCE(workspaceId, 'unassigned') AS bucket, COUNT(*) AS requests, SUM(promptTokens) AS inputTokens, SUM(completionTokens) AS outputTokens FROM enterprise_ai_usage WHERE ${where} GROUP BY workspaceId`, params).then(([rows]) => rows),
      this.pool.query(`SELECT principalId AS bucket, COUNT(*) AS requests, SUM(promptTokens) AS inputTokens, SUM(completionTokens) AS outputTokens FROM enterprise_ai_usage WHERE ${where} GROUP BY principalId`, params).then(([rows]) => rows),
      this.pool.query(`SELECT COALESCE(provider, 'unknown') AS bucket, COUNT(*) AS requests FROM enterprise_ai_usage WHERE ${where} GROUP BY provider`, params).then(([rows]) => rows),
      this.pool.query(`SELECT COALESCE(model, 'unknown') AS bucket, COUNT(*) AS requests FROM enterprise_ai_usage WHERE ${where} GROUP BY model`, params).then(([rows]) => rows),
    ]);
    // The first query uses the same bounded parameters; keep it explicit to
    // prevent accidental interpolation of tenant identity into SQL.
    if (!Array.isArray(dayRows)) throw Object.assign(new Error('Usage summary is unavailable'), { code: 'ENTERPRISE_USAGE_UNAVAILABLE', status: 503 });
    const byDay = dayRows.map(row => ({
      day: row.day, requests: Number(row.requests || 0), inputTokens: Number(row.inputTokens || 0),
      outputTokens: Number(row.outputTokens || 0), estimatedCostMicros: Number(row.estimatedCostMicros || 0),
    }));
    const summary = {
      tenantId: context.tenantId, days: boundedDays,
      requests: byDay.reduce((sum, row) => sum + row.requests, 0),
      inputTokens: byDay.reduce((sum, row) => sum + row.inputTokens, 0),
      outputTokens: byDay.reduce((sum, row) => sum + row.outputTokens, 0),
      estimatedCostMicros: byDay.reduce((sum, row) => sum + row.estimatedCostMicros, 0),
      byDay, byWorkspace: {}, byUser: {}, byProvider: {}, byModel: {},
    };
    for (const row of workspaceRows) summary.byWorkspace[row.bucket] = { requests: Number(row.requests || 0), inputTokens: Number(row.inputTokens || 0), outputTokens: Number(row.outputTokens || 0) };
    for (const row of userRows) summary.byUser[row.bucket] = { requests: Number(row.requests || 0), inputTokens: Number(row.inputTokens || 0), outputTokens: Number(row.outputTokens || 0) };
    for (const row of providerRows) summary.byProvider[row.bucket] = Number(row.requests || 0);
    for (const row of modelRows) summary.byModel[row.bucket] = Number(row.requests || 0);
    return summary;
  }

  async listAiUsageEvents(context, { limit = 100 } = {}) {
    this.assertContext(context);
    const bounded = Math.max(1, Math.min(Number(limit) || 100, 500));
    const [rows] = await this.pool.query(
      'SELECT * FROM enterprise_ai_usage WHERE tenantId = ? ORDER BY recordedAt DESC LIMIT ?',
      [context.tenantId, bounded]
    );
    return rows.map(row => ({
      id: row.id, tenantId: row.tenantId, workspaceId: row.workspaceId || null,
      principalId: row.principalId, provider: row.provider || null, model: row.model || null,
      operation: row.operation || null, inputTokens: Number(row.promptTokens || 0),
      outputTokens: Number(row.completionTokens || 0), estimatedCostMicros: Number(row.costMicros || 0),
      correlationId: row.correlationId || null,
      createdAt: row.recordedAt ? new Date(row.recordedAt).toISOString() : null,
    }));
  }
}

module.exports = {
  MySqlEnterpriseRepository,
  normalizedClassification,
  normalizedResourceType,
  safePayload,
};
