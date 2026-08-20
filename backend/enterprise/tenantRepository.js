'use strict';

const crypto = require('crypto');
const { assertSameTenant } = require('./tenantPolicy');
const { assertUuid } = require('./tenantContext');

const RESOURCE_TYPE = /^[A-Z][A-Z0-9_]{2,80}$/;
const CLASSIFICATIONS = new Set(['PRIVATE', 'CONFIDENTIAL', 'INTERNAL', 'PUBLIC']);

function normalizedResourceType(value) {
  const type = String(value || '').toUpperCase();
  if (!RESOURCE_TYPE.test(type)) throw Object.assign(new Error('Resource type is invalid'), { code: 'INVALID_TENANT_RESOURCE', status: 400 });
  return type;
}

function normalizedClassification(value) {
  const classification = String(value || 'PRIVATE').toUpperCase();
  if (!CLASSIFICATIONS.has(classification)) throw Object.assign(new Error('Resource classification is invalid'), { code: 'INVALID_TENANT_RESOURCE', status: 400 });
  return classification;
}

function safePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > 100_000) throw Object.assign(new Error('Resource payload is too large'), { code: 'INVALID_TENANT_RESOURCE', status: 413 });
  return JSON.parse(serialized);
}

function mapResource(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    resourceType: row.resource_type,
    ownerPrincipalId: row.owner_principal_id,
    classification: row.classification,
    revision: Number(row.revision || 0),
    payload: row.payload || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createTenantResource(tx, context, { id = crypto.randomUUID(), resourceType, classification = 'PRIVATE', payload = {} }) {
  id = assertUuid(id, 'Resource identifier');
  const result = await tx.query(
    `INSERT INTO tenant_data.resources
      (id, tenant_id, workspace_id, resource_type, owner_principal_id, classification, revision, payload)
     VALUES ($1, $2, $3, $4, $5, $6, 1, $7::jsonb)
     RETURNING id, tenant_id, workspace_id, resource_type, owner_principal_id, classification, revision, payload, created_at, updated_at`,
    [id, context.tenantId, context.workspaceId, normalizedResourceType(resourceType), context.principalId, normalizedClassification(classification), JSON.stringify(safePayload(payload))]
  );
  return mapResource(result.rows?.[0]);
}

async function getTenantResource(tx, context, id) {
  id = assertUuid(id, 'Resource identifier');
  // There is intentionally no tenant predicate here: RLS is expected to enforce it.
  const result = await tx.query(
    `SELECT id, tenant_id, workspace_id, resource_type, owner_principal_id, classification, revision, payload, created_at, updated_at
       FROM tenant_data.resources WHERE id = $1`,
    [id]
  );
  const resource = mapResource(result.rows?.[0]);
  if (!resource) return null;
  assertSameTenant(context, resource);
  return resource;
}

async function listTenantResources(tx, context, { resourceType = null, limit = 50, cursor = null } = {}) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
  const values = [];
  const predicates = [];
  // RLS independently enforces the same tenant/workspace boundary. Keeping the
  // workspace predicate in the repository limits work before policy evaluation.
  if (context.workspaceScope !== 'TENANT' && context.workspaceId) {
    values.push(context.workspaceId);
    predicates.push(`workspace_id = $${values.length}`);
  }
  if (resourceType) {
    values.push(normalizedResourceType(resourceType));
    predicates.push(`resource_type = $${values.length}`);
  }
  if (cursor) {
    values.push(assertUuid(cursor, 'Resource cursor'));
    predicates.push(`id < $${values.length}`);
  }
  const where = predicates.length ? `WHERE ${predicates.join(' AND ')}` : '';
  values.push(boundedLimit);
  const result = await tx.query(
    `SELECT id, tenant_id, workspace_id, resource_type, owner_principal_id, classification, revision, payload, created_at, updated_at
       FROM tenant_data.resources ${where} ORDER BY id DESC LIMIT $${values.length}`,
    values
  );
  return (result.rows || []).map(mapResource);
}

async function updateTenantResource(tx, context, id, { expectedRevision, payload, classification }) {
  id = assertUuid(id, 'Resource identifier');
  const current = await getTenantResource(tx, context, id);
  if (!current) return null;
  if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) !== current.revision) {
    throw Object.assign(new Error('Resource changed after it was loaded'), { code: 'TENANT_RESOURCE_CONFLICT', status: 409 });
  }
  const result = await tx.query(
    `UPDATE tenant_data.resources
        SET payload = $1::jsonb,
            classification = $2,
            revision = revision + 1,
            updated_at = now()
      WHERE id = $3
      RETURNING id, tenant_id, workspace_id, resource_type, owner_principal_id, classification, revision, payload, created_at, updated_at`,
    [JSON.stringify(safePayload(payload === undefined ? current.payload : payload)), normalizedClassification(classification || current.classification), id]
  );
  return mapResource(result.rows?.[0]);
}

async function deleteTenantResource(tx, context, id) {
  id = assertUuid(id, 'Resource identifier');
  const current = await getTenantResource(tx, context, id);
  if (!current) return false;
  await tx.query('DELETE FROM tenant_data.resources WHERE id = $1', [id]);
  return true;
}

async function appendTenantAuditEvent(tx, context, { action, category, severity = 'INFO', outcome = 'SUCCESS', resource = null, metadata = {} }) {
  const id = crypto.randomUUID();
  const result = await tx.query(
    `INSERT INTO tenant_data.audit_events
      (id, tenant_id, workspace_id, principal_id, action, category, severity, resource_type, resource_id, correlation_id, outcome, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
     RETURNING id, tenant_id, workspace_id, principal_id, action, category, severity, resource_type, resource_id, correlation_id, outcome, metadata, occurred_at`,
    [id, context.tenantId, context.workspaceId, context.principalId, String(action).slice(0, 120), String(category).slice(0, 80), String(severity).slice(0, 20), resource?.type ? String(resource.type).slice(0, 80) : null, resource?.id ? assertUuid(resource.id, 'Audit resource identifier') : null, context.correlationId, String(outcome).slice(0, 20), JSON.stringify(safePayload(metadata))]
  );
  return result.rows?.[0] || null;
}

async function recordTenantAiUsage(tx, context, { provider, model, operation, inputTokens = 0, outputTokens = 0, estimatedCostMicros = 0 }) {
  const id = crypto.randomUUID();
  const result = await tx.query(
    `INSERT INTO tenant_data.ai_usage_ledger
      (id, tenant_id, workspace_id, principal_id, provider, model, operation, input_tokens, output_tokens, estimated_cost_micros, correlation_id, policy_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, tenant_id, workspace_id, principal_id, provider, model, operation, input_tokens, output_tokens, estimated_cost_micros, correlation_id, policy_version, created_at`,
    [id, context.tenantId, context.workspaceId, context.principalId, String(provider).slice(0, 80), String(model).slice(0, 160), String(operation).slice(0, 120), Math.max(0, Number(inputTokens) || 0), Math.max(0, Number(outputTokens) || 0), Math.max(0, Number(estimatedCostMicros) || 0), context.correlationId, context.policyVersion]
  );
  return result.rows?.[0] || null;
}

module.exports = {
  appendTenantAuditEvent,
  createTenantResource,
  deleteTenantResource,
  getTenantResource,
  listTenantResources,
  recordTenantAiUsage,
  updateTenantResource,
};
