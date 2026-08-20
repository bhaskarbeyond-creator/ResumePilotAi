'use strict';

const crypto = require('crypto');
const { PERMISSIONS } = require('./constants');
const { assertUuid } = require('./tenantContext');

const API_KEY_PREFIX = 'rpa_';
const SCOPE_PATTERN = /^[a-z][a-z0-9_.-]{1,100}$/;

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

function normalizeScopes(scopes) {
  const result = [...new Set((Array.isArray(scopes) ? scopes : [])
    .map(scope => String(scope).trim())
    .filter(scope => SCOPE_PATTERN.test(scope) && PERMISSIONS.includes(scope)))];
  if (!result.length) throw Object.assign(new Error('At least one recognized API key scope is required'), { code: 'INVALID_API_KEY_SCOPE', status: 400 });
  return result;
}

// Break-glass scope governance. While a tenant keeps the default
// supportAccessRequiresApproval policy, break-glass grants are limited to
// read-only diagnostic scopes. Explicitly disabling that policy is the
// tenant's recorded decision to also allow repair (write) scopes.
const SUPPORT_DIAGNOSTIC_SCOPES = Object.freeze(['tenant.read', 'tenant.usage.read', 'tenant.audit.read', 'resource.read', 'workspace.read']);
const SUPPORT_REPAIR_SCOPES = Object.freeze(['resource.update', 'resource.create']);

function assertSupportScopes(scopes, { allowRepair = false } = {}) {
  const requested = normalizeScopes(scopes);
  const permitted = allowRepair
    ? [...SUPPORT_DIAGNOSTIC_SCOPES, ...SUPPORT_REPAIR_SCOPES]
    : SUPPORT_DIAGNOSTIC_SCOPES;
  const denied = requested.filter(scope => !permitted.includes(scope));
  if (denied.length) {
    const error = new Error(`Support grant scopes are not permitted under the tenant support policy: ${denied.join(', ')}`);
    error.code = 'SUPPORT_SCOPE_NOT_PERMITTED';
    error.status = 403;
    throw error;
  }
  return requested;
}

function createApiKeyMaterial({ tenantId, workspaceId = null, serviceAccountId, scopes, expiresAt = null, now = new Date() }) {
  assertUuid(tenantId, 'Tenant identifier');
  if (workspaceId) assertUuid(workspaceId, 'Workspace identifier');
  assertUuid(serviceAccountId, 'Service account identifier');
  const secret = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  const keyId = crypto.randomUUID();
  const expiry = expiresAt ? new Date(expiresAt) : null;
  if (expiry && (!Number.isFinite(expiry.getTime()) || expiry <= now)) throw Object.assign(new Error('API key expiry is invalid'), { code: 'INVALID_API_KEY_EXPIRY', status: 400 });
  return Object.freeze({
    plaintext: secret, // Return once to the caller; never log or persist this field.
    record: Object.freeze({
      id: keyId,
      tenantId,
      workspaceId,
      serviceAccountId,
      prefix: secret.slice(0, 12),
      secretHash: hashSecret(secret),
      scopes: normalizeScopes(scopes),
      expiresAt: expiry ? expiry.toISOString() : null,
      createdAt: new Date(now).toISOString(),
      status: 'ACTIVE',
    }),
  });
}

function verifyApiKeyRecord(record, plaintext, { now = new Date() } = {}) {
  if (!record || record.status !== 'ACTIVE' || !String(plaintext || '').startsWith(API_KEY_PREFIX)) return false;
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= new Date(now).getTime()) return false;
  const expected = Buffer.from(String(record.secretHash || ''), 'hex');
  const actual = Buffer.from(hashSecret(plaintext), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = {
  API_KEY_PREFIX,
  SUPPORT_DIAGNOSTIC_SCOPES,
  SUPPORT_REPAIR_SCOPES,
  assertSupportScopes,
  createApiKeyMaterial,
  hashSecret,
  normalizeScopes,
  verifyApiKeyRecord,
};
