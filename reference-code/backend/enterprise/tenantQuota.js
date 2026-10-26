'use strict';

const { tenantRateLimitKey } = require('./tenantCache');

const SAFE_METRIC = /^[A-Za-z0-9._:-]{1,80}$/;

class TenantQuotaGuard {
  constructor({ store }) {
    if (!store || typeof store.increment !== 'function') {
      throw Object.assign(new Error('A durable atomic quota store is required'), {
        code: 'TENANT_QUOTA_STORE_REQUIRED',
        status: 503,
      });
    }
    this.store = store;
  }

  async consume({ context, metric, limit, windowMs, principalScoped = true }) {
    const tenantId = String(context?.tenantId || '');
    const principalId = principalScoped
      ? String(context?.subjectId || context?.principalId || '')
      : 'tenant-wide';
    const normalizedMetric = String(metric || '');
    const normalizedLimit = Number(limit);
    const normalizedWindowMs = Number(windowMs);

    if (!tenantId || !principalId) {
      throw Object.assign(new Error('Tenant and principal context are required'), {
        code: 'TENANT_CONTEXT_REQUIRED',
        status: 400,
      });
    }
    if (!SAFE_METRIC.test(normalizedMetric)) {
      throw Object.assign(new Error('Invalid quota metric'), { code: 'INVALID_QUOTA_METRIC', status: 400 });
    }
    if (!Number.isSafeInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 10_000_000) {
      throw Object.assign(new Error('Invalid quota limit'), { code: 'INVALID_QUOTA_LIMIT', status: 400 });
    }
    if (!Number.isSafeInteger(normalizedWindowMs) || normalizedWindowMs < 1_000 || normalizedWindowMs > 31 * 24 * 60 * 60 * 1000) {
      throw Object.assign(new Error('Invalid quota window'), { code: 'INVALID_QUOTA_WINDOW', status: 400 });
    }

    const key = tenantRateLimitKey({
      tenantId,
      principalId,
      operation: normalizedMetric,
      window: String(normalizedWindowMs),
    });
    const result = await this.store.increment(key, { ttlMs: normalizedWindowMs });
    const used = Number(result?.count || 0);
    const resetsAt = Number(result?.expiresAt || 0);
    if (!Number.isSafeInteger(used) || used < 1 || !Number.isFinite(resetsAt)) {
      throw Object.assign(new Error('Quota store returned an invalid counter result'), {
        code: 'TENANT_QUOTA_STORE_INVALID_RESPONSE',
        status: 503,
      });
    }
    if (used > normalizedLimit) {
      const error = new Error('Tenant quota exceeded');
      error.code = 'TENANT_QUOTA_EXCEEDED';
      error.status = 429;
      error.limit = normalizedLimit;
      error.used = used;
      error.remaining = 0;
      error.resetsAt = resetsAt;
      error.retryAfterMs = Math.max(0, resetsAt - Date.now());
      throw error;
    }
    return {
      tenantId,
      metric: normalizedMetric,
      limit: normalizedLimit,
      used,
      remaining: Math.max(0, normalizedLimit - used),
      resetsAt,
      scope: principalScoped ? 'PRINCIPAL' : 'TENANT',
    };
  }
}

module.exports = { TenantQuotaGuard };
