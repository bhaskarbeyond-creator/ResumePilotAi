'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { RedisMemoryServer } = require('redis-memory-server');
const Redis = require('ioredis');
const { tenantCacheKey, globalCacheKey, tenantRateLimitKey, tenantCachePrefix } = require('../enterprise/tenantCache');

let redisServer = null;
let redisClient = null;
let serverPort = null;

test.before(async () => {
  try {
    redisServer = new RedisMemoryServer();
    const host = await redisServer.getHost();
    serverPort = await redisServer.getPort();
    redisClient = new Redis({
      host,
      port: serverPort,
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
      lazyConnect: false,
    });
    const pong = await redisClient.ping();
    assert.equal(pong, 'PONG', 'Redis server responded with PONG');
  } catch (err) {
    console.log('[Redis Test Notice] Native redis-server spawn exception:', err.message);
  }
});

test.after(async () => {
  if (redisClient) {
    await redisClient.quit().catch(() => {});
  }
  if (redisServer) {
    await redisServer.stop().catch(() => {});
  }
});

test('Real Redis TCP socket client connects and verifies PING/PONG', async (t) => {
  if (!redisClient) {
    t.skip('Native Redis server binary unavailable in environment');
    return;
  }
  const pong = await redisClient.ping();
  assert.equal(pong, 'PONG');
  const info = await redisClient.info('server');
  assert.match(info, /redis_version:/);
});

test('Real Redis enforces strict tenant and workspace key separation without collision', async (t) => {
  if (!redisClient) {
    t.skip('Native Redis server binary unavailable in environment');
    return;
  }

  const tenantAId = crypto.randomUUID();
  const tenantBId = crypto.randomUUID();
  const workspaceAId = crypto.randomUUID();
  const workspaceBId = crypto.randomUUID();
  const resourceId = 'resume-item-001';

  const keyA = tenantCacheKey({
    tenantId: tenantAId,
    workspaceId: workspaceAId,
    domain: 'resumes',
    resourceId,
    revision: 1,
  });

  const keyB = tenantCacheKey({
    tenantId: tenantBId,
    workspaceId: workspaceBId,
    domain: 'resumes',
    resourceId,
    revision: 1,
  });

  // Verify deterministic separation
  assert.notEqual(keyA, keyB);
  assert.match(keyA, new RegExp(`tenant:${tenantAId}`));
  assert.match(keyB, new RegExp(`tenant:${tenantBId}`));

  // Store data in Tenant A
  await redisClient.set(keyA, JSON.stringify({ name: 'Alpha Secret Resume', salary: 180000 }), 'EX', 60);

  // Tenant B queries using Tenant B key
  const dataB = await redisClient.get(keyB);
  assert.equal(dataB, null, 'Tenant B must receive cache miss on Tenant A resource');

  // Tenant A queries using Tenant A key
  const dataA = await redisClient.get(keyA);
  assert.ok(dataA);
  const parsedA = JSON.parse(dataA);
  assert.equal(parsedA.name, 'Alpha Secret Resume');

  // Cleanup
  await redisClient.del(keyA);
});

test('Real Redis TTL expiration automatically purges cached tenant objects', async (t) => {
  if (!redisClient) {
    t.skip('Native Redis server binary unavailable in environment');
    return;
  }

  const tempKey = tenantCacheKey({
    tenantId: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
    domain: 'session_tokens',
    resourceId: 'tok-ephemeral-999',
    revision: 1,
  });

  // Set with 1 second TTL
  await redisClient.set(tempKey, JSON.stringify({ active: true }), 'EX', 1);

  // Immediately check
  const immediate = await redisClient.get(tempKey);
  assert.ok(immediate, 'Key must exist immediately after set');

  // Check TTL command
  const ttl = await redisClient.ttl(tempKey);
  assert.ok(ttl > 0 && ttl <= 1, 'TTL must reflect remaining seconds');

  // Wait 1200ms for expiration
  await new Promise(resolve => setTimeout(resolve, 1200));

  const expired = await redisClient.get(tempKey);
  assert.equal(expired, null, 'Key must be automatically evicted after TTL expiration');
});

test('Real Redis atomic INCR handles multi-tenant rate limiting without cross-tenant interference', async (t) => {
  if (!redisClient) {
    t.skip('Native Redis server binary unavailable in environment');
    return;
  }

  const tenantAId = crypto.randomUUID();
  const tenantBId = crypto.randomUUID();
  const principalA = 'usr_alice';
  const principalB = 'usr_bob';
  const windowId = '20260820T0420';

  const tenantAQuotaKey = tenantRateLimitKey({
    tenantId: tenantAId,
    principalId: principalA,
    operation: 'ai_generate',
    window: windowId,
  });

  const tenantBQuotaKey = tenantRateLimitKey({
    tenantId: tenantBId,
    principalId: principalB,
    operation: 'ai_generate',
    window: windowId,
  });

  // Execute 25 concurrent requests for Tenant A and 10 for Tenant B
  const requestsA = Array.from({ length: 25 }, () => redisClient.incr(tenantAQuotaKey));
  const requestsB = Array.from({ length: 10 }, () => redisClient.incr(tenantBQuotaKey));

  await Promise.all([...requestsA, ...requestsB]);

  const countA = await redisClient.get(tenantAQuotaKey);
  const countB = await redisClient.get(tenantBQuotaKey);

  assert.equal(Number(countA), 25, 'Tenant A atomic counter must equal 25');
  assert.equal(Number(countB), 10, 'Tenant B atomic counter must equal 10');

  // Clean up
  await Promise.all([redisClient.del(tenantAQuotaKey), redisClient.del(tenantBQuotaKey)]);
});
