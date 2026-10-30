// Mandate 12-ULTIMATE contract tests (part A).
//
// Two kinds of evidence live here, and they are labelled so they cannot be
// confused with each other:
//
//   EXECUTABLE   — real production code paths, real cryptography, real route
//                  handlers over HTTP, deterministic fixtures at the database
//                  driver seam only. These run everywhere.
//   MARIA-DB     — claims that are only meaningful against a real MariaDB
//                  (row locks, persistence across restarts, true multi-connection
//                  concurrency). Those live in
//                  backend/test/mandate12-database-integration.test.js and are
//                  gated on a disposable target.
//
// The four tests that this file previously carried as `test.skip` are replaced
// by real assertions below; nothing in this file is skipped.

process.env.NODE_ENV = 'test';
// The revocation path is opt-in under NODE_ENV=test (most backend suites inject
// an identity with no database). This suite exists to prove it, so it opts in.
process.env.SESSION_REVOCATION_IN_TEST = 'true';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../backend/index.js', import.meta.url));
const express = require('express');
const request = require('supertest');
const crypto = require('crypto');

const mysql = require('./database/mysql');

// ─── Database seam ──────────────────────────────────────────────────────────
// Every module under test resolves the pool through this module's `getPool`, so a
// single mutable seam lets each test describe the database responses it expects
// and inspect the SQL that was issued. This is a driver fixture, NOT evidence of
// database behaviour: the MariaDB suite is the evidence.
let currentPool = null;
mysql.getPool = () => currentPool;

const { platformRouter } = require('./routes/platform');
const { jobsDataRouter } = require('./routes/jobsData');
const { router: employerSettingsRouter } = require('./routes/employerSettings');
const { MySqlTenantRegistry, validateTenantRecord, normalizeSeatQuota, normalizeCustomDomain, membershipDocumentId } = require('./enterprise/mysqlTenantRegistry');
const sessionRevocation = require('./security/sessionRevocation');
const auth = require('./security/auth');
const webhookGuard = require('./security/webhookGuard');
const MySQLRepository = require('./repositories/MySQLRepository');

function makePool(handler) {
  const calls = [];
  const run = async (sql, params = []) => {
    calls.push({ sql: String(sql), params });
    return handler(String(sql), params);
  };
  const connection = {
    query: run,
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  const pool = {
    calls,
    query: run,
    getConnection: async () => connection,
  };
  return pool;
}

const asUser = (role = 'SUPER_ADMIN', extra = {}) => (req, _res, next) => {
  req.user = Object.freeze({
    uid: 'test-user',
    email: 'test@platform.local',
    emailVerified: true,
    claims: { role, auth_time: Math.floor(Date.now() / 1000), ...extra },
  });
  next();
};

// ─── Pre-existing platform contracts (unchanged behaviour) ──────────────────
const platformApp = (role = 'SUPER_ADMIN') => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.get('x-test-role')) req.user = { uid: 'test-user', claims: { role: req.get('x-test-role') } };
    next();
  });
  app.use('/api/platform', platformRouter);
  return app;
};
const get = (path, role = 'SUPER_ADMIN') => request(platformApp()).get(`/api/platform/${path}`).set('x-test-role', role);

const setupCounts = values => {
  const calls = [];
  currentPool = makePool((sql) => {
    const index = sql.includes('FROM users') ? 0 : sql.includes('FROM resumes') ? 1 : 2;
    return [[{ total: values[index] }]];
  });
  calls.push(...currentPool.calls);
  return calls;
};

test('stats return all three database counts and use parameterized calls', async () => {
  const calls = setupCounts([3, '12', 5]);
  const res = await get('stats');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { users: 3, resumes: 12, tenants: 5 });
  assert.equal(currentPool.calls.length, 3);
  assert.match(currentPool.calls[0].sql, /FROM users WHERE deleted_at IS NULL/);
  assert.match(currentPool.calls[1].sql, /FROM resumes WHERE deleted_at IS NULL/);
  assert.match(currentPool.calls[2].sql, /FROM enterprise_tenants/);
  assert.ok(currentPool.calls.every(call => Array.isArray(call.params)));
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(calls, []);
});

test('confirmed zero counts remain zero', async () => {
  setupCounts([0, 0, 0]);
  const res = await get('stats');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { users: 0, resumes: 0, tenants: 0 });
});

test('database failures and invalid counts never become zero or disclose diagnostics', async () => {
  currentPool = makePool(async () => { throw new Error('secret database.internal password'); });
  let res = await get('stats');
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'PLATFORM_STATS_UNAVAILABLE');
  assert.equal(res.body.users, undefined);
  assert.doesNotMatch(JSON.stringify(res.body), /secret|database\.internal|password/);
  for (const value of [null, undefined, -1, 1.5, '1x', '9007199254740992']) {
    setupCounts([value, 0, 0]);
    res = await get('stats');
    assert.equal(res.status, 503, String(value));
    assert.equal(res.body.users, undefined);
  }
});

test('authorization rejects anonymous and ordinary users before querying', async () => {
  currentPool = makePool(async () => { throw new Error('unexpected query'); });
  assert.equal((await request(platformApp()).get('/api/platform/stats')).status, 401);
  assert.equal((await get('stats', 'USER')).status, 403);
  assert.equal((await get('health/probes', 'USER')).status, 403);
  assert.equal(currentPool.calls.length, 0);
});

