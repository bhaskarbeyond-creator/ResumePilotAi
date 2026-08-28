'use strict';

const crypto = require('node:crypto');
const { assertUuid } = require('../../enterprise/tenantContext');
const {
  normalizedClassification,
  normalizedResourceType,
  safePayload,
} = require('../../enterprise/mysqlEnterpriseRepository');

function resourceKey(tenantId, id) { return `${tenantId}:${id}`; }

class InMemoryEnterpriseRepository {
  constructor({ encryptionProvider = null, resources = null, auditEvents = null, usageEvents = null } = {}) {
    this.encryptionProvider = encryptionProvider;
    this.providerName = 'test-memory-mariadb-contract';
    this.resources = resources || new Map();
    this.auditEvents = auditEvents || [];
    this.usageEvents = usageEvents || new Map();
  }

  assertContext(context) {
    if (!context?.tenantId || !context?.principalId) throw Object.assign(new Error('Verified tenant context is required'), { code: 'TENANT_CONTEXT_REQUIRED', status: 403 });
    return context;
  }

  seal(payload, classification) {
    const safe = safePayload(payload);
    if (classification === 'PUBLIC') return { payload: safe };
    if (!this.encryptionProvider) throw Object.assign(new Error('Enterprise resource encryption is unavailable'), { code: 'ENTERPRISE_ENCRYPTION_UNAVAILABLE', status: 503 });
    return { payloadCipher: this.encryptionProvider.encryptValue(safe) };
  }

  open(row) {
    return row.payloadCipher ? this.encryptionProvider.decryptValue(row.payloadCipher) : structuredClone(row.payload || {});
  }

  project(row) {
    return {
      id: row.id, tenantId: row.tenantId, workspaceId: row.workspaceId,
      resourceType: row.resourceType, ownerPrincipalId: row.ownerPrincipalId,
      classification: row.classification, revision: row.revision,
      payload: this.open(row), createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
  }

  assertInScope(context, row) {
    if (!row || row.tenantId !== context.tenantId) throw Object.assign(new Error('Resource was not found in the active tenant'), { code: 'TENANT_RESOURCE_NOT_FOUND', status: 404 });
    if (context.workspaceScope !== 'TENANT' && context.workspaceId && row.workspaceId !== context.workspaceId) {
      throw Object.assign(new Error('Resource was not found in the active workspace'), { code: 'WORKSPACE_RESOURCE_NOT_FOUND', status: 404 });
    }
  }

  async createResource(context, { id = crypto.randomUUID(), resourceType, classification = 'PRIVATE', payload = {} }) {
    this.assertContext(context);
    if (!context.workspaceId) throw Object.assign(new Error('A workspace context is required'), { code: 'WORKSPACE_CONTEXT_REQUIRED', status: 400 });
    id = assertUuid(id, 'Resource identifier');
    const key = resourceKey(context.tenantId, id);
    if (this.resources.has(key)) throw Object.assign(new Error('Resource already exists'), { code: 'RESOURCE_CONFLICT', status: 409 });
    const cls = normalizedClassification(classification);
    const now = new Date().toISOString();
    const row = {
      id, tenantId: context.tenantId, workspaceId: context.workspaceId,
      resourceType: normalizedResourceType(resourceType), ownerPrincipalId: context.principalId,
      classification: cls, revision: 1, createdAt: now, updatedAt: now,
      ...this.seal(payload, cls),
    };
    this.resources.set(key, row);
    await this.appendAuditEvent(context, {
      action: 'RESOURCE_CREATED', category: 'tenant.resource', severity: 'INFO',
      resource: { type: row.resourceType, id: row.id },
      metadata: { revision: row.revision, classification: row.classification },
    });
    return this.project(row);
  }

  async getResource(context, id) {
    this.assertContext(context);
    id = assertUuid(id, 'Resource identifier');
    const row = this.resources.get(resourceKey(context.tenantId, id));
    this.assertInScope(context, row);
    return this.project(row);
  }

  async listResources(context, { resourceType = null, limit = 50 } = {}) {
    this.assertContext(context);
    const type = resourceType ? normalizedResourceType(resourceType) : null;
    return [...this.resources.values()]
      .filter(row => row.tenantId === context.tenantId && (!type || row.resourceType === type)
        && (context.workspaceScope === 'TENANT' || !context.workspaceId || row.workspaceId === context.workspaceId))
      .slice(0, Math.max(1, Math.min(Number(limit) || 50, 200)))
      .map(row => this.project(row));
  }

  async updateResource(context, id, { payload = null, classification = null, expectedRevision = null } = {}) {
    const current = await this.getResource(context, id);
    const key = resourceKey(context.tenantId, id);
    const persisted = this.resources.get(key);
    if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== persisted?.revision) {
      throw Object.assign(new Error('Resource revision conflict'), { code: 'REVISION_CONFLICT', status: 409 });
    }
    const cls = classification ? normalizedClassification(classification) : current.classification;
    const row = {
      ...persisted, classification: cls,
      revision: persisted.revision + 1, updatedAt: new Date().toISOString(),
      ...this.seal(payload === null || payload === undefined ? current.payload : payload, cls),
    };
    delete row.payload;
    delete row.payloadCipher;
    Object.assign(row, this.seal(payload === null || payload === undefined ? current.payload : payload, cls));
    this.resources.set(key, row);
    await this.appendAuditEvent(context, {
      action: 'RESOURCE_UPDATED', category: 'tenant.resource', severity: 'INFO',
      resource: { type: row.resourceType, id: row.id },
      metadata: { revision: row.revision, classification: row.classification },
    });
    return this.project(row);
  }

