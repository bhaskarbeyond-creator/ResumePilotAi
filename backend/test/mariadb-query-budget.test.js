'use strict';

/**
 * MariaDB query-budget regression suite.
 *
 * Production incident context: database-backed requests became noticeably slow.
 * Forensics showed the cost was not MariaDB execution speed but the NUMBER of
 * sequential round trips each request made on a pool shared with background
 * workers (connectionLimit 15 / queueLimit 200).
 *
 * These tests pin the proven fixes so a future change cannot silently reintroduce
 * the amplification. Each budget is asserted against the real code path — route
 * handler or service — using a recording pool, so the assertion is a measured
 * round-trip count, not a source-text match.
 *
 * Budgets:
 *   1. payment reconciliation        : constant per tick, independent of backlog
 *   2. GET /api/messages/conversations: 3 round trips, independent of N
 *   3. GET /api/admin/users          : 2 batched reads, independent of page size
 *   4. batch membership read         : cannot attribute a row to another principal
 *   5. directory fan-out             : bounded concurrent pool acquisitions
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setPoolForTests } = require('../database/mysql');
const { setTokenVerifierForTests } = require('../security/auth');
const { reconcilePendingIndianGatewayOrders } = require('../services/indianGatewayActivation');
const { InMemoryTenantRegistry } = require('./helpers/inMemoryTenantRegistry');

const identities = {
  super: { uid: 'qb-super', email: 'super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_second_factor: 'totp' } },
  user: { uid: 'qb-user', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) },
};

setTokenVerifierForTests(async token => {
  const key = String(token || '').replace('Bearer ', '');
  if (identities[key]) return identities[key];
  throw new Error('invalid token');
});

/**
 * Recording pool double. Returns rows from a fixed dataset keyed by the table the
 * statement reads, and records every acquisition so concurrency is measurable.
 */
function recordingPool({ onQuery } = {}) {
  const log = { sql: [], concurrent: 0, maxConcurrent: 0 };
  const run = async (sql, params) => {
    log.sql.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
    log.concurrent += 1;
    log.maxConcurrent = Math.max(log.maxConcurrent, log.concurrent);
    try {
      return onQuery ? await onQuery(String(sql), params) : [];
    } finally {
      log.concurrent -= 1;
    }
  };
  const pool = {
    log,
    _closed: false,
    query: async (sql, params) => [await run(sql, params)],
    execute: async (sql, params) => [await run(sql, params)],
    getConnection: async () => {
      const connection = {
        query: async (sql, params) => [await run(sql, params)],
        execute: async (sql, params) => [await run(sql, params)],
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
      };
      return connection;
    },
  };
  return pool;
}

const countMatching = (log, pattern) => log.sql.filter(entry => pattern.test(entry.sql)).length;

// ---------------------------------------------------------------------------
// 1. Background worker: credential lookups must not scale with the backlog
// ---------------------------------------------------------------------------
test('payment reconciliation reads provider credentials once per provider, not once per order', async () => {
  const orders = Array.from({ length: 25 }, (_, i) => ({ id: `ord_${i}`, provider: i % 2 ? 'phonepe' : 'paytm' }));
  let paytmLookups = 0;
  let phonePeLookups = 0;
  const pool = recordingPool({
    onQuery: async sql => {
      if (/FROM payment_orders/.test(sql)) return orders;
      if (/FROM system_settings/.test(sql)) return [{ data: '{}' }];
      return [];
    },
  });
  const activations = [];
  const result = await reconcilePendingIndianGatewayOrders({
    pool,
    getPaytmConfig: async () => { paytmLookups += 1; return { mid: 'MID', key: 'secret', baseUrl: 'https://paytm.invalid' }; },
    getPhonePeConfig: async () => { phonePeLookups += 1; return { merchantId: 'M1', saltKey: 'salt', saltIndex: 1, baseUrl: 'https://phonepe.invalid' }; },
    // Provider transport is stubbed at the fetch boundary: statuses never activate,
    // which is the pre-existing per-row error path and must stay non-fatal.
    fetchImpl: async () => { throw Object.assign(new Error('provider unreachable'), { code: 'PAYTM_STATUS_UNAVAILABLE' }); },
    activation: { claim: async () => ({}), activate: async order => { activations.push(order); return {}; }, release: async () => ({}) },
  });

  assert.equal(paytmLookups, 1, 'Paytm credentials must be resolved at most once per reconciliation pass');
  assert.equal(phonePeLookups, 1, 'PhonePe credentials must be resolved at most once per reconciliation pass');
  assert.equal(countMatching(pool.log, /FROM system_settings/), 0, 'reconcile itself must not re-read settings per row');
  assert.equal(result.examined, 25, 'every due order must still be examined (no coverage loss)');
  assert.equal(result.processed, 0, 'unreachable provider responses must not count as activations');
  assert.equal(activations.length, 0);
});

