'use strict';

const crypto = require('crypto');
const { assertStorageContext, parseTenantObjectKey } = require('./tenantStorage');

const PURPOSES = new Set(['DOWNLOAD', 'UPLOAD', 'RENDER', 'EXPORT']);

function requireSigningSecret(secret) {
  if (!secret || Buffer.byteLength(String(secret)) < 32) throw Object.assign(new Error('Tenant artifact signing secret is unavailable'), { code: 'TENANT_ARTIFACT_SIGNING_UNAVAILABLE', status: 503 });
  return String(secret);
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decode(value) {
  try { return JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8')); } catch { return null; }
}

function signature(payload, secret) {
  return crypto.createHmac('sha256', requireSigningSecret(secret)).update(payload).digest('base64url');
}

function createTenantArtifactToken({ context, objectKey, purpose = 'DOWNLOAD', expiresInMs = 60_000, signingSecret, now = Date.now() }) {
  const parsed = assertStorageContext(context, objectKey);
  const normalizedPurpose = String(purpose).toUpperCase();
  if (!PURPOSES.has(normalizedPurpose) || !Number.isInteger(expiresInMs) || expiresInMs < 1_000 || expiresInMs > 15 * 60_000) {
    throw Object.assign(new Error('Tenant artifact token request is invalid'), { code: 'INVALID_TENANT_ARTIFACT_TOKEN', status: 400 });
  }
  const claims = {
    version: 1,
    tenantId: parsed.tenantId,
    workspaceId: parsed.workspaceId,
    objectKey,
    purpose: normalizedPurpose,
    exp: now + expiresInMs,
    nonce: crypto.randomBytes(16).toString('base64url'),
  };
  const payload = encode(claims);
  return `${payload}.${signature(payload, signingSecret)}`;
}

function verifyTenantArtifactToken({ context, token, purpose, signingSecret, now = Date.now() }) {
  const [payload, supplied] = String(token || '').split('.');
  if (!payload || !supplied) throw Object.assign(new Error('Tenant artifact token is invalid'), { code: 'INVALID_TENANT_ARTIFACT_TOKEN', status: 403 });
  const expected = Buffer.from(signature(payload, signingSecret));
  const received = Buffer.from(supplied);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) throw Object.assign(new Error('Tenant artifact token signature is invalid'), { code: 'INVALID_TENANT_ARTIFACT_TOKEN', status: 403 });
  const claims = decode(payload);
  if (!claims || claims.version !== 1 || !PURPOSES.has(claims.purpose) || claims.exp <= now || (purpose && claims.purpose !== String(purpose).toUpperCase())) {
    throw Object.assign(new Error('Tenant artifact token is expired or invalid'), { code: 'INVALID_TENANT_ARTIFACT_TOKEN', status: 403 });
  }
  const parsed = parseTenantObjectKey(claims.objectKey);
  if (!parsed || parsed.tenantId !== claims.tenantId || parsed.workspaceId !== claims.workspaceId || parsed.tenantId !== context?.tenantId || parsed.workspaceId !== context?.workspaceId) {
    throw Object.assign(new Error('Tenant artifact is unavailable in the active context'), { code: 'TENANT_ARTIFACT_NOT_FOUND', status: 404 });
  }
  return Object.freeze(claims);
}

module.exports = {
  PURPOSES,
  createTenantArtifactToken,
  verifyTenantArtifactToken,
};