test('health probes reflect success, unconfigured auth, failure, and never leak exceptions', async () => {
  const healthApp = () => {
    const app = express();
    app.use((req, _res, next) => { req.user = { uid: 'test-user', claims: { role: 'SUPER_ADMIN' } }; next(); });
    app.use('/api/platform', platformRouter);
    return app;
  };
  currentPool = makePool(async (_sql, params) => { assert.deepEqual(params, []); return [[{ alive: 1 }]]; });
  let app = healthApp();
  app.set('firebaseAdmin', undefined);
  let res = await request(app).get('/api/platform/health/probes');
  assert.equal(res.status, 200);
  assert.equal(res.body.services.find(s => s.id === 'api').state, 'HEALTHY');
  assert.equal(res.body.services.find(s => s.id === 'database').state, 'HEALTHY');
  assert.equal(res.body.services.find(s => s.id === 'authentication').state, 'UNKNOWN');
  assert.equal(res.headers['cache-control'], 'no-store');

  app.set('firebaseAdmin', { auth: () => ({ listUsers: async n => { assert.equal(n, 1); } }) });
  res = await request(app).get('/api/platform/health/probes');
  assert.equal(res.body.services.find(s => s.id === 'authentication').state, 'HEALTHY');

  currentPool = makePool(async () => { throw new Error('password secret host.internal'); });
  app.set('firebaseAdmin', { auth: () => ({ listUsers: async () => { throw new Error('secret auth.internal'); } }) });
  res = await request(app).get('/api/platform/health/probes');
  assert.equal(res.status, 200);
  assert.equal(res.body.services.find(s => s.id === 'database').state, 'DEGRADED');
  assert.equal(res.body.services.find(s => s.id === 'authentication').state, 'DEGRADED');
  assert.doesNotMatch(JSON.stringify(res.body), /password|secret|\.internal/);

  currentPool = makePool(async () => [[{ alive: 0 }]]);
  res = await request(app).get('/api/platform/health/probes');
  assert.equal(res.body.services.find(s => s.id === 'database').state, 'DEGRADED');
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. TENANT QUOTA AND CUSTOM-DOMAIN PERSISTENCE (was: test.skip)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stateful tenant fixture: models the `enterprise_tenants` row and applies the
 * UPDATE that the registry issues, so the assertions below are about PERSISTED
 * state (re-read through a SELECT) rather than about an echo of the request.
 */
function tenantPool(initialRow) {
  const row = { ...initialRow };
  let duplicateDomain = null;
  const pool = makePool((sql, params) => {
    if (sql.startsWith('UPDATE enterprise_tenants SET')) {
      // params = [...assignment values, tenantId]
      const assignments = [...sql.matchAll(/([A-Za-z_]+) = (\?|NULL)/g)];
      const tenantId = params[params.length - 1];
      if (tenantId !== row.id) return [{ affectedRows: 0 }];
      let valueIndex = 0;
      for (const [, column, placeholder] of assignments) {
        if (placeholder === 'NULL') { row[column] = null; continue; }
        const value = params[valueIndex];
        valueIndex += 1;
        if (column === 'custom_domain' && duplicateDomain && value === duplicateDomain) {
          throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY', errno: 1062 });
        }
        row[column] = value;
      }
      row.updated_at = new Date().toISOString();
      return [{ affectedRows: 1 }];
    }
    if (/^SELECT \* FROM enterprise_tenants WHERE id = \?/.test(sql)) {
      return [row.id === params[0] ? [{ ...row }] : []];
    }
    return [[]];
  });
  pool.row = row;
  pool.claimDomain = domain => { duplicateDomain = domain; };
  return pool;
}

const TENANT_ID = '6f1c9f0e-1a2b-4c3d-8e4f-0123456789ab';
const baseTenantRow = () => ({
  id: TENANT_ID,
  slug: 'acme-enterprise',
  displayName: 'Acme Enterprise',
  lifecycleState: 'ACTIVE',
  isolationTier: 'STANDARD',
  dataPlane: null,
  seat_quota: null,
  monthly_ai_credits: 1000,
  custom_domain: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
});

function tenantApp(pool, role = 'SUPER_ADMIN') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { uid: 'platform-operator', email: 'operator@platform.local', claims: { role, auth_time: Math.floor(Date.now() / 1000) } };
    next();
  });
  app.use('/api/platform', platformRouter);
  const registry = new MySqlTenantRegistry({ pool });
  app.set('tenantService', {
    updateTenantProfileAsPlatform: async ({ tenantId, displayName, seatQuota, monthlyAiCredits, customDomain }) =>
      registry.updateTenantProfile({ tenantId, displayName, seatQuota, monthlyAiCredits, customDomain }),
  });
  return { app, registry };
}

