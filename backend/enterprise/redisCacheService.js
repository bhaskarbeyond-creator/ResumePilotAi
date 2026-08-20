'use strict';

const Redis = require('ioredis');
const { tenantCacheKey, tenantRateLimitKey, tenantCachePrefix } = require('./tenantCache');

let redisClient = null;

function getRedisUrl() {
  return process.env.TENANT_REDIS_URL || process.env.REDIS_URL || null;
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

async function checkTenantRateLimit({ tenantId, principalId, operation, window = '1m', limit = 60 }) {
  const client = await getClient();
  if (!client || client.status !== 'ready') {
    // Fail-open for rate limiter if Redis is offline
    return { allowed: true, current: 1, limit, remaining: limit - 1, source: 'fallback' };
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
  };
}

async function pingRedis() {
  const client = await getClient();
  if (!client) return { ok: false, status: 'unavailable', error: 'NO_REDIS_CONFIGURED' };
  const start = Date.now();
  try {
    const pong = await client.ping();
    const latencyMs = Date.now() - start;
    return { ok: pong === 'PONG', status: pong === 'PONG' ? 'healthy' : 'degraded', pong, latencyMs };
  } catch (err) {
    return { ok: false, status: 'unhealthy', error: err.message };
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
  setTenantCache,
};
