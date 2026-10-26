'use strict';

const crypto = require('crypto');
const { assertIdentityIssuer, assertPrincipalId, assertUuid } = require('./tenantContext');
const { resolveTenantInfrastructure } = require('./tenantRouting');

const JOB_TYPES = new Set([
  'AI_GENERATE', 'EXPORT_PDF', 'EXPORT_DOCX', 'NOTIFY', 'TENANT_EXPORT',
  'TENANT_DELETE', 'RAG_INGEST', 'RAG_DELETE', 'MIGRATION_RECONCILE'
]);
const RESOURCE_TYPES = new Set([
  'RESUME', 'COVER', 'PORTFOLIO', 'INTERVIEW', 'TENANT', 'FILE', 'MIGRATION'
]);

function compact(value, max = 180) {
  return Array.from(String(value || ''), character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? '' : character;
  }).join('').trim().slice(0, max);
}

function canonicalPayload(envelope) {
  return JSON.stringify({
    schemaVersion: envelope.schemaVersion,
    jobId: envelope.jobId,
    jobType: envelope.jobType,
    tenantId: envelope.tenantId,
    workspaceId: envelope.workspaceId,
    dataPlaneId: envelope.dataPlaneId,
    routingVersion: envelope.routingVersion,
    cacheProfile: envelope.cacheProfile,
    queueProfile: envelope.queueProfile,
    storageProfile: envelope.storageProfile,
    aiProfile: envelope.aiProfile,
    actorType: envelope.actorType,
    principalId: envelope.principalId,
    subjectId: envelope.subjectId,
    identityIssuer: envelope.identityIssuer,
    resource: envelope.resource,
    policyVersion: envelope.policyVersion,
    idempotencyKey: envelope.idempotencyKey,
    correlationId: envelope.correlationId,
    classification: envelope.classification,
    submittedAt: envelope.submittedAt,
  });
}

function signPayload(payload, secret) {
  if (!secret || Buffer.byteLength(String(secret)) < 32) {
    const error = new Error('Tenant job signing secret is unavailable');
    error.code = 'TENANT_JOB_SIGNING_UNAVAILABLE';
    error.status = 503;
    throw error;
  }
  return crypto.createHmac('sha256', String(secret)).update(payload).digest('base64url');
}

function createTenantJobEnvelope({ context, jobType, resource, idempotencyKey, classification = 'PRIVATE', now = new Date(), signingSecret }) {
  const normalizedJobType = String(jobType || '').toUpperCase();
  const resourceType = String(resource?.type || '').toUpperCase();
  if (!JOB_TYPES.has(normalizedJobType) || !RESOURCE_TYPES.has(resourceType)) {
    throw Object.assign(new Error('Unsupported tenant job type or resource'), { code: 'INVALID_TENANT_JOB', status: 400 });
  }
  const route = resolveTenantInfrastructure(context);
  const envelope = {
    schemaVersion: 1,
    jobId: crypto.randomUUID(),
    jobType: normalizedJobType,
    tenantId: assertUuid(context?.tenantId, 'Tenant identifier'),
    workspaceId: context?.workspaceId ? assertUuid(context.workspaceId, 'Workspace identifier') : null,
    dataPlaneId: compact(route.dataPlaneId, 120),
    routingVersion: route.routingVersion,
    cacheProfile: route.cacheProfile,
    queueProfile: route.queueProfile,
    storageProfile: route.storageProfile,
    aiProfile: route.aiProfile,
    actorType: context?.actorType === 'service' ? 'service' : 'user',
    principalId: assertPrincipalId(context?.principalId),
    subjectId: context?.subjectId ? assertPrincipalId(context.subjectId) : null,
    identityIssuer: assertIdentityIssuer(context?.identityIssuer || (context?.actorType === 'service' ? 'service' : 'firebase')),
    resource: {
      type: resourceType,
      id: compact(resource?.id, 160),
      revision: Number(resource?.revision || 0),
    },
    policyVersion: Number(context?.policyVersion || 0),
    idempotencyKey: compact(idempotencyKey, 160),
    correlationId: compact(context?.correlationId || context?.requestId, 160),
    classification: String(classification || 'PRIVATE').toUpperCase(),
    submittedAt: new Date(now).toISOString(),
  };
  if (!envelope.dataPlaneId || !envelope.idempotencyKey || !envelope.resource.id || !envelope.correlationId) {
    throw Object.assign(new Error('Tenant job envelope is incomplete'), { code: 'INVALID_TENANT_JOB', status: 400 });
  }
  return Object.freeze({ ...envelope, signature: signPayload(canonicalPayload(envelope), signingSecret) });
}

function validateTenantJobEnvelope(envelope, signingSecret, { now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  if (!envelope || Number(envelope.schemaVersion) !== 1 || !JOB_TYPES.has(String(envelope.jobType || '').toUpperCase())) {
    throw Object.assign(new Error('Tenant job envelope is invalid'), { code: 'INVALID_TENANT_JOB', status: 400 });
  }
  const unsigned = { ...envelope };
  const suppliedSignature = unsigned.signature;
  delete unsigned.signature;
  const expected = signPayload(canonicalPayload(unsigned), signingSecret);
  const supplied = Buffer.from(String(suppliedSignature || ''));
  const actual = Buffer.from(expected);
  if (supplied.length !== actual.length || !crypto.timingSafeEqual(supplied, actual)) {
    throw Object.assign(new Error('Tenant job signature is invalid'), { code: 'INVALID_TENANT_JOB_SIGNATURE', status: 403 });
  }
  assertUuid(unsigned.tenantId, 'Tenant identifier');
  if (unsigned.workspaceId) assertUuid(unsigned.workspaceId, 'Workspace identifier');
  for (const field of ['dataPlaneId', 'cacheProfile', 'queueProfile', 'storageProfile', 'aiProfile']) {
    if (!compact(unsigned[field], 120)) throw Object.assign(new Error(`Tenant job ${field} is required`), { code: 'INVALID_TENANT_JOB', status: 400 });
  }
  if (!Number.isInteger(Number(unsigned.routingVersion)) || Number(unsigned.routingVersion) < 1) {
    throw Object.assign(new Error('Tenant job routing version is invalid'), { code: 'INVALID_TENANT_JOB', status: 400 });
  }
  assertPrincipalId(unsigned.principalId);
  if (unsigned.actorType === 'user' && !unsigned.subjectId) {
    throw Object.assign(new Error('Tenant job user subject is required for reauthorization'), { code: 'INVALID_TENANT_JOB', status: 400 });
  }
  if (unsigned.subjectId) assertPrincipalId(unsigned.subjectId);
  assertIdentityIssuer(unsigned.identityIssuer);
  if (!RESOURCE_TYPES.has(String(unsigned.resource?.type || '').toUpperCase()) || !compact(unsigned.resource?.id)) {
    throw Object.assign(new Error('Tenant job resource is invalid'), { code: 'INVALID_TENANT_JOB', status: 400 });
  }
  const submittedAt = new Date(unsigned.submittedAt).getTime();
  if (!Number.isFinite(submittedAt) || submittedAt > now + 60_000 || now - submittedAt > maxAgeMs) {
    throw Object.assign(new Error('Tenant job is expired'), { code: 'EXPIRED_TENANT_JOB', status: 409 });
  }
  return Object.freeze({ ...unsigned, signature: suppliedSignature });
}

module.exports = {
  JOB_TYPES,
  RESOURCE_TYPES,
  canonicalPayload,
  createTenantJobEnvelope,
  validateTenantJobEnvelope,
};
