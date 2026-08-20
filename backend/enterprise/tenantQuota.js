'use strict';

const { tenantRateLimitKey } = require('./tenantCache');

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
  InMemoryAtomicCounterStore,
  TenantQuotaGuard,
};
