'use strict';

const crypto = require('crypto');
const {
  DATA_PLANE_TYPES,
  ISOLATION_TIERS,
  MEMBERSHIP_STATES,
  TENANT_LIFECYCLE_STATES,
} = require('./constants');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRINCIPAL_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

function isUuid(value) {
  return UUID_PATTERN.test(String(value || ''));
}

function assertUuid(value, label) {
  if (!isUuid(value)) {
    const error = new Error(`${label} must be a UUID`);
    error.code = 'INVALID_TENANT_CONTEXT';
    error.status = 400;
    throw error;
  }
  return String(value).toLowerCase();
}

function assertPrincipalId(value) {
  const principalId = String(value || '');
  if (!PRINCIPAL_PATTERN.test(principalId)) {
    const error = new Error('Principal identifier is invalid');
    error.code = 'INVALID_PRINCIPAL';
    error.status = 400;
    throw error;
  }
  return principalId;
}

function normalizeRequestedTenantId(value) {
  if (value === undefined || value === null || value === '') return null;
  return assertUuid(value, 'Requested tenant identifier');
}

function normalizeRequestedWorkspaceId(value) {
  if (value === undefined || value === null || value === '') return null;
  return assertUuid(value, 'Requested workspace identifier');
}

function membershipIsActive(membership) {
  return String(membership?.status || '').toUpperCase() === 'ACTIVE';
}

function tenantIsUsable(tenant) {
  return String(tenant?.lifecycleState || '').toUpperCase() === 'ACTIVE';
}

function stablePrincipalHash(principalId) {
  return crypto.createHash('sha256').update(assertPrincipalId(principalId)).digest('hex').slice(0, 48);
}

// Firebase and external identity subjects are not guaranteed to be UUIDs. The
// enterprise data plane uses a stable UUID-shaped principal identifier derived
// from the verified issuer subject, while the original subject remains an identity
// link / audit attribute outside tenant resource tables.
function canonicalPrincipalId(principalId) {
  const digest = crypto.createHash('sha256').update(assertPrincipalId(principalId)).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function freezeContext(input) {
  const tenantId = assertUuid(input.tenantId, 'Tenant identifier');
  const workspaceId = input.workspaceId ? assertUuid(input.workspaceId, 'Workspace identifier') : null;
  const principalId = assertPrincipalId(input.principalId);
  const tenant = input.tenant || {};
  const membership = input.membership || {};
  const dataPlane = input.dataPlane || {};

  if (!tenantIsUsable(tenant)) {
    const error = new Error('Tenant is not active');
    error.code = 'TENANT_INACTIVE';
    error.status = 403;
    throw error;
  }
  if (!membershipIsActive(membership)) {
    const error = new Error('Tenant membership is not active');
    error.code = 'TENANT_MEMBERSHIP_INACTIVE';
    error.status = 403;
    throw error;
  }

  const isolationTier = String(tenant.isolationTier || 'STANDARD').toUpperCase();
  const dataPlaneType = String(dataPlane.type || tenant.dataPlaneType || 'SHARED_POSTGRES').toUpperCase();
  if (!ISOLATION_TIERS.includes(isolationTier) || !DATA_PLANE_TYPES.includes(dataPlaneType)) {
    const error = new Error('Tenant data-plane configuration is invalid');
    error.code = 'TENANT_ROUTE_INVALID';
    error.status = 503;
    throw error;
  }

  return Object.freeze({
    requestId: String(input.requestId || crypto.randomUUID()),
    correlationId: String(input.correlationId || input.requestId || crypto.randomUUID()),
    principalId,
    subjectId: input.subjectId ? assertPrincipalId(input.subjectId) : principalId,
    actorType: input.actorType === 'service' ? 'service' : 'user',
    tenantId,
    workspaceId,
    membershipId: String(membership.id || ''),
    membershipRevision: Number(membership.revision || 0),
    roles: Object.freeze([...(Array.isArray(membership.roles) ? membership.roles : [])]),
    permissions: Object.freeze([...(Array.isArray(input.permissions) ? input.permissions : [])]),
    policyVersion: Number(tenant.policyVersion || 1),
    // Workspace scope is derived by the server policy layer, never accepted from the browser.
    workspaceScope: input.workspaceScope === 'TENANT' ? 'TENANT' : 'WORKSPACE',
    lifecycleState: String(tenant.lifecycleState || 'ACTIVE').toUpperCase(),
    isolationTier,
    dataPlane: Object.freeze({
      id: String(dataPlane.id || tenant.dataPlaneId || 'shared-primary'),
      type: dataPlaneType,
      region: String(dataPlane.region || tenant.region || 'default'),
      routingVersion: Number(dataPlane.routingVersion || tenant.routingVersion || 1),
      storageProfile: String(dataPlane.storageProfile || tenant.storageProfile || 'shared'),
      cacheProfile: String(dataPlane.cacheProfile || tenant.cacheProfile || 'shared'),
      queueProfile: String(dataPlane.queueProfile || tenant.queueProfile || 'shared'),
      aiProfile: String(dataPlane.aiProfile || tenant.aiProfile || 'platform-default'),
      securityProfile: String(dataPlane.securityProfile || tenant.securityProfile || 'standard'),
    }),
  });
}

function tenantContextAuditProjection(context) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    principalId: context.principalId,
    subjectId: context.subjectId,
    actorType: context.actorType,
    requestId: context.requestId,
    correlationId: context.correlationId,
    policyVersion: context.policyVersion,
    workspaceScope: context.workspaceScope,
    dataPlaneId: context.dataPlane.id,
    dataPlaneType: context.dataPlane.type,
    routingVersion: context.dataPlane.routingVersion,
  };
}

module.exports = {
  UUID_PATTERN,
  assertPrincipalId,
  assertUuid,
  canonicalPrincipalId,
  freezeContext,
  isUuid,
  membershipIsActive,
  normalizeRequestedTenantId,
  normalizeRequestedWorkspaceId,
  stablePrincipalHash,
  tenantContextAuditProjection,
  tenantIsUsable,
};
