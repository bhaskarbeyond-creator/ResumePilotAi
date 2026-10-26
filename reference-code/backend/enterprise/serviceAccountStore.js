'use strict';

const crypto = require('crypto');
const { createApiKeyMaterial, hashSecret, verifyApiKeyRecord } = require('./serviceIdentity');
const { assertUuid } = require('./tenantContext');

const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,99}$/u;

function normalizeName(value) {
  const name = String(value || '').trim();
  if (!NAME_PATTERN.test(name)) {
    throw Object.assign(new Error('Service account name is invalid'), { code: 'INVALID_SERVICE_ACCOUNT', status: 400 });
  }
  return name;
}

class InMemoryServiceAccountStore {
  constructor() {
    this.accounts = new Map();
    this.keys = new Map();
  }

  async create({ tenantId, workspaceId, displayName, scopes, now = new Date() }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    // workspaceId null ⇒ tenant-scoped service account.
    workspaceId = workspaceId ? assertUuid(workspaceId, 'Workspace identifier') : null;
    const id = crypto.randomUUID();
    const material = createApiKeyMaterial({ tenantId, workspaceId, serviceAccountId: id, scopes, now });
    const account = {
      id,
      tenantId,
      workspaceId,
      scope: workspaceId ? 'WORKSPACE' : 'TENANT',
      displayName: normalizeName(displayName),
      status: 'ACTIVE',
      createdAt: new Date(now).toISOString(),
      scopes: [...material.record.scopes],
      apiKeyId: material.record.id,
      apiKeyPrefix: material.record.prefix,
      expiresAt: material.record.expiresAt,
    };
    this.accounts.set(account.id, account);
    this.keys.set(material.record.secretHash, material.record);
    return { account, material };
  }

  async authenticate(plaintext, options = {}) {
    const key = this.keys.get(hashSecret(plaintext));
    if (!key || !verifyApiKeyRecord(key, plaintext, options)) return null;
    const account = this.accounts.get(key.serviceAccountId);
    if (!account || account.status !== 'ACTIVE') return null;
    return { account, key };
  }

  async list({ tenantId, workspaceId = null }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    const rows = [];
    for (const account of this.accounts.values()) {
      if (account.tenantId !== tenantId || account.status === 'REVOKED') continue;
      if (workspaceId && account.workspaceId !== workspaceId) continue;
      rows.push({ ...account });
    }
    return rows.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  }

  async revoke(serviceAccountId, { tenantId, workspaceId = null }) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    serviceAccountId = assertUuid(serviceAccountId, 'Service account identifier');
    const account = this.accounts.get(serviceAccountId);
    if (!account || account.tenantId !== tenantId || account.status === 'REVOKED') return false;
    if (workspaceId && account.workspaceId !== workspaceId) return false;
    this.accounts.set(account.id, { ...account, status: 'REVOKED', revokedAt: new Date().toISOString() });
    return true;
  }

  async rotate(serviceAccountId, { tenantId, workspaceId = null, now = new Date() } = {}) {
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    serviceAccountId = assertUuid(serviceAccountId, 'Service account identifier');
    const account = this.accounts.get(serviceAccountId);
    if (!account || account.tenantId !== tenantId || account.status !== 'ACTIVE') return null;
    if (workspaceId && account.workspaceId !== workspaceId) return null;
    // Invalidate every previously issued key for this account, then issue
    // fresh key material. The previous secret stops authenticating immediately.
    for (const [hash, key] of this.keys.entries()) {
      if (key.serviceAccountId === serviceAccountId && key.status === 'ACTIVE') {
        this.keys.set(hash, { ...key, status: 'ROTATED', rotatedAt: new Date(now).toISOString() });
      }
    }
    const material = createApiKeyMaterial({
      tenantId: account.tenantId,
      workspaceId: account.workspaceId,
      serviceAccountId: account.id,
      scopes: account.scopes,
      now,
    });
    const rotatedAccount = {
      ...account,
      apiKeyId: material.record.id,
      apiKeyPrefix: material.record.prefix,
      expiresAt: material.record.expiresAt,
      rotatedAt: new Date(now).toISOString(),
    };
    this.accounts.set(account.id, rotatedAccount);
    this.keys.set(material.record.secretHash, material.record);
    return { account: { ...rotatedAccount }, material };
  }
}

module.exports = {
  InMemoryServiceAccountStore,
  normalizeName,
};
