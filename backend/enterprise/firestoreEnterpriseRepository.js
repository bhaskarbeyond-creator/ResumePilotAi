'use strict';

const crypto = require('crypto');
const { assertUuid } = require('./tenantContext');
const { isEncryptedEnvelope } = require('./encryptionProvider');

/**
 * Canonical Firestore enterprise data-plane repository.
 *
 * Data model (tenant-partitioned; a document path cannot cross tenants):
 *   tenants/{tenantId}/resources/{resourceId}
 *   tenants/{tenantId}/audit_events/{eventId}
 *   tenants/{tenantId}/ai_usage/{usageId}                  (append-only ledger)
 *   tenants/{tenantId}/ai_usage_daily/{yyyy-mm-dd}         (atomic rollup counters)
 *
 * Every method receives the verified server context and independently enforces
 * the tenant/workspace boundary — this replaces PostgreSQL row-level security:
 *   1. structural: all paths live under tenants/{context.tenantId}
 *   2. query-level: workspace predicates applied before data leaves the store
 *   3. read-level: assertResourceInScope re-verifies tenant + workspace on reads
 *
 * Payload confidentiality: resources classified other than PUBLIC are sealed
 * with the server-side encryption provider before persistence and fail closed
 * when no key is configured.
 */

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

function toIso(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return new Date(value.toMillis()).toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function requiresEncryption(classification) {
  return classification !== 'PUBLIC';
}

/**
 * Scope-aware authorization for a loaded resource. The tenant boundary is
 * absolute; the workspace boundary applies to workspace-scoped contexts
 * (TENANT_OWNER/TENANT_ADMIN operate tenant-wide by role).
 */
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

class FirestoreEnterpriseRepository {
  constructor({ db, admin, encryptionProvider = null }) {
    if (!db) throw Object.assign(new Error('Firestore enterprise repository requires a database handle'), { code: 'ENTERPRISE_DATA_PLANE_UNAVAILABLE', status: 503 });
    this.db = db;
    this.admin = admin;
    this.encryptionProvider = encryptionProvider;
    this.providerName = 'firestore';
  }

  assertContext(context) {
    if (!context?.tenantId || !context?.principalId) {
      throw Object.assign(new Error('Verified tenant context is required for data-plane access'), { code: 'TENANT_CONTEXT_REQUIRED', status: 403 });
    }
    return context;
  }

  tenantCollection(context, name) {
    this.assertContext(context);
    return this.db.collection(`tenants/${assertUuid(context.tenantId, 'Tenant identifier')}/${name}`);
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

  mapResource(document) {
    if (!document) return null;
    const resource = {
      id: document.id,
      tenantId: document.tenantId,
      workspaceId: document.workspaceId || null,
      resourceType: document.resourceType,
      ownerPrincipalId: document.ownerPrincipalId,
      classification: document.classification,
      revision: Number(document.revision || 0),
      payload: this.openPayload(document),
      createdAt: toIso(document.createdAt),
      updatedAt: toIso(document.updatedAt),
    };
    return resource;
  }

  auditEventDocument(context, { action, category, severity = 'INFO', outcome = 'SUCCESS', resource = null, metadata = {}, occurredAt = null }) {
    const compactText = (value, max) => Array.from(String(value || ''), character => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? '' : character;
    }).join('').trim().slice(0, max);
    return {
      id: crypto.randomUUID(),
      tenantId: context.tenantId,
      workspaceId: context.workspaceId || null,
      principalId: context.principalId,
      subjectId: context.subjectId || null,
      actorType: context.actorType || 'user',
      action: compactText(action, 120),
      category: compactText(category, 80),
      severity: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(severity || '').toUpperCase()) ? String(severity).toUpperCase() : 'INFO',
      outcome: ['SUCCESS', 'DENIED', 'FAILURE'].includes(String(outcome || '').toUpperCase()) ? String(outcome).toUpperCase() : 'FAILURE',
      resourceType: resource?.type ? compactText(resource.type, 80) : null,
      resourceId: resource?.id ? compactText(resource.id, 180) : null,
      correlationId: compactText(context.correlationId, 160),
      metadata: Object.fromEntries(Object.entries(metadata || {}).slice(0, 30).map(([key, value]) => [compactText(key, 60), compactText(value, 500)])),
      occurredAt: occurredAt || new Date().toISOString(),
    };
  }

  async appendAuditEvent(context, event) {
    this.assertContext(context);
    const document = event?.id ? event : this.auditEventDocument(context, event || {});
    await this.tenantCollection(context, 'audit_events').doc(document.id).create({
      ...document,
      createdAt: this.admin?.firestore?.FieldValue?.serverTimestamp?.() || new Date(),
    });
    return document;
  }

  async listAuditEvents(context, { limit = 100 } = {}) {
    this.assertContext(context);
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
    const snapshot = await this.tenantCollection(context, 'audit_events').orderBy('occurredAt', 'desc').limit(boundedLimit).get();
    return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
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
    const now = this.admin?.firestore?.FieldValue?.serverTimestamp?.() || new Date();
    const document = {
      id,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      resourceType: type,
      ownerPrincipalId: context.principalId,
      classification: cls,
      revision: 1,
      ...sealed,
      createdAt: now,
      updatedAt: now,
    };
    const audit = this.auditEventDocument(context, { action: 'RESOURCE_CREATED', category: 'resource.lifecycle', resource: { type, id }, metadata: { classification: cls } });
    await this.db.runTransaction(async transaction => {
      transaction.set(this.tenantCollection(context, 'resources').doc(id), document);
      transaction.set(this.tenantCollection(context, 'audit_events').doc(audit.id), { ...audit, createdAt: now });
    });
    return this.mapResource(document);
  }

  async getResource(context, resourceId) {
    this.assertContext(context);
    resourceId = assertUuid(resourceId, 'Resource identifier');
    const snapshot = await this.tenantCollection(context, 'resources').doc(resourceId).get();
    if (!snapshot.exists) return null;
    const resource = this.mapResource(snapshot.data());
    // Defense in depth: the partition already scopes by tenant; re-verify both
    // tenant and workspace against the verified context on every read.
    assertResourceInScope(context, resource);
    return resource;
  }

  applyWorkspaceScope(context, query) {
    if (context.workspaceScope !== 'TENANT' && context.workspaceId) {
      return query.where('workspaceId', '==', context.workspaceId);
    }
    return query;
  }

  async listResources(context, { resourceType = null, limit = 50, cursor = null } = {}) {
    this.assertContext(context);
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
    let query = this.applyWorkspaceScope(context, this.tenantCollection(context, 'resources'));
    if (resourceType) query = query.where('resourceType', '==', normalizedResourceType(resourceType));
    query = query.orderBy('id', 'desc');
    if (cursor) {
      const cursorSnapshot = await this.tenantCollection(context, 'resources').doc(assertUuid(cursor, 'Resource cursor')).get();
      if (cursorSnapshot.exists) query = query.startAfter(cursorSnapshot);
    }
    const snapshot = await query.limit(boundedLimit).get();
    return snapshot.docs
      .map(document => this.mapResource(document.data()))
      .filter(resource => {
        try { assertResourceInScope(context, resource); return true; } catch { return false; }
      });
  }

  async updateResource(context, resourceId, { expectedRevision, payload, classification }) {
    this.assertContext(context);
    resourceId = assertUuid(resourceId, 'Resource identifier');
    const reference = this.tenantCollection(context, 'resources').doc(resourceId);
    let updated = null;
    await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) { updated = null; return; }
      const current = this.mapResource(snapshot.data());
      assertResourceInScope(context, current);
      if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) !== current.revision) {
        throw Object.assign(new Error('Resource changed after it was loaded'), { code: 'TENANT_RESOURCE_CONFLICT', status: 409 });
      }
      const nextClassification = normalizedClassification(classification || current.classification);
      const nextPayload = payload === undefined ? current.payload : payload;
      const sealed = this.sealPayload(context, nextPayload, nextClassification);
      const now = this.admin?.firestore?.FieldValue?.serverTimestamp?.() || new Date();
      const nextRevision = current.revision + 1;
      const document = {
        id: current.id,
        tenantId: current.tenantId,
        workspaceId: current.workspaceId,
        resourceType: current.resourceType,
        ownerPrincipalId: current.ownerPrincipalId,
        classification: nextClassification,
        revision: nextRevision,
        ...sealed,
        createdAt: snapshot.data().createdAt,
        updatedAt: now,
      };
      transaction.set(reference, document);
      const audit = this.auditEventDocument(context, { action: 'RESOURCE_UPDATED', category: 'resource.lifecycle', resource: { type: current.resourceType, id: current.id }, metadata: { revision: String(nextRevision) } });
      transaction.set(this.tenantCollection(context, 'audit_events').doc(audit.id), { ...audit, createdAt: now });
      updated = this.mapResource(document);
    });
    return updated;
  }

  async deleteResource(context, resourceId) {
    this.assertContext(context);
    resourceId = assertUuid(resourceId, 'Resource identifier');
    const reference = this.tenantCollection(context, 'resources').doc(resourceId);
    let deleted = false;
    await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) { deleted = false; return; }
      const current = this.mapResource(snapshot.data());
      assertResourceInScope(context, current);
      const now = this.admin?.firestore?.FieldValue?.serverTimestamp?.() || new Date();
      transaction.delete(reference);
      const audit = this.auditEventDocument(context, { action: 'RESOURCE_DELETED', category: 'resource.lifecycle', severity: 'HIGH', resource: { type: current.resourceType, id: current.id }, metadata: { revision: String(current.revision) } });
      transaction.set(this.tenantCollection(context, 'audit_events').doc(audit.id), { ...audit, createdAt: now });
      deleted = true;
    });
    return deleted;
  }

  usageDayKey(now = new Date()) {
    return new Date(now).toISOString().slice(0, 10);
  }

  usageLedgerId(context, idempotencyKey = null) {
    if (idempotencyKey) {
      const compactKey = String(idempotencyKey).slice(0, 160);
      return crypto.createHash('sha256').update(`${context.tenantId}\u0000${compactKey}`).digest('hex').slice(0, 32);
    }
    return crypto.randomUUID();
  }

  async recordAiUsage(context, { provider, model, operation, inputTokens = 0, outputTokens = 0, estimatedCostMicros = 0, idempotencyKey = null, now = new Date() }) {
    this.assertContext(context);
    const increment = this.admin?.firestore?.FieldValue?.increment;
    if (typeof increment !== 'function') {
      throw Object.assign(new Error('Enterprise usage accounting requires atomic field increments'), { code: 'ENTERPRISE_USAGE_UNAVAILABLE', status: 503 });
    }
    const ledgerId = this.usageLedgerId(context, idempotencyKey);
    const day = this.usageDayKey(now);
    const ledgerRef = this.tenantCollection(context, 'ai_usage').doc(ledgerId);
    const dailyRef = this.tenantCollection(context, 'ai_usage_daily').doc(day);
    const bounded = value => Math.max(0, Math.round(Number(value) || 0));
    const usage = {
      id: ledgerId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId || null,
      principalId: context.principalId,
      provider: String(provider || '').slice(0, 80),
      model: String(model || '').slice(0, 160),
      operation: String(operation || '').slice(0, 120),
      inputTokens: bounded(inputTokens),
      outputTokens: bounded(outputTokens),
      estimatedCostMicros: bounded(estimatedCostMicros),
      correlationId: String(context.correlationId || '').slice(0, 160),
      policyVersion: Number(context.policyVersion || 0),
      createdAt: new Date(now).toISOString(),
    };
    let outcome = 'RECORDED';
    await this.db.runTransaction(async transaction => {
      const existing = await transaction.get(ledgerRef);
      if (existing.exists) {
        // Duplicate delivery of the same usage event is idempotent and never
        // double-counts against tenant quota or billing aggregates.
        outcome = 'DUPLICATE_IGNORED';
        return;
      }
      transaction.create(ledgerRef, usage);
      transaction.set(dailyRef, {
        day,
        tenantId: context.tenantId,
        requests: increment(1),
        inputTokens: increment(usage.inputTokens),
        outputTokens: increment(usage.outputTokens),
        estimatedCostMicros: increment(usage.estimatedCostMicros),
        [`workspaces.${context.workspaceId || 'unassigned'}.requests`]: increment(1),
        [`workspaces.${context.workspaceId || 'unassigned'}.inputTokens`]: increment(usage.inputTokens),
        [`workspaces.${context.workspaceId || 'unassigned'}.outputTokens`]: increment(usage.outputTokens),
        [`providers.${usage.provider || 'unknown'}.requests`]: increment(1),
        [`models.${usage.model || 'unknown'}.requests`]: increment(1),
        updatedAt: this.admin?.firestore?.FieldValue?.serverTimestamp?.() || new Date(),
      }, { merge: true });
    });
    return { ...usage, outcome };
  }

  async getAiUsageSummary(context, { days = 30 } = {}) {
    this.assertContext(context);
    const boundedDays = Math.max(1, Math.min(Number(days) || 30, 366));
    const summary = {
      tenantId: context.tenantId,
      days: boundedDays,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostMicros: 0,
      byDay: [],
      byWorkspace: {},
      byProvider: {},
      byModel: {},
    };
    const collection = this.tenantCollection(context, 'ai_usage_daily');
    const since = this.usageDayKey(new Date(Date.now() - (boundedDays - 1) * 24 * 60 * 60 * 1000));
    const snapshot = await collection.get();
    for (const document of snapshot.docs) {
      const data = document.data() || {};
      if (String(data.day || document.id) < since) continue;
      summary.requests += Number(data.requests || 0);
      summary.inputTokens += Number(data.inputTokens || 0);
      summary.outputTokens += Number(data.outputTokens || 0);
      summary.estimatedCostMicros += Number(data.estimatedCostMicros || 0);
      summary.byDay.push({ day: data.day || document.id, requests: Number(data.requests || 0), inputTokens: Number(data.inputTokens || 0), outputTokens: Number(data.outputTokens || 0), estimatedCostMicros: Number(data.estimatedCostMicros || 0) });
      for (const [workspaceId, value] of Object.entries(data.workspaces || {})) {
        const slot = summary.byWorkspace[workspaceId] || (summary.byWorkspace[workspaceId] = { requests: 0, inputTokens: 0, outputTokens: 0 });
        slot.requests += Number(value.requests || 0);
        slot.inputTokens += Number(value.inputTokens || 0);
        slot.outputTokens += Number(value.outputTokens || 0);
      }
      for (const [provider, value] of Object.entries(data.providers || {})) {
        summary.byProvider[provider] = (summary.byProvider[provider] || 0) + Number(value.requests || 0);
      }
      for (const [model, value] of Object.entries(data.models || {})) {
        summary.byModel[model] = (summary.byModel[model] || 0) + Number(value.requests || 0);
      }
    }
    summary.byDay.sort((left, right) => String(left.day).localeCompare(String(right.day)));
    return summary;
  }

  async ping() {
    // A cheap partition-scoped write proves the data plane accepts writes.
    const probeId = crypto.randomUUID();
    await this.db.collection('enterprise_data_plane_probes').doc(probeId).create({ probeId, createdAt: this.admin?.firestore?.FieldValue?.serverTimestamp?.() || new Date() });
    await this.db.collection('enterprise_data_plane_probes').doc(probeId).delete();
    return { ok: true, provider: this.providerName, durable: true };
  }
}

module.exports = {
  FirestoreEnterpriseRepository,
  normalizedClassification,
  normalizedResourceType,
  safePayload,
};