test('an unconfigured gateway no longer multiplies configuration reads across the batch', async () => {
  const orders = Array.from({ length: 25 }, (_, i) => ({ id: `ord_${i}`, provider: 'paytm' }));
  let lookups = 0;
  const pool = recordingPool({
    onQuery: async sql => {
      if (/FROM payment_orders/.test(sql)) return orders;
      return [];
    },
  });
  const result = await reconcilePendingIndianGatewayOrders({
    pool,
    getPaytmConfig: async () => { lookups += 1; return {}; }, // not configured: the historical hot loop
    getPhonePeConfig: async () => ({}),
    fetchImpl: async () => { throw new Error('must not be called'); },
    activation: {},
  });
  assert.equal(lookups, 1, 'a single not-configured answer must short-circuit the whole pass');
  // Only the bounded batch SELECT reaches the pool: the credential resolution is
  // memoised for the pass, so the historical 1 + 2N pool round trips are gone.
  assert.equal(pool.log.sql.length, 1, 'exactly one pool round trip per idle tick, independent of backlog size');
  assert.equal(result.processed, 0);
  assert.equal(result.examined, 25);
});

test('a credential resolution failure is reported per row exactly as before', async () => {
  const orders = [{ id: 'a', provider: 'paytm' }, { id: 'b', provider: 'paytm' }];
  const pool = recordingPool({ onQuery: async sql => (/FROM payment_orders/.test(sql) ? orders : []) });
  let calls = 0;
  const result = await reconcilePendingIndianGatewayOrders({
    pool,
    getPaytmConfig: async () => { calls += 1; throw new Error('PAYMENT_CONFIGURATION_UNAVAILABLE'); },
    getPhonePeConfig: async () => ({}),
    fetchImpl: async () => { throw new Error('unreachable'); },
    activation: {},
  });
  assert.equal(result.processed, 0);
  assert.equal(calls, 1, 'failure is memoised for the pass instead of re-thrown against the database');
});

test('reconciliation bounds the batch size it requests from the pool', async () => {
  const pool = recordingPool({ onQuery: async () => [] });
  const result = await reconcilePendingIndianGatewayOrders({
    pool, getPaytmConfig: async () => ({}), getPhonePeConfig: async () => ({}),
    fetchImpl: async () => { throw new Error('x'); }, activation: {},
  });
  const select = pool.log.sql[0];
  assert.match(select.sql, /LIMIT \?/);
  assert.ok(Number.isInteger(select.params[0]) && select.params[0] <= 50, 'batch must be bounded');
  assert.deepEqual(result, { processed: 0, examined: 0 });
});

// ---------------------------------------------------------------------------
// 2. GET /api/messages/conversations — N+1 eliminated, isolation intact
// ---------------------------------------------------------------------------
const app = require('../index');

const CONVERSATION_COUNT = 40;

function conversationsDataset({ callerUid = identities.user.uid } = {}) {
  const conversationIds = Array.from({ length: CONVERSATION_COUNT }, (_, i) => `conv_${i}`);
  return {
    conversationIds,
    onQuery: async (sql, params = []) => {
      if (/FROM conversations c/.test(sql)) {
        // The route's ownership predicate must be present; echo only caller rows.
        assert.ok(/cp\.user_id = \?/.test(sql.replace(/\s+/g, ' ')), 'conversation list must be caller-scoped');
        assert.equal(params[0], callerUid);
        return conversationIds.map(id => ({ id, applicationId: null }));
      }
      if (/FROM conversation_participants/.test(sql)) {
        const wanted = new Set(params);
        // Includes a foreign participant row on a conversation the caller CAN see;
        // it must still be projected, and rows for unseen conversations must not
        // be requested at all (the IN list is derived from the caller's page).
        return [...wanted].flatMap(id => [{ conversation_id: id, user_id: callerUid }, { conversation_id: id, user_id: 'peer-of-conv' }]);
      }
      if (/FROM conversation_messages/.test(sql)) {
        const wanted = new Set(params);
        return [...wanted].map((id, i) => ({ conversationId: id, id: `msg_${i}`, senderId: 'peer-of-conv', text: `hello ${id}`, timestamp: 1000 + i }));
      }
      if (/FROM users/.test(sql)) return [];
      return [];
    },
  };
}