test('tenant quota and custom domain persist and are returned from the database row', async () => {
  const pool = tenantPool(baseTenantRow());
  const { app } = tenantApp(pool);
  const res = await request(app)
    .patch(`/api/platform/tenants/${TENANT_ID}`)
    .send({ seatQuota: 25, monthlyAiCredits: 50000, customDomain: 'HR.Acme.Example.COM.' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  // Domain is normalized before storage; the response is the re-read row.
  assert.equal(res.body.tenant.seatQuota, 25);
  assert.equal(res.body.tenant.monthlyAiCredits, 50000);
  assert.equal(res.body.tenant.customDomain, 'hr.acme.example.com');
  assert.equal(pool.row.seat_quota, 25);
  assert.equal(pool.row.monthly_ai_credits, 50000);
  assert.equal(pool.row.custom_domain, 'hr.acme.example.com');
  // Every write is parameterized.
  const update = pool.calls.find(call => call.sql.startsWith('UPDATE enterprise_tenants SET'));
  assert.ok(update, 'the quota update must reach the database');
  assert.ok(update.params.every(value => typeof value !== 'undefined'));
  assert.ok(!/25|50000/.test(update.sql), 'values must not be interpolated into SQL');
});

test('a partial tenant update preserves unspecified quotas and domain', async () => {
  const pool = tenantPool({ ...baseTenantRow(), seat_quota: 40, monthly_ai_credits: 9000, custom_domain: 'talent.acme.example' });
  const { app } = tenantApp(pool);
  const res = await request(app).patch(`/api/platform/tenants/${TENANT_ID}`).send({ displayName: 'Acme Renamed' });
  assert.equal(res.status, 200);
  assert.equal(res.body.tenant.displayName, 'Acme Renamed');
  assert.equal(res.body.tenant.seatQuota, 40);
  assert.equal(res.body.tenant.monthlyAiCredits, 9000);
  assert.equal(res.body.tenant.customDomain, 'talent.acme.example');
  const update = pool.calls.find(call => call.sql.startsWith('UPDATE enterprise_tenants SET'));
  assert.equal(update.sql.includes('seat_quota'), false, 'omitted fields must not be written');
});

test('invalid quotas and domains are rejected without touching the row', async () => {
  for (const [body, code] of [
    [{ seatQuota: 0 }, 'INVALID_SEAT_QUOTA'],
    [{ seatQuota: -3 }, 'INVALID_SEAT_QUOTA'],
    [{ seatQuota: 'ten' }, 'INVALID_SEAT_QUOTA'],
    [{ seatQuota: 1.5 }, 'INVALID_SEAT_QUOTA'],
    [{ monthlyAiCredits: -1 }, 'INVALID_MONTHLY_AI_CREDITS'],
    [{ monthlyAiCredits: 'lots' }, 'INVALID_MONTHLY_AI_CREDITS'],
    [{ customDomain: 'not a domain' }, 'INVALID_CUSTOM_DOMAIN'],
    [{ customDomain: 'javascript:alert(1)' }, 'INVALID_CUSTOM_DOMAIN'],
    [{ displayName: 'x' }, 'INVALID_TENANT_NAME'],
  ]) {
    const pool = tenantPool(baseTenantRow());
    const { app } = tenantApp(pool);
    const res = await request(app).patch(`/api/platform/tenants/${TENANT_ID}`).send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error.code, code, JSON.stringify(body));
    assert.equal(pool.calls.some(call => call.sql.startsWith('UPDATE')), false, 'no write may occur');
  }
});

test('unknown or empty tenant updates are refused and unauthorized roles cannot write', async () => {
  const pool = tenantPool(baseTenantRow());
  const { app } = tenantApp(pool);
  let res = await request(app).patch(`/api/platform/tenants/${TENANT_ID}`).send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'EMPTY_TENANT_UPDATE');
  res = await request(app).patch(`/api/platform/tenants/${TENANT_ID}`).send({ lifecycleState: 'DELETED' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'UNSUPPORTED_TENANT_FIELD');
  assert.equal(pool.calls.some(call => call.sql.startsWith('UPDATE')), false);

  for (const role of ['USER', 'EMPLOYER', 'SUPPORT']) {
    const denied = tenantApp(tenantPool(baseTenantRow()), role);
    const deniedRes = await request(denied.app).patch(`/api/platform/tenants/${TENANT_ID}`).send({ seatQuota: 999 });
    assert.equal(deniedRes.status, 403, role);
  }
});

test('a custom domain already claimed by another tenant is a 409, not an overwrite', async () => {
  const pool = tenantPool(baseTenantRow());
  pool.claimDomain('taken.example.com');
  const { app } = tenantApp(pool);
  const res = await request(app).patch(`/api/platform/tenants/${TENANT_ID}`).send({ customDomain: 'taken.example.com' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'CUSTOM_DOMAIN_TAKEN');
  assert.equal(pool.row.custom_domain, null, 'the losing write must not mutate the row');
});

test('tenant record projection exposes canonical quota aliases and default credits', () => {
  const fromSnake = validateTenantRecord({
    id: TENANT_ID, displayName: 'Acme', lifecycleState: 'ACTIVE',
    seat_quota: 12, monthly_ai_credits: 4000, custom_domain: 'acme.example.com',
  });
  assert.equal(fromSnake.seatQuota, 12);
  assert.equal(fromSnake.monthlyAiCredits, 4000);
  assert.equal(fromSnake.customDomain, 'acme.example.com');

  const unconfigured = validateTenantRecord({ id: TENANT_ID, displayName: 'Acme', lifecycleState: 'ACTIVE' });
  assert.equal(unconfigured.seatQuota, null, 'an absent quota means "no cap", never zero');
  assert.equal(unconfigured.monthlyAiCredits, 1000);
  assert.equal(unconfigured.customDomain, null);

  // Corrupt stored values degrade to the safe representation instead of throwing.
  assert.equal(normalizeSeatQuota('nonsense'), null);
  assert.equal(normalizeSeatQuota(-5), null);
  assert.equal(normalizeCustomDomain('HTTPS://Acme.Example.com'), null);
  assert.equal(normalizeCustomDomain('acme.example.com.'), 'acme.example.com');
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. CONCURRENCY-SAFE SEAT ENFORCEMENT (was: test.skip)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Membership fixture that models the ONE database behaviour the seat guarantee
 * depends on: `SELECT ... FROM enterprise_tenants WHERE id = ? FOR UPDATE`
 * serializes membership writes for a tenant. The mutex below is that row lock.
 * (True multi-connection evidence runs in the MariaDB suite.)
 */
function seatPool({ seatQuota, activeMembers }) {
  const workspaceId = '8c2f3d10-5b6a-4c72-9f31-abcdefabcdef';
  const memberships = [];
  for (let index = 0; index < activeMembers; index += 1) {
    // The same deterministic id the registry derives for (tenant, principal),
    // which is what makes a re-invitation land on the existing row.
    const principalId = `seated-${index}`;
    memberships.push({ id: membershipDocumentId(TENANT_ID, principalId), principalId, status: 'ACTIVE' });
  }
  let lockHeld = false;
  const waiters = [];
  const acquire = async () => {
    if (!lockHeld) { lockHeld = true; return; }
    await new Promise(resolve => waiters.push(resolve));
  };
  const release = () => {
    const next = waiters.shift();
    if (next) next(); else lockHeld = false;
  };

  const pool = makePool((sql, params) => {
    if (sql.includes('FROM enterprise_workspaces WHERE id = ? AND tenantId = ? FOR UPDATE')) {
      return [[{ id: workspaceId, lifecycleState: 'ACTIVE' }]];
    }
    if (/SELECT id FROM enterprise_tenants WHERE id = \? FOR UPDATE/.test(sql)) {
      return acquire().then(() => [[{ id: TENANT_ID }]]);
    }
    if (sql.includes('FROM enterprise_memberships WHERE id = ? FOR UPDATE')) {
      const found = memberships.find(item => item.id === params[0]);
      const revision = found ? 1 : 0;
      return [found ? [{ id: found.id, principalId: found.principalId, revision }] : []];
    }
    if (/SELECT m\.\*, i\.recipientEmail/.test(sql)) {
      const member = memberships.find(item => item.id === params[0]) || memberships[memberships.length - 1];
      return [[{
        id: member.id, tenantId: TENANT_ID, principalId: member.principalId,
        workspaceId, status: 'ACTIVE', roles: JSON.stringify(['ENTERPRISE_MEMBER']), revision: 1,
      }]];
    }
    // Seat count (aggregate over the same join, so it must be matched first).
    if (sql.includes('SUM(CASE WHEN m.status')) {
      return [[{ active_members: memberships.length, pending_invites: 0, owners: 0 }]];
    }
    // Occupied-seat probe for one membership id.
    if (sql.includes('LEFT JOIN enterprise_membership_invitations i ON i.membershipId = m.id')) {
      const found = memberships.find(item => item.id === params[0]);
      return [found ? [{ status: found.status, invitationState: null, expiresAt: null }] : []];
    }
    if (/SELECT seat_quota FROM enterprise_tenants WHERE id = \?/.test(sql)) {
      return [[{ seat_quota: seatQuota }]];
    }
    if (sql.includes('FROM enterprise_tenant_configurations')) {
      return [[]];
    }
    if (sql.startsWith('INSERT INTO enterprise_memberships')) {
      const [id, , principalId] = params;
      const existing = memberships.find(item => item.id === id);
      if (existing) { existing.status = 'ACTIVE'; } else { memberships.push({ id, principalId, status: 'ACTIVE' }); }
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO enterprise_workspace_memberships')) return [{ affectedRows: 1 }];
    return [[]];
  });

  const originalRelease = () => {};
  pool.getConnection = async () => {
    let holds = false;
    const connection = {
      query: async (sql, params = []) => {
        if (/SELECT id FROM enterprise_tenants WHERE id = \? FOR UPDATE/.test(String(sql))) holds = true;
        return pool.query(sql, params);
      },
      beginTransaction: async () => {},
      commit: async () => { if (holds) { holds = false; release(); } },
      rollback: async () => { if (holds) { holds = false; release(); } },
      release: () => { if (holds) { holds = false; release(); } originalRelease(); },
    };
    return connection;
  };
  pool.memberships = memberships;
  pool.workspaceId = workspaceId;
  pool.heldLocks = () => waiters.length;
  return pool;
}

async function grant(pool, principalId, status = 'ACTIVE', invitation = null) {
  const registry = new MySqlTenantRegistry({ pool });
  return registry.grantMembership({
    tenantId: TENANT_ID,
    principalId,
    workspaceId: pool.workspaceId,
    roles: ['ENTERPRISE_MEMBER'],
    status,
    invitation,
  });
}

test('the tenant row is locked before seats are counted and the 409 contract is honoured', async () => {
  const pool = seatPool({ seatQuota: 3, activeMembers: 3 });
  await assert.rejects(
    () => grant(pool, 'newcomer-1'),
    error => {
      assert.equal(error.code, 'SEAT_LIMIT_REACHED');
      assert.equal(error.status, 409);
      return true;
    }
  );
  const statements = pool.calls.map(call => call.sql);
  const tenantLock = statements.findIndex(sql => /SELECT id FROM enterprise_tenants WHERE id = \? FOR UPDATE/.test(sql));
  const seatCount = statements.findIndex(sql => sql.includes('SUM(CASE WHEN m.status'));
  const membershipInsert = statements.findIndex(sql => sql.startsWith('INSERT INTO enterprise_memberships'));
  assert.ok(tenantLock >= 0, 'the tenant row lock is the serialization point');
  assert.ok(tenantLock < seatCount, 'the lock must be taken before the count');
  assert.equal(membershipInsert, -1, 'a rejected invitation must never reach the membership write');
  assert.equal(pool.memberships.length, 3, 'a rejected invitation must not create a membership');
});

test('a re-invitation of an already seated principal does not consume a second seat', async () => {
  const pool = seatPool({ seatQuota: 2, activeMembers: 2 });
  const existing = pool.memberships[0];
  // The principal already occupies a seat: the guard must not reject or double count.
  const result = await grant(pool, existing.principalId);
  assert.equal(result.principalId, existing.principalId);
  assert.equal(pool.memberships.length, 2);
});

test('ten concurrent invitations with one free seat allocate exactly one', async () => {
  const pool = seatPool({ seatQuota: 5, activeMembers: 4 });
  const attempts = Array.from({ length: 10 }, (_, index) => grant(pool, `concurrent-${index}`)
    .then(() => 'GRANTED')
    .catch(error => error.code || 'FAILED'));

  const results = await Promise.all(attempts);
  assert.equal(results.filter(result => result === 'GRANTED').length, 1, `exactly one grant: ${JSON.stringify(results)}`);
  assert.equal(results.filter(result => result === 'SEAT_LIMIT_REACHED').length, 9);
  assert.equal(pool.memberships.length, 5, 'ACTIVE + INVITED can never exceed the purchased quota');
  assert.equal(pool.heldLocks(), 0, 'every waiter must be released; no lock may leak');
  const statements = pool.calls.map(call => call.sql);
  const firstLock = statements.findIndex(sql => /SELECT id FROM enterprise_tenants WHERE id = \? FOR UPDATE/.test(sql));
  const firstCount = statements.findIndex(sql => sql.includes('SUM(CASE WHEN m.status'));
  const firstInsert = statements.findIndex(sql => sql.startsWith('INSERT INTO enterprise_memberships'));
  assert.ok(firstLock >= 0 && firstLock < firstCount && firstCount < firstInsert,
    'the granted invitation took the tenant lock, then counted, then wrote');
});

test('reactivation cannot exceed the quota', async () => {
  const pool = seatPool({ seatQuota: 2, activeMembers: 2 });
  await assert.rejects(
    () => grant(pool, 'reactivated-principal'),
    { code: 'SEAT_LIMIT_REACHED', status: 409 }
  );
  assert.equal(pool.memberships.length, 2);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. IMMEDIATE OPERATOR SESSION REVOCATION (was: test.skip)
// ═══════════════════════════════════════════════════════════════════════════

function revocationPool(cutoffSeconds = null, { failInsert = false, uid = '*', targetUid = null } = {}) {
  const pool = makePool((sql, params) => {
    if (sql.includes('UNIX_TIMESTAMP(revoked_at) AS cutoff')) {
      // Cutoffs are per user: revoking one operator must never affect another.
      const requestedUid = params[0];
      if (uid !== '*' && requestedUid !== uid) return [[]];
      const perUser = pool.cutoffs.get(requestedUid);
      const cutoff = perUser ?? pool.latestCutoff ?? cutoffSeconds;
      return [cutoff === null || cutoff === undefined ? [] : [{ cutoff: String(cutoff) }]];
    }
    if (sql.startsWith('INSERT INTO revoked_sessions')) {
      if (failInsert) throw Object.assign(new Error('insert failed'), { code: 'ER_LOCK_WAIT_TIMEOUT' });
      const [id, userId] = params;
      pool.inserted = { id, userId, params };
      pool.latestCutoff = Math.floor(Date.now() / 1000);
      pool.cutoffs.set(userId, pool.latestCutoff);
      return [{ affectedRows: 1 }];
    }
    if (/FROM revoked_sessions WHERE id = \?/.test(sql)) {
      return [[{
        id: pool.inserted.id, user_id: pool.inserted.userId, scope: 'USER',
        cutoff: String(pool.latestCutoff), expires_at: null, reason: null, revoked_by: null,
      }]];
    }
    return [[]];
  });
  pool.cutoffs = new Map();
  return pool;
}

test('a token issued at or before the revocation cutoff is rejected with SESSION_REVOKED', async () => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  currentPool = revocationPool(nowSeconds - 10, { uid: 'operator-1' });
  await assert.rejects(
    () => sessionRevocation.assertSessionActive({ uid: 'operator-1', issuedAt: nowSeconds - 60 }),
    { code: 'SESSION_REVOKED' }
  );
  // The exact cutoff second is rejected too: a token minted in the same second as
  // the revocation is indistinguishable from one issued just before it.
  await assert.rejects(
    () => sessionRevocation.assertSessionActive({ uid: 'operator-1', issuedAt: nowSeconds - 10 }),
    { code: 'SESSION_REVOKED' }
  );
  // A session established after the revocation is valid.
  await sessionRevocation.assertSessionActive({ uid: 'operator-1', issuedAt: nowSeconds - 9 });
  // A user with no revocation is unaffected.
  await sessionRevocation.assertSessionActive({ uid: 'operator-2', issuedAt: 1 });
});

test('tokens without a trustworthy issue time fail closed once a revocation exists', async () => {
  currentPool = revocationPool(Math.floor(Date.now() / 1000) - 5);
  await assert.rejects(
    () => sessionRevocation.assertSessionActive({ uid: 'operator-1', issuedAt: 0 }),
    { code: 'SESSION_REVOKED' }
  );
});

test('a revocation lookup failure never permits the request', async () => {
  currentPool = makePool(async () => { throw new Error('database down'); });
  await assert.rejects(
    () => sessionRevocation.assertSessionActive({ uid: 'operator-1', issuedAt: Math.floor(Date.now() / 1000) }),
    { code: 'SESSION_REVOCATION_UNAVAILABLE' }
  );
});

test('requireAuth rejects a revoked token and optionalAuth never grants identity to one', async () => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  currentPool = revocationPool(nowSeconds - 10);
  auth.setTokenVerifierForTests(async token => {
    if (token === 'old-token') return { uid: 'operator-1', iat: nowSeconds - 100, exp: nowSeconds + 3600 };
    if (token === 'new-token') return { uid: 'operator-1', iat: nowSeconds, exp: nowSeconds + 3600 };
    if (token === 'no-iat') return { uid: 'operator-1' };
    throw new Error('invalid token');
  });

  const app = express();
  app.get('/private', auth.requireAuth, (req, res) => res.json({ uid: req.user.uid }));
  app.get('/public', auth.optionalAuth, (req, res) => res.json({ uid: req.user?.uid || null }));

  let res = await request(app).get('/private').set('Authorization', 'Bearer old-token');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'SESSION_REVOKED');

  res = await request(app).get('/private').set('Authorization', 'Bearer no-iat');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'SESSION_REVOKED');

  res = await request(app).get('/private').set('Authorization', 'Bearer new-token');
  assert.equal(res.status, 200);
  assert.equal(res.body.uid, 'operator-1');

  res = await request(app).get('/public').set('Authorization', 'Bearer old-token');
  assert.equal(res.status, 200);
  assert.equal(res.body.uid, null, 'a public surface must not adopt a revoked identity');

  res = await request(app).get('/private').set('Authorization', 'Bearer new-token');
  assert.equal(res.status, 200);
});

test('requireAuth fails closed with 503 when revocation state cannot be established', async () => {
  currentPool = makePool(async () => { throw new Error('database down'); });
  auth.setTokenVerifierForTests(async () => ({ uid: 'operator-9', iat: Math.floor(Date.now() / 1000) }));
  const app = express();
  app.get('/private', auth.requireAuth, (req, res) => res.json({ uid: req.user.uid }));
  const res = await request(app).get('/private').set('Authorization', 'Bearer any');
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'SESSION_REVOCATION_UNAVAILABLE');
});

test('SUPER_ADMIN revocation endpoint persists a cutoff, is idempotent and refuses unknown operators', async () => {
  sessionRevocation.resetForTests();
  currentPool = revocationPool(null);
  const app = express();
  app.use(express.json());
  app.use(asUser('SUPER_ADMIN'));
  app.use('/api/platform', platformRouter);
  app.set('firebaseAdmin', {
    auth: () => ({
      getUser: async uid => {
        if (uid === 'ghost-operator') throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
        return { uid, email: `${uid}@platform.local` };
      },
      revokeRefreshTokens: async () => true,
    }),
  });

  let res = await request(app).post('/api/platform/operators/ops-target/revoke-session').send({ reason: 'suspected compromise' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.revokedUid, 'ops-target');
  const insert = currentPool.calls.find(call => call.sql.startsWith('INSERT INTO revoked_sessions'));
  assert.ok(insert, 'the durable cutoff must be written');
  assert.equal(insert.params[1], 'ops-target');
  assert.match(insert.sql, /CURRENT_TIMESTAMP\(3\)/);

  // Repeating the request is safe and produces a second, non-regressing cutoff.
  res = await request(app).post('/api/platform/operators/ops-target/revoke-session').send({});
  assert.equal(res.status, 200);
  assert.equal(currentPool.calls.filter(call => call.sql.startsWith('INSERT INTO revoked_sessions')).length, 2);

  // The historical path is the same handler, not a weaker one.
  res = await request(app).post('/api/platform/operators/ops-target/revoke-sessions').send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.revokedUid, 'ops-target');

  res = await request(app).post('/api/platform/operators/ghost-operator/revoke-session').send({});
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'USER_NOT_FOUND');

  // A revocation that could not be persisted must never be reported as success.
  currentPool = revocationPool(null, { failInsert: true });
  res = await request(app).post('/api/platform/operators/ops-target/revoke-session').send({});
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'SESSION_REVOCATION_FAILED');
  assert.equal(res.body.success, undefined);
});