  async deleteResource(context, id) {
    const current = await this.getResource(context, id);
    this.resources.delete(resourceKey(context.tenantId, id));
    await this.appendAuditEvent(context, {
      action: 'RESOURCE_DELETED', category: 'tenant.resource', severity: 'HIGH',
      resource: { type: current.resourceType, id: current.id }, metadata: { revision: current.revision },
    });
    return { success: true };
  }

  auditEventDocument(context, event = {}) {
    this.assertContext(context);
    return {
      id: event.id || crypto.randomUUID(), tenantId: context.tenantId,
      workspaceId: context.workspaceId || null, actorPrincipalId: context.principalId,
      principalId: context.principalId, identityIssuer: event.identityIssuer || context.identityIssuer || null,
      action: String(event.action || 'UNKNOWN'), category: String(event.category || 'tenant'),
      severity: String(event.severity || 'INFO').toUpperCase(),
      outcome: String(event.outcome || 'SUCCESS').toUpperCase(),
      actorType: event.actorType || context.actorType || 'user',
      subjectId: event.subjectId || context.subjectId || null,
      actorSubjectId: event.subjectId || context.subjectId || null,
      requestId: event.requestId || context.requestId || null,
      correlationId: event.correlationId || context.correlationId || null,
      resource: event.resource || null, metadata: structuredClone(event.metadata || {}),
      occurredAt: event.occurredAt || new Date().toISOString(),
    };
  }

  async appendAuditEvent(context, event) {
    const row = this.auditEventDocument(context, event);
    if (!this.auditEvents.some(existing => existing.id === row.id && existing.tenantId === row.tenantId)) this.auditEvents.push(row);
    return structuredClone(row);
  }

  async listAuditEvents(context, { limit = 100, action = null, actor = null, outcome = null, severity = null, category = null, since = null, until = null, cursor = null } = {}) {
    this.assertContext(context);
    const bounded = Math.max(1, Math.min(Number(limit) || 100, 250));
    let cursorValue = null;
    if (cursor) {
      try { cursorValue = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8')); } catch { cursorValue = null; }
      if (!cursorValue?.id || !Number.isFinite(Date.parse(cursorValue.occurredAt))) {
        throw Object.assign(new Error('Audit cursor is invalid'), { code: 'INVALID_TENANT_AUDIT_CURSOR', status: 400 });
      }
    }
    const rows = this.auditEvents
      .filter(row => row.tenantId === context.tenantId
        && (!action || row.action.includes(String(action).toUpperCase()))
        && (!actor || row.subjectId === String(actor) || row.actorPrincipalId === String(actor))
        && (!outcome || row.outcome === String(outcome).toUpperCase())
        && (!severity || row.severity === String(severity).toUpperCase())
        && (!category || row.category.includes(String(category).toLowerCase()))
        && (!since || Date.parse(row.occurredAt) >= Date.parse(since))
        && (!until || Date.parse(row.occurredAt) <= Date.parse(until))
        && (!cursorValue || Date.parse(row.occurredAt) < Date.parse(cursorValue.occurredAt)
          || (Date.parse(row.occurredAt) === Date.parse(cursorValue.occurredAt) && row.id < cursorValue.id)))
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id.localeCompare(a.id));
    const items = rows.slice(0, bounded).map(row => structuredClone(row));
    if (rows.length > bounded && items.length) {
      const last = items.at(-1);
      Object.defineProperty(items, 'nextCursor', { value: Buffer.from(JSON.stringify({ occurredAt: last.occurredAt, id: last.id })).toString('base64url'), enumerable: false });
    }
    return items;
  }