test('conversation list issues a constant three round trips regardless of conversation count', async () => {
  const dataset = conversationsDataset();
  const pool = recordingPool({ onQuery: dataset.onQuery });
  setPoolForTests(pool);

  const res = await request(app).get('/api/messages/conversations').set('Authorization', 'Bearer user');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.success, true);
  assert.equal(res.body.conversations.length, CONVERSATION_COUNT);

  const reads = pool.log.sql.filter(entry => /conversations|conversation_participants|conversation_messages/.test(entry.sql));
  assert.equal(reads.length, 3, `expected 3 round trips for ${CONVERSATION_COUNT} conversations, measured ${reads.length}`);
  assert.equal(pool.log.maxConcurrent, 2, 'participants and latest-message reads run as one parallel pair, never 2N sequential trips');
});

test('conversation list preserves per-conversation participants and latest message shape', async () => {
  const dataset = conversationsDataset();
  setPoolForTests(recordingPool({ onQuery: dataset.onQuery }));
  const res = await request(app).get('/api/messages/conversations').set('Authorization', 'Bearer user');
  const [first] = res.body.conversations;
  assert.deepEqual(Object.keys(first).sort(), ['applicationId', 'id', 'lastMessage', 'participants']);
  assert.deepEqual(Object.keys(first.lastMessage).sort(), ['id', 'senderId', 'text', 'timestamp']);
  assert.equal(first.participants[identities.user.uid], true, 'the caller must remain a participant of their own conversation');
  assert.equal(first.participants['peer-of-conv'], true);
});

test('an empty conversation list performs no per-conversation queries at all', async () => {
  const pool = recordingPool({ onQuery: async () => [] });
  setPoolForTests(pool);
  const res = await request(app).get('/api/messages/conversations').set('Authorization', 'Bearer user');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.conversations, []);
  assert.equal(pool.log.sql.length, 1, 'the batched follow-up reads must be skipped entirely');
});

test('conversation list is unauthenticated without a verified token', async () => {
  setPoolForTests(recordingPool({ onQuery: async () => [] }));
  const res = await request(app).get('/api/messages/conversations');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTH_REQUIRED');
});

// ---------------------------------------------------------------------------
// 3. GET /api/admin/users — page-level batching and bounded fan-out
// ---------------------------------------------------------------------------
function installDirectory({ pageSize = 100, failBatchProfiles = false } = {}) {
  const uids = Array.from({ length: pageSize }, (_, i) => `dir-user-${i}`);
  const directoryPool = recordingPool({
    onQuery: async (sql, params = []) => {
      if (/FROM users WHERE id IN/.test(sql)) {
        if (failBatchProfiles) throw Object.assign(new Error('batch reader unavailable'), { code: 'METHOD_NOT_IMPLEMENTED' });
        return uids.map(uid => ({ id: uid, email: `${uid}@example.com`, extra_data: null }));
      }
      if (/FROM users WHERE id = \?/.test(sql)) {
        const uid = params[0];
        return uids.includes(uid) ? [{ id: uid, email: `${uid}@example.com`, extra_data: null }] : [];
      }
      return [];
    },
  });
  setPoolForTests(directoryPool);

  const registry = new InMemoryTenantRegistry();
  const membershipsByPrincipal = new Map();
  registry.listMembershipsForPrincipals = async principalIds => new Map(
    principalIds.map(uid => [uid, membershipsByPrincipal.get(uid) || []])
  );
  registry.listMemberships = async uid => membershipsByPrincipal.get(uid) || [];
  app.set('tenantService', { registry });
  app.set('firebaseAdmin', {
    auth: () => ({
      listUsers: async limit => ({ users: uids.slice(0, limit).map(uid => ({ uid, email: `${uid}@example.com`, customClaims: { role: 'USER', email_verified: true } })) }),
    }),
  });
  return { directoryPool, uids, registry };
}

