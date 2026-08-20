'use strict';

/**
 * OPTIONAL Redis accelerator for the enterprise plane.
 *
 * Redis is a performance accelerator only. Correctness (quotas, rate limits
 * that gate security decisions, dedupe, leases, job state) lives in durable
 * Firestore stores (TenantQuotaGuard / enterprise outbox). When Redis is not
 * configured or not reachable, the application continues to operate correctly
 * and every status surface reports Redis honestly — it is never reported
 * healthy while unavailable.
 */

const Redis = require('ioredis');
const { tenantCacheKey, tenantRateLimitKey, tenantCachePrefix } = require('./tenantCache');

let redisClient = null;

function getRedisUrl() {
  return process.env.TENANT_REDIS_URL || process.env.REDIS_URL || null;
}

function redisConfigured() {
  return Boolean(getRedisUrl());
}

function initRedisClient(url = getRedisUrl(), options = {}) {
  if (!url) return null;
  if (redisClient) return redisClient;

  redisClient = new Redis(url, {
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 100, 2000),
    ...options,
  });

  redisClient.on('error', (err) => {
    console.error('[Enterprise Redis Error]:', err.message);
  });

  return redisClient;
}

async function getClient() {
  if (!redisClient) {
    const url = getRedisUrl();
    if (url) initRedisClient(url);
  }
  if (redisClient && redisClient.status === 'wait') {
    await redisClient.connect().catch(() => {});
  }
  return redisClient;
}

async function getTenantCache(params) {
  const client = await getClient();
  if (!client || client.status !== 'ready') return null;
  const key = tenantCacheKey(params);
  const raw = await client.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function setTenantCache(params, value, ttlSeconds = 300) {
  const client = await getClient();
  if (!client || client.status !== 'ready') return false;
  const key = tenantCacheKey(params);
  const payload = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (ttlSeconds && ttlSeconds > 0) {
    await client.set(key, payload, 'EX', ttlSeconds);
  } else {
    await client.set(key, payload);
  }
  return true;
}

async function invalidateTenantCache(params) {
  const client = await getClient();
  if (!client || client.status !== 'ready') return 0;
  const key = tenantCacheKey(params);
  return client.del(key);
}

async function invalidateTenantPrefix({ tenantId, workspaceId = null }) {
  const client = await getClient();
  if (!client || client.status !== 'ready') return 0;
  const prefix = tenantCachePrefix({ tenantId, workspaceId }) + '*';
  const keys = await client.keys(prefix);
  if (keys && keys.length > 0) {
    return client.del(...keys);
  }
  return 0;
}

/**
 * ADVISORY-ONLY rate signal. This function must never be the enforcement
 * point for a security decision: without Redis there is no durable counter,
 * so it reports `authoritative: false`. Security-relevant limits (AI quotas,
 * tenant abuse ceilings) are enforced by the durable Firestore TenantQuotaGuard.
 */
async function checkTenantRateLimit({ tenantId, principalId, operation, window = '1m', limit = 60 }) {
  const client = await getClient();
  if (!client || client.status !== 'ready') {
    if (!redisConfigured()) {
      return { allowed: true, current: 1, limit, remaining: limit - 1, source: 'not-configured', authoritative: false };
    }
    // Configured but unreachable: still advisory; durable stores carry correctness.
    return { allowed: true, current: 1, limit, remaining: limit - 1, source: 'unavailable', authoritative: false };
  }
  const key = tenantRateLimitKey({ tenantId, principalId, operation, window });
  const current = await client.incr(key);
  if (current === 1) {
    const ttl = window.endsWith('m') ? parseInt(window) * 60 : 60;
    await client.expire(key, ttl);
  }
  const allowed = current <= limit;
  return {
    allowed,
    current,
    limit,
    remaining: Math.max(0, limit - current),
    source: 'redis',
    authoritative: false,
  };
}

async function pingRedis() {
  const url = getRedisUrl();
  if (!url) {
    return { ok: false, configured: false, status: 'not-configured', optional: true, error: 'NO_REDIS_CONFIGURED' };
  }
  const client = await getClient();
  if (!client) return { ok: false, configured: true, status: 'unavailable', optional: true, error: 'CLIENT_UNAVAILABLE' };
  const start = Date.now();
  try {
    const pong = await client.ping();
    const latencyMs = Date.now() - start;
    return { ok: pong === 'PONG', configured: true, status: pong === 'PONG' ? 'healthy' : 'degraded', pong, latencyMs, optional: true };
  } catch (err) {
    return { ok: false, configured: true, status: 'unhealthy', optional: true, error: err.message };
  }
}

module.exports = {
  checkTenantRateLimit,
  getClient,
  getTenantCache,
  initRedisClient,
  invalidateTenantCache,
  invalidateTenantPrefix,
  pingRedis,
  redisConfigured,
  setTenantCache,
};
