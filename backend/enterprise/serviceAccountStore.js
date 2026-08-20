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
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    const id = crypto.randomUUID();
    const material = createApiKeyMaterial({ tenantId, workspaceId, serviceAccountId: id, scopes, now });
    const account = {
      id,
      tenantId,
      workspaceId,
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

class FirestoreServiceAccountStore {
  constructor({ db, admin }) {
    this.db = db;
    this.admin = admin;
  }

  assertAvailable() {
    if (!this.db || !this.admin?.firestore?.FieldValue) {
      throw Object.assign(new Error('Service account store is unavailable'), { code: 'SERVICE_ACCOUNT_STORE_UNAVAILABLE', status: 503 });
    }
  }

  async create({ tenantId, workspaceId, displayName, scopes, now = new Date() }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    workspaceId = assertUuid(workspaceId, 'Workspace identifier');
    const id = crypto.randomUUID();
    const material = createApiKeyMaterial({ tenantId, workspaceId, serviceAccountId: id, scopes, now });
    const account = {
      id,
      tenantId,
      workspaceId,
      displayName: normalizeName(displayName),
      status: 'ACTIVE',
      createdAt: new Date(now).toISOString(),
      scopes: [...material.record.scopes],
      apiKeyId: material.record.id,
      apiKeyPrefix: material.record.prefix,
      expiresAt: material.record.expiresAt,
    };
    const accountRef = this.db.collection('enterprise_service_accounts').doc(account.id);
    const keyRef = this.db.collection('enterprise_api_keys').doc(material.record.secretHash);
    await this.db.runTransaction(async transaction => {
      transaction.create(accountRef, { ...account, createdAt: this.admin.firestore.FieldValue.serverTimestamp(), updatedAt: this.admin.firestore.FieldValue.serverTimestamp() });
      transaction.create(keyRef, { ...material.record, createdAt: this.admin.firestore.FieldValue.serverTimestamp(), updatedAt: this.admin.firestore.FieldValue.serverTimestamp() });
    });
    return { account, material };
  }

  async authenticate(plaintext, options = {}) {
    this.assertAvailable();
    const keyRef = this.db.collection('enterprise_api_keys').doc(hashSecret(plaintext));
    const snapshot = await keyRef.get();
    if (!snapshot.exists) return null;
    const key = snapshot.data() || {};
    if (!verifyApiKeyRecord(key, plaintext, options)) return null;
    const accountSnapshot = await this.db.collection('enterprise_service_accounts').doc(key.serviceAccountId).get();
    if (!accountSnapshot.exists) return null;
    const account = accountSnapshot.data() || {};
    if (account.status !== 'ACTIVE' || account.tenantId !== key.tenantId || account.workspaceId !== key.workspaceId) return null;
    return { account: { ...account, id: accountSnapshot.id }, key: { ...key, id: snapshot.id } };
  }

  async list({ tenantId, workspaceId = null }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    let query = this.db.collection('enterprise_service_accounts').where('tenantId', '==', tenantId);
    if (workspaceId) query = query.where('workspaceId', '==', assertUuid(workspaceId, 'Workspace identifier'));
    const snapshot = await query.get();
    const rows = snapshot.docs
      .map(document => ({ ...document.data(), id: document.id }))
      .filter(account => String(account.status || '').toUpperCase() !== 'REVOKED');
    return rows.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  }

  async revoke(serviceAccountId, { tenantId, workspaceId = null }) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    serviceAccountId = assertUuid(serviceAccountId, 'Service account identifier');
    const reference = this.db.collection('enterprise_service_accounts').doc(serviceAccountId);
    const snapshot = await reference.get();
    if (!snapshot.exists) return false;
    const account = snapshot.data() || {};
    if (account.tenantId !== tenantId || String(account.status || '').toUpperCase() === 'REVOKED') return false;
    if (workspaceId && account.workspaceId !== workspaceId) return false;
    await reference.update({ status: 'REVOKED', revokedAt: this.admin.firestore.FieldValue.serverTimestamp(), updatedAt: this.admin.firestore.FieldValue.serverTimestamp() });
    return true;
  }

  async rotate(serviceAccountId, { tenantId, workspaceId = null, now = new Date() } = {}) {
    this.assertAvailable();
    tenantId = assertUuid(tenantId, 'Tenant identifier');
    serviceAccountId = assertUuid(serviceAccountId, 'Service account identifier');
    const accountRef = this.db.collection('enterprise_service_accounts').doc(serviceAccountId);
    const snapshot = await accountRef.get();
    if (!snapshot.exists) return null;
    const account = snapshot.data() || {};
    if (account.tenantId !== tenantId || String(account.status || '').toUpperCase() !== 'ACTIVE') return null;
    if (workspaceId && account.workspaceId !== workspaceId) return null;
    // Mark all live key records for this account as rotated inside a
    // transaction, then create the replacement key. A crash between the two
    // leaves the account with zero valid keys (fail closed), never two.
    const keysSnapshot = await this.db.collection('enterprise_api_keys')
      .where('serviceAccountId', '==', serviceAccountId)
      .where('status', '==', 'ACTIVE')
      .get();
    const material = createApiKeyMaterial({
      tenantId: account.tenantId,
      workspaceId: account.workspaceId,
      serviceAccountId: account.id,
      scopes: Array.isArray(account.scopes) ? account.scopes : [],
      now,
    });
    const serverNow = this.admin.firestore.FieldValue.serverTimestamp();
    await this.db.runTransaction(async transaction => {
      for (const document of keysSnapshot.docs) {
        transaction.update(document.ref, { status: 'ROTATED', rotatedAt: serverNow, updatedAt: serverNow });
      }
      transaction.create(this.db.collection('enterprise_api_keys').doc(material.record.secretHash), {
        ...material.record,
        createdAt: serverNow,
        updatedAt: serverNow,
      });
      transaction.update(accountRef, {
        apiKeyId: material.record.id,
        apiKeyPrefix: material.record.prefix,
        expiresAt: material.record.expiresAt,
        rotatedAt: serverNow,
        updatedAt: serverNow,
      });
    });
    return { account: { ...account, id: accountRef.id, apiKeyId: material.record.id, apiKeyPrefix: material.record.prefix, expiresAt: material.record.expiresAt }, material };
  }
}

module.exports = {
  FirestoreServiceAccountStore,
  InMemoryServiceAccountStore,
  normalizeName,
};