  async recordAiUsage(context, event = {}) {
    this.assertContext(context);
    const eventSource = String(event.idempotencyKey || context.correlationId || crypto.randomUUID());
    const id = crypto.createHash('sha256').update(`${context.tenantId}\0${eventSource}`).digest('hex');
    if (this.usageEvents.has(id)) return { ...structuredClone(this.usageEvents.get(id)), outcome: 'DUPLICATE_IGNORED' };
    const bounded = value => Math.max(0, Math.round(Number(value) || 0));
    const createdAt = new Date(event.now || Date.now()).toISOString();
    const row = {
      id, tenantId: context.tenantId, workspaceId: context.workspaceId || null,
      principalId: context.principalId, provider: String(event.provider || 'unknown'),
      model: String(event.model || 'default'), operation: String(event.operation || 'unknown'),
      inputTokens: bounded(event.inputTokens), outputTokens: bounded(event.outputTokens),
      estimatedCostMicros: bounded(event.estimatedCostMicros), correlationId: context.correlationId || null,
      dayKey: createdAt.slice(0, 10), createdAt, outcome: 'RECORDED',
    };
    this.usageEvents.set(id, row);
    return structuredClone(row);
  }

  async listAiUsageEvents(context, { limit = 100 } = {}) {
    this.assertContext(context);
    return [...this.usageEvents.values()].filter(row => row.tenantId === context.tenantId)
      .slice(-Math.max(1, Math.min(Number(limit) || 100, 500))).reverse().map(row => structuredClone(row));
  }

  async getAiUsageSummary(context, { days = 30 } = {}) {
    this.assertContext(context);
    const boundedDays = Math.max(1, Math.min(Number(days) || 30, 366));
    const cutoff = Date.now() - (boundedDays - 1) * 86_400_000;
    const rows = [...this.usageEvents.values()].filter(row => row.tenantId === context.tenantId && Date.parse(`${row.dayKey}T23:59:59.999Z`) >= cutoff);
    const summary = { tenantId: context.tenantId, days: boundedDays, requests: 0, inputTokens: 0, outputTokens: 0, estimatedCostMicros: 0, byDay: [], byWorkspace: {}, byUser: {}, byProvider: {}, byModel: {} };
    const daysMap = new Map();
    for (const row of rows) {
      summary.requests += 1; summary.inputTokens += row.inputTokens; summary.outputTokens += row.outputTokens; summary.estimatedCostMicros += row.estimatedCostMicros;
      const day = daysMap.get(row.dayKey) || { day: row.dayKey, requests: 0, inputTokens: 0, outputTokens: 0, estimatedCostMicros: 0 };
      day.requests += 1; day.inputTokens += row.inputTokens; day.outputTokens += row.outputTokens; day.estimatedCostMicros += row.estimatedCostMicros; daysMap.set(row.dayKey, day);
      const aggregate = (bucket, key) => { const slot = bucket[key] || (bucket[key] = { requests: 0, inputTokens: 0, outputTokens: 0 }); slot.requests += 1; slot.inputTokens += row.inputTokens; slot.outputTokens += row.outputTokens; };
      aggregate(summary.byWorkspace, row.workspaceId || 'unassigned'); aggregate(summary.byUser, row.principalId);
      summary.byProvider[row.provider] = (summary.byProvider[row.provider] || 0) + 1;
      summary.byModel[row.model] = (summary.byModel[row.model] || 0) + 1;
    }
    summary.byDay = [...daysMap.values()].sort((a, b) => a.day.localeCompare(b.day));
    return summary;
  }

  async ping() { return { ok: true, provider: this.providerName, durable: false, testDouble: true }; }
}

module.exports = { InMemoryEnterpriseRepository };
