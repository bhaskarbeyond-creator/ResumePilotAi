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
    const account = {
      id: crypto.randomUUID(),
      tenantId,
      workspaceId,
      displayName: normalizeName(displayName),
      status: 'ACTIVE',
      createdAt: new Date(now).toISOString(),
    };
    const material = createApiKeyMaterial({ tenantId, workspaceId, serviceAccountId: account.id, scopes, now });
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
    const account = {
      id: crypto.randomUUID(),
      tenantId,
      workspaceId,
      displayName: normalizeName(displayName),
      status: 'ACTIVE',
      createdAt: new Date(now).toISOString(),
    };
    const material = createApiKeyMaterial({ tenantId, workspaceId, serviceAccountId: account.id, scopes, now });
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
}

module.exports = {
  FirestoreServiceAccountStore,
  InMemoryServiceAccountStore,
  normalizeName,
};