test('a full administrative page is served by batched reads, not per-identity round trips', async () => {
  const { directoryPool, uids } = installDirectory({ pageSize: 100 });
  const res = await request(app).get('/api/admin/users?limit=100').set('Authorization', 'Bearer super');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.users.length, 100);

  const profileReads = directoryPool.log.sql.filter(entry => /FROM users/.test(entry.sql));
  assert.equal(profileReads.length, 1, 'profiles must be read once per page, not once per identity');
  assert.ok(directoryPool.log.maxConcurrent <= 2, `the page must not fan hundreds of acquisitions onto the shared pool (measured ${directoryPool.log.maxConcurrent})`);
  assert.equal(directoryPool.log.sql.length, 1, `expected a single MariaDB round trip for ${uids.length} identities`);
});

test('administrative directory falls back to per-identity reads when no batch reader exists', async () => {
  const { directoryPool } = installDirectory({ pageSize: 3, failBatchProfiles: true });
  const res = await request(app).get('/api/admin/users?limit=3').set('Authorization', 'Bearer super');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.users.length, 3);
  assert.equal(res.body.users[0].email, 'dir-user-0@example.com', 'fallback must still hydrate profiles');
  assert.ok(directoryPool.log.sql.filter(e => /FROM users WHERE id = \?/.test(e.sql)).length >= 1, 'per-identity reads are the documented fallback');
});

test('tenant memberships are projected per identity from the batched reader', async () => {
  const { directoryPool, registry } = installDirectory({ pageSize: 2 });
  registry.listMembershipsForPrincipals = async () => new Map([
    ['dir-user-0', [{ tenantId: 'tenant-a', displayName: 'Acme', slug: 'acme', roles: ['ENTERPRISE_MEMBER'] }]],
  ]);
  const res = await request(app).get('/api/admin/users?limit=2').set('Authorization', 'Bearer super');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const byId = new Map(res.body.users.map(user => [user.id, user]));
  assert.equal(byId.get('dir-user-0').tenantMemberships.length, 1);
  assert.equal(byId.get('dir-user-0').primaryTenant.displayName, 'Acme');
  assert.deepEqual(byId.get('dir-user-1').tenantMemberships, [], 'a batch miss must project no membership for that subject');
  assert.equal(directoryPool.log.sql.filter(e => /FROM users/.test(e.sql)).length, 1);
});

// ---------------------------------------------------------------------------
// 4. The MySQL registry batch reader must not widen membership visibility
// ---------------------------------------------------------------------------
test('batch membership read attributes every row only to its own principal', async () => {
  const { MySqlTenantRegistry } = require('../enterprise/mysqlTenantRegistry');
  const requested = ['principal-a'];
  const rows = [
    // Legitimate row for the requested principal.
    { id: 'm-1', tenantId: 'tenant-1', principalId: 'principal-a', status: 'ACTIVE', roles: ['MEMBER'], displayName: 'Acme', slug: 'acme', tenantLifecycleState: 'ACTIVE' },
    // A row belonging to a different principal must never be attachable to the caller.
    { id: 'm-2', tenantId: 'tenant-1', principalId: 'principal-b', status: 'ACTIVE', roles: ['MEMBER'], displayName: 'Acme', slug: 'acme', tenantLifecycleState: 'ACTIVE' },
    // A row whose state is invalid must be dropped, mirroring the single read.
    { id: 'm-3', tenantId: 'tenant-1', principalId: 'principal-a', status: 'NOT_A_STATE', roles: ['MEMBER'], displayName: 'Acme', slug: 'acme', tenantLifecycleState: 'ACTIVE' },
  ];
  const pool = recordingPool({ onQuery: async () => rows });
  const registry = new MySqlTenantRegistry({ pool });
  let sentParams = null;
  const originalQuery = pool.query.bind(pool);
  pool.query = async (sql, params) => { sentParams = params; return originalQuery(sql, params); };

  const grouped = await registry.listMembershipsForPrincipals(requested);
  assert.ok(grouped instanceof Map, 'the batch reader returns a principal-keyed map');
  assert.deepEqual([...grouped.keys()], requested, 'only requested principals may appear in the result');
  assert.equal(grouped.get('principal-a').length, 1, 'only the principal\'s own valid membership is projected');
  assert.equal(grouped.get('principal-a')[0].id, 'm-1');
  assert.equal(grouped.has('principal-b'), false, 'an unrequested principal must not be materialised');
  assert.deepEqual(sentParams, requested, 'the predicate must bind exactly the requested principals');
});

