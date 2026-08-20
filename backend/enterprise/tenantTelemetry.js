'use strict';

const { tenantContextAuditProjection } = require('./tenantContext');

function compact(value, max = 160) {
  return Array.from(String(value || ''), character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? '' : character;
  }).join('').trim().slice(0, max);
}

function buildTenantTelemetry(context, { event, operation, status = 'OK', durationMs = null, resource = null, errorCode = null, traceId = null } = {}) {
  if (!context) throw new Error('Tenant context is required for telemetry');
  return Object.freeze({
    ...tenantContextAuditProjection(context),
    event: compact(event, 100),
    operation: compact(operation, 120),
    status: compact(status, 40),
    durationMs: Number.isFinite(Number(durationMs)) ? Math.max(0, Number(durationMs)) : null,
    resourceType: resource?.type ? compact(resource.type, 80) : null,
    resourceId: resource?.id ? compact(resource.id, 180) : null,
    errorCode: errorCode ? compact(errorCode, 100) : null,
    traceId: traceId ? compact(traceId, 160) : context.correlationId,
  });
}

function tenantMetricLabels(context, { operation, outcome }) {
  if (!context) throw new Error('Tenant context is required for metrics');
  // Keep high-cardinality identifiers out of broad metrics; secure logs/audit retain IDs.
  return Object.freeze({
    isolationTier: context.isolationTier,
    dataPlaneType: context.dataPlane.type,
    region: context.dataPlane.region,
    operation: compact(operation, 100),
    outcome: compact(outcome, 40),
  });
}

module.exports = {
  buildTenantTelemetry,
  tenantMetricLabels,
};