test('a revocation performed through the API immediately invalidates the target token in-process', async () => {
  sessionRevocation.resetForTests();
  const nowSeconds = Math.floor(Date.now() / 1000);
  currentPool = revocationPool(null);
  const app = express();
  app.use(express.json());
  app.use(asUser('SUPER_ADMIN'));
  app.use('/api/platform', platformRouter);
  app.set('firebaseAdmin', {
    auth: () => ({ getUser: async uid => ({ uid, email: `${uid}@platform.local` }), revokeRefreshTokens: async () => true }),
  });

  const privateApp = express();
  auth.setTokenVerifierForTests(async () => ({ uid: 'ops-target', iat: nowSeconds - 30 }));
  privateApp.get('/private', auth.requireAuth, (req, res) => res.json({ uid: req.user.uid }));

  let res = await request(privateApp).get('/private').set('Authorization', 'Bearer t');
  assert.equal(res.status, 200);

  res = await request(app).post('/api/platform/operators/ops-target/revoke-session').send({});
  assert.equal(res.status, 200);

  // The same token, seconds later, is now rejected without waiting for expiry.
  res = await request(privateApp).get('/private').set('Authorization', 'Bearer t');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'SESSION_REVOKED');
});

test('only SUPER_ADMIN may revoke sessions', async () => {
  currentPool = revocationPool(null);
  for (const role of ['ADMIN', 'SUPPORT', 'USER', 'EMPLOYER', 'ENTERPRISE_ADMIN']) {
    const app = express();
    app.use(express.json());
    app.use(asUser(role));
    app.use('/api/platform', platformRouter);
    app.set('firebaseAdmin', { auth: () => ({ getUser: async uid => ({ uid }), revokeRefreshTokens: async () => true }) });
    const res = await request(app).post('/api/platform/operators/target/revoke-session').send({});
    assert.equal(res.status, 403, role);
    assert.equal(currentPool.calls.some(call => call.sql.startsWith('INSERT INTO revoked_sessions')), false, role);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. WEBHOOK SIGNATURE VERIFICATION AND DUPLICATE SUPPRESSION (was: test.skip)
// ═══════════════════════════════════════════════════════════════════════════

const WEBHOOK_SECRET = 'whsec_test_mandate12_secret';

function stripeHeader(payload, { timestamp = Math.floor(Date.now() / 1000), secret = WEBHOOK_SECRET } = {}) {
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

test('Stripe webhooks: authentic signatures verify and forgeries are rejected', () => {
  const payload = Buffer.from(JSON.stringify({ id: 'evt_authentic', type: 'payment_intent.succeeded' }));
  const timestamp = Math.floor(Date.now() / 1000);
  const header = stripeHeader(payload.toString('utf8'), { timestamp });

  const verified = webhookGuard.verifyStripeSignature({ rawBody: payload, header, secret: WEBHOOK_SECRET, nowMs: timestamp * 1000 });
  assert.equal(verified.timestamp, timestamp);

  // Wrong secret.
  assert.throws(
    () => webhookGuard.verifyStripeSignature({ rawBody: payload, header, secret: 'whsec_wrong', nowMs: timestamp * 1000 }),
    error => error.code === 'STRIPE_SIGNATURE_INVALID'
  );
  // Tampered body under a valid header.
  const tampered = Buffer.from(JSON.stringify({ id: 'evt_forged', type: 'payment_intent.succeeded' }));
  assert.throws(
    () => webhookGuard.verifyStripeSignature({ rawBody: tampered, header, secret: WEBHOOK_SECRET, nowMs: timestamp * 1000 }),
    error => error.code === 'STRIPE_SIGNATURE_INVALID'
  );
  // Missing / malformed header.
  assert.throws(
    () => webhookGuard.verifyStripeSignature({ rawBody: payload, header: '', secret: WEBHOOK_SECRET, nowMs: timestamp * 1000 }),
    error => error.code === 'STRIPE_SIGNATURE_MALFORMED'
  );
  assert.throws(
    () => webhookGuard.verifyStripeSignature({ rawBody: payload, header: 't=abc,v1=def', secret: WEBHOOK_SECRET, nowMs: timestamp * 1000 }),
    error => error.code === 'STRIPE_SIGNATURE_MALFORMED'
  );
  // No signing secret configured must fail closed.
  assert.throws(
    () => webhookGuard.verifyStripeSignature({ rawBody: payload, header, secret: '', nowMs: timestamp * 1000 }),
    error => error.code === 'WEBHOOK_SIGNING_SECRET_UNAVAILABLE'
  );
});

test('Stripe webhooks: replayed deliveries outside the 300s window are rejected', () => {
  const payload = Buffer.from(JSON.stringify({ id: 'evt_replayed' }));
  const timestamp = Math.floor(Date.now() / 1000);
  const header = stripeHeader(payload.toString('utf8'), { timestamp });

  // Just inside the window: accepted.
  webhookGuard.verifyStripeSignature({ rawBody: payload, header, secret: WEBHOOK_SECRET, nowMs: (timestamp + 300) * 1000 });
  // Outside the window: rejected even though the HMAC is perfect.
  assert.throws(
    () => webhookGuard.verifyStripeSignature({ rawBody: payload, header, secret: WEBHOOK_SECRET, nowMs: (timestamp + 301) * 1000 }),
    error => error.code === 'STRIPE_SIGNATURE_REPLAY_WINDOW'
  );
  assert.throws(
    () => webhookGuard.verifyStripeSignature({ rawBody: payload, header, secret: WEBHOOK_SECRET, nowMs: (timestamp - 301) * 1000 }),
    error => error.code === 'STRIPE_SIGNATURE_REPLAY_WINDOW'
  );
  // The window cannot be widened by the caller.
  assert.throws(
    () => webhookGuard.verifyStripeSignature({ rawBody: payload, header, secret: WEBHOOK_SECRET, toleranceSeconds: 100000, nowMs: (timestamp + 301) * 1000 }),
    error => error.code === 'STRIPE_SIGNATURE_REPLAY_WINDOW'
  );
});

test('Stripe webhooks: rotated keys with multiple v1 signatures still verify', () => {
  const payload = '{"id":"evt_rotated"}';
  const timestamp = Math.floor(Date.now() / 1000);
  const current = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest('hex');
  const previous = crypto.createHmac('sha256', 'whsec_previous').update(`${timestamp}.${payload}`).digest('hex');
  const header = `t=${timestamp},v1=${previous},v1=${current}`;
  assert.equal(
    webhookGuard.verifyStripeSignature({ rawBody: payload, header, secret: WEBHOOK_SECRET, nowMs: timestamp * 1000 }).timestamp,
    timestamp
  );
});

test('Razorpay callbacks: HMAC over orderId|paymentId verifies and forgeries are rejected', () => {
  const orderId = 'order_MANDATE12';
  const paymentId = 'pay_MANDATE12';
  const secret = 'rzp_test_secret';
  const signature = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

  assert.equal(webhookGuard.verifyRazorpaySignature({ secret, orderId, paymentId, signature }), true);
  assert.throws(
    () => webhookGuard.verifyRazorpaySignature({ secret, orderId, paymentId: 'pay_OTHER', signature }),
    error => error.code === 'RAZORPAY_SIGNATURE_INVALID'
  );
  assert.throws(
    () => webhookGuard.verifyRazorpaySignature({ secret, orderId, paymentId, signature: signature.slice(0, -2) + '00' }),
    error => error.code === 'RAZORPAY_SIGNATURE_INVALID'
  );
  assert.throws(
    () => webhookGuard.verifyRazorpaySignature({ secret, orderId, paymentId, signature: '' }),
    error => error.code === 'RAZORPAY_SIGNATURE_MISSING'
  );
  assert.throws(
    () => webhookGuard.verifyRazorpaySignature({ secret: '', orderId, paymentId, signature }),
    error => error.code === 'WEBHOOK_SIGNING_SECRET_UNAVAILABLE'
  );
});

test('webhook rejections are enumerable and leak neither secrets nor signatures', () => {
  const rejection = webhookGuard.toWebhookRejection(
    Object.assign(new Error(`No signatures found matching the expected signature for whsec_${WEBHOOK_SECRET}`), { type: 'StripeSignatureVerificationError' })
  );
  assert.ok([400, 401].includes(rejection.status));
  assert.ok(/^[A-Z0-9_]+$/.test(rejection.code));
  const body = JSON.stringify(webhookGuard.webhookRejectionBody(rejection.code, 'req-1'));
  assert.doesNotMatch(body, /whsec|StripeSignatureVerificationError/i);
  assert.doesNotMatch(body, /v1=|\b[a-f0-9]{64}\b/, 'no signature material may reach the caller');
});

test('duplicate webhook events are suppressed by the durable idempotency ledger', async () => {
  const seen = new Set();
  currentPool = makePool((sql, params) => {
    if (/INSERT INTO payment_webhook_events/.test(sql)) {
      const eventId = params[0];
      if (seen.has(eventId)) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY', errno: 1062 });
      seen.add(eventId);
      return [{ affectedRows: 1 }];
    }
    return [[]];
  });
  const repository = new MySQLRepository();

  const first = await repository.claimWebhookEvent({ eventId: 'evt_dup_1', provider: 'stripe', eventType: 'payment_intent.succeeded', orderId: 'ord_1' });
  assert.equal(first.duplicate, false);
  const second = await repository.claimWebhookEvent({ eventId: 'evt_dup_1', provider: 'stripe', eventType: 'payment_intent.succeeded', orderId: 'ord_1' });
  assert.equal(second.duplicate, true, 'a replayed delivery must be recognised, not re-credited');

  // A ledger that cannot be reached is a hard failure, never a silent pass.
  currentPool = makePool(async () => { throw new Error('ledger down'); });
  await assert.rejects(() => new MySQLRepository().claimWebhookEvent({ eventId: 'evt_dup_2', provider: 'stripe' }));
});