test('batch membership read is empty and query-free for an empty page', async () => {
  const { MySqlTenantRegistry } = require('../enterprise/mysqlTenantRegistry');
  const pool = recordingPool({ onQuery: async () => { throw new Error('must not query'); } });
  const registry = new MySqlTenantRegistry({ pool });
  const grouped = await registry.listMembershipsForPrincipals([]);
  assert.equal(grouped.size, 0);
  assert.equal(pool.log.sql.length, 0);
});

// ---------------------------------------------------------------------------
// 5. Provider probes cannot pin the shared worker tick
// ---------------------------------------------------------------------------
test('indian gateway status probes carry an enforced request deadline', async () => {
  const { queryPaytmOrderStatus, queryPhonePeOrderStatus } = require('../services/indianGatewayActivation');
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push(options);
    return { ok: true, json: async () => ({ body: { resultStatus: 'TXN_SUCCESS' }, data: { state: 'COMPLETED' } }) };
  };
  await queryPaytmOrderStatus({
    orderId: 'ord_1',
    config: { mid: 'MID', key: 'secret', baseUrl: 'https://paytm.invalid' },
    fetchImpl,
  });
  await queryPhonePeOrderStatus({
    orderId: 'pp_1',
    config: { merchantId: 'M1', saltKey: 'salt', saltIndex: 1, baseUrl: 'https://phonepe.invalid' },
    fetchImpl,
  });
  assert.equal(seen.length, 2);
  for (const options of seen) {
    // Global fetch ignores `timeout`; the AbortSignal is what actually bounds the
    // call, so a hung gateway cannot pin the shared outbox/notification tick.
    assert.ok(options.signal && typeof options.signal.addEventListener === 'function',
      'a real AbortSignal must be attached so undici enforces the deadline');
    assert.equal(options.timeout, 10_000, 'the node-fetch compatible bound must remain');
  }
});

// ---------------------------------------------------------------------------
// 6. Health snapshot: the public availability surface must stay cache-served
// ---------------------------------------------------------------------------
test('operational-status snapshot is bounded and served from cache on repeat reads', async () => {
  const express = require('express');
  const { getHealthSnapshot, resetHealthCache } = require('../services/platformHealth');
  const pool = recordingPool({
    onQuery: async sql => {
      if (/SELECT category, data FROM system_settings/.test(sql)) {
        return [{ category: 'public_config', data: '{}' }, { category: 'system_settings', data: '{}' }];
      }
      if (/FROM notification_outbox/.test(sql)) return [];
      return [{ alive: 1, version: 'test' }];
    },
  });
  setPoolForTests(pool);
  const healthApp = express();
  resetHealthCache();
  try {
    await getHealthSnapshot(healthApp);
    const cold = pool.log.sql.length;
    const outboxAggregates = pool.log.sql.filter(e => /FROM notification_outbox/.test(e.sql)).length;
    assert.ok(cold > 0 && cold <= 8, `a cold snapshot must stay a bounded number of round trips (measured ${cold})`);
    assert.equal(outboxAggregates, 1, 'exactly one outbox aggregation per cold snapshot');

    // Repeat read inside the cache window must not touch the pool at all: this is
    // what protects /api/service-availability (public, mounted on the pricing and
    // dashboard pages) from turning every page view into a MariaDB aggregation.
    pool.log.sql.length = 0;
    await getHealthSnapshot(healthApp);
    assert.equal(pool.log.sql.length, 0, 'a cached snapshot must issue zero pool round trips');
  } finally {
    resetHealthCache();
  }
});
