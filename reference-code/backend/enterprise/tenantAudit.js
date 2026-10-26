'use strict';

const crypto = require('crypto');
const { tenantContextAuditProjection } = require('./tenantContext');

const AUDIT_ACTION = /^[A-Z][A-Z0-9_]{2,119}$/;
const AUDIT_CATEGORY = /^[a-z][a-z0-9_.-]{1,79}$/;

function compact(value, max) {
  return Array.from(String(value || ''), character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? '' : character;
  }).join('').trim().slice(0, max);
}

function buildTenantAuditEvent({ context, action, category, resource = null, severity = 'INFO', outcome = 'SUCCESS', metadata = {}, now = new Date() }) {
  if (!context) throw new Error('Tenant context is required for an audit event');
  const normalizedAction = String(action || '').toUpperCase();
  const normalizedCategory = String(category || '').toLowerCase();
  if (!AUDIT_ACTION.test(normalizedAction) || !AUDIT_CATEGORY.test(normalizedCategory)) {
    throw Object.assign(new Error('Tenant audit event is invalid'), { code: 'INVALID_TENANT_AUDIT' });
  }
  return Object.freeze({
    id: crypto.randomUUID(),
    ...tenantContextAuditProjection(context),
    action: normalizedAction,
    category: normalizedCategory,
    severity: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(severity).toUpperCase()) ? String(severity).toUpperCase() : 'INFO',
    outcome: ['SUCCESS', 'DENIED', 'FAILURE'].includes(String(outcome).toUpperCase()) ? String(outcome).toUpperCase() : 'FAILURE',
    resourceType: resource?.type ? compact(resource.type, 80) : null,
    resourceId: resource?.id ? compact(resource.id, 180) : null,
    metadata: Object.fromEntries(Object.entries(metadata || {}).slice(0, 30).map(([key, value]) => [compact(key, 60), compact(value, 500)])),
    occurredAt: new Date(now).toISOString(),
  });
}

async function writeTenantAuditEvent(repository, event) {
  if (!repository?.appendAuditEvent) {
    const error = new Error('Tenant audit store is unavailable');
    error.code = 'TENANT_AUDIT_UNAVAILABLE';
    error.status = 503;
    throw error;
  }
  await repository.appendAuditEvent({
    tenantId: event.tenantId,
    workspaceId: event.workspaceId || null,
    workspaceScope: event.workspaceScope || 'TENANT',
    principalId: event.principalId,
  }, event);
  return event;
}

module.exports = {
  buildTenantAuditEvent,
  writeTenantAuditEvent,
};
