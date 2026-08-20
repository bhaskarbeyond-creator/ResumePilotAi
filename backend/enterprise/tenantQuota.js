'use strict';

const crypto = require('crypto');
const { tenantRateLimitKey } = require('./tenantCache');

class FirestoreAtomicCounterStore {
  constructor({ db, admin, now = () => Date.now() }) {
    this.db = db;
    this.admin = admin;
    this.now = now;
  }

  assertAvailable() {
    if (!this.db || !this.admin?.firestore?.FieldValue) {
      throw Object.assign(new Error('Tenant quota store is unavailable'), { code: 'TENANT_QUOTA_UNAVAILABLE', status: 503 });
    }
  }

  async increment(key, { ttlMs }) {
    this.assertAvailable();
    const now = this.now();
    const id = crypto.createHash('sha256').update(String(key)).digest('hex');
    const reference = this.db.collection('enterprise_quota_buckets').doc(id);
    let result;
    await this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists ? snapshot.data() || {} : {};
      const currentExpiry = current.expiresAt?.toMillis?.() || new Date(current.expiresAt || 0).getTime();
      const active = Number(currentExpiry) > now;
      const count = active ? Number(current.count || 0) + 1 : 1;
      const expiresAt = active ? currentExpiry : now + ttlMs;
      transaction.set(reference, {
        keyHash: id,
        count,
        expiresAt: new Date(expiresAt),
        updatedAt: this.admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: false });
      result = { count, expiresAt };
    });
    return result;
  }
}

class InMemoryAtomicCounterStore {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.records = new Map();
  }

  async increment(key, { ttlMs }) {
    const now = this.now();
    let record = this.records.get(key);
    if (!record || record.expiresAt <= now) record = { count: 0, expiresAt: now + ttlMs };
    record.count += 1;
    this.records.set(key, record);
    return { count: record.count, expiresAt: record.expiresAt };
  }
}

class TenantQuotaGuard {
  constructor({ store, now = () => Date.now() }) {
    if (!store?.increment) throw new Error('Tenant quota guard requires an atomic shared counter store');
    this.store = store;
    this.now = now;
  }

  async consume({ context, metric, limit, windowMs, principalScoped = true }) {
    const boundedLimit = Number(limit);
    const boundedWindow = Number(windowMs);
    if (!Number.isInteger(boundedLimit) || boundedLimit < 1 || !Number.isInteger(boundedWindow) || boundedWindow < 1_000) {
      throw Object.assign(new Error('Tenant quota policy is invalid'), { code: 'INVALID_TENANT_QUOTA', status: 500 });
    }
    const window = `${metric}:${Math.floor(this.now() / boundedWindow)}`;
    const key = tenantRateLimitKey({
      tenantId: context.tenantId,
      principalId: principalScoped ? context.principalId : 'tenant',
      operation: metric,
      window,
    });
    const result = await this.store.increment(key, { ttlMs: boundedWindow });
    if (result.count > boundedLimit) {
      const error = new Error('Tenant quota exceeded');
      error.code = 'TENANT_QUOTA_EXCEEDED';
      error.status = 429;
      error.retryAfterSeconds = Math.max(1, Math.ceil((result.expiresAt - this.now()) / 1000));
      throw error;
    }
    return { key, limit: boundedLimit, used: result.count, remaining: Math.max(0, boundedLimit - result.count), expiresAt: result.expiresAt };
  }
}

module.exports = {
  FirestoreAtomicCounterStore,
  InMemoryAtomicCounterStore,
  TenantQuotaGuard,
};
