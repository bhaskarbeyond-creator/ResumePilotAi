'use strict';

const crypto = require('crypto');
const { assertUuid } = require('./tenantContext');

const API_KEY_PREFIX = 'rpa_';
const SCOPE_PATTERN = /^[a-z][a-z0-9_.-]{1,100}$/;

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

function normalizeScopes(scopes) {
  const result = [...new Set((Array.isArray(scopes) ? scopes : []).map(scope => String(scope).trim()).filter(scope => SCOPE_PATTERN.test(scope)))];
  if (!result.length) throw Object.assign(new Error('At least one API key scope is required'), { code: 'INVALID_API_KEY_SCOPE', status: 400 });
  return result;
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
  createApiKeyMaterial,
  hashSecret,
  normalizeScopes,
  verifyApiKeyRecord,
};
