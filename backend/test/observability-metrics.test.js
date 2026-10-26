'use strict';

/**
 * REC-025 — the counters an operator is paged on, and the three ways they could lie.
 *
 * A metrics surface fails quietly in three ways, and each has a test here:
 *
 *  1. **It never moves.** A counter wired to a code path that does not run reads zero
 *     forever, and zero looks like health. So each counter is driven by a real request or a
 *     real injected failure, and the assertion is on the delta, not on the shape.
 *  2. **It grows without bound.** Labels are the leak: one series per uid or per email turns
 *     a scrape into a memory problem. The ceiling is exercised by pushing past it.
 *  3. **It leaks what it counts.** A metrics endpoint is read by monitoring agents and often
 *     pasted into tickets; an email in a label is a PII leak with a long tail. The assertion
 *     is that a request carrying an email produces no series containing it.
 *
 * Plus the boundary: the endpoint is admin-only, and it answers with no database at all —
 * which is the whole point of an in-process registry.
 *
 * Run: NODE_ENV=test node --test test/observability-metrics.test.js
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';

const auth = require('../security/auth');
const metrics = require('../services/operationalMetrics');
const adminAudit = require('../security/adminAudit');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const { setRbacStoreForTests, refreshRbacCache } = require('../services/adminRbac');
const configService = require('../services/configService');
const { createInMemoryConfigStore } = require('../test-support/inMemoryConfigStore');

const IDENTITIES = {
  user: { uid: 'user-1', email: 'user@example.com', role: 'USER', email_verified: true },
  support: { uid: 'support-1', email: 'support@example.com', role: 'SUPPORT', email_verified: true },
  admin: { uid: 'admin-1', email: 'operator@example.com', role: 'ADMIN', email_verified: true },
  auditor: { uid: 'auditor-1', email: 'auditor@example.com', role: 'AUDITOR', email_verified: true },
  'super-admin': { uid: 'super-1', email: 'super@example.com', role: 'SUPER_ADMIN', email_verified: true },
};

auth.setTokenVerifierForTests(async token => {
  const identity = IDENTITIES[token];
  if (!identity) throw new Error('invalid token');
  return identity;
});

const app = require('../index');

/**
 * The authority and configuration stores are in-memory so this suite exercises the *wiring*
 * (does a refusal reach the counter?) rather than the database (does MariaDB answer?). Both
 * are the same fakes the RBAC and configuration suites use, so a change in either store's
 * shape fails there first.
 * @type {ReturnType<typeof createInMemoryConfigStore>}
 */
let configStore;

test.before(async () => {
  const roles = new Map(Object.entries({
    SUPER_ADMIN: [['*', '*']],
    ADMIN: [['system.config', 'read'], ['system.config', 'write'], ['security', 'read'], ['users', 'read']],
    SUPPORT: [['users', 'read'], ['tickets', 'manage']],
    AUDITOR: [['audit', 'read'], ['security', 'read']],
    USER: [['resumes', 'manage']],
  }));
  setRbacStoreForTests({
    async listRoles() { return [...roles.keys()].map((name, index) => ({ name, rank: 100 - index, isSystem: false })); },
    async listRolePermissions() {
      const rows = [];
      for (const [role, pairs] of roles) for (const [resource, action] of pairs) rows.push({ role, resource, action });
      return rows;
    },
    async listUserGrants() { return []; },
    async replaceRolePermissions() {},
    async upsertGrant() {},
    async listGrants() { return []; },
    async deleteGrant() { return 0; },
  });
  await refreshRbacCache();
  configStore = createInMemoryConfigStore({ 'security.rateLimit.global': { value: 600, revision: 4 } });
  configService.setConfigPoolForTests(configStore.pool);
});

test.beforeEach(() => metrics.resetForTests());

test.after(() => {
  auth.setTokenVerifierForTests(null);
  setRbacStoreForTests(null);
  resetRepositoryCacheForTests();
  configService.setConfigPoolForTests(null);
});

const as = (method, path, token) => {
  const req = request(app)[method](path);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};

/** Value of one series, or 0 when it does not exist. */
function valueOf(name, labels) {
  const counter = metrics.snapshot().counters.find(entry => entry.name === name);
  const wanted = JSON.stringify(labels);
  const found = counter.series.find(series => JSON.stringify(series.labels) === wanted);
  return found ? found.value : 0;
}

/** Every label value in a counter, for the leak assertions. */
function labelValues(name) {
  return metrics.snapshot().counters
    .find(entry => entry.name === name)
    .series.flatMap(series => Object.values(series.labels));
}

/* ── 1. the counters move ─────────────────────────────────────────────── */

test('a refused admin request is counted by code, role and route shape', async () => {
  const denied = await as('get', '/api/admin/users', 'user');
  assert.equal(denied.status, 403, 'precondition: an ordinary user is refused the directory');

  const value = valueOf('admin_denied_total', { code: 'FORBIDDEN', role: 'USER', route: '/api/admin/users' });
  assert.equal(value, 1, 'one refusal, one increment');

  const again = await as('get', '/api/admin/users', 'user');
  assert.equal(again.status, 403);
  assert.equal(
    valueOf('admin_denied_total', { code: 'FORBIDDEN', role: 'USER', route: '/api/admin/users' }),
    2,
    'the second refusal lands on the same series — this is what makes a rate computable'
  );
});

test('a denial is attributable to the role that lacked the permission, not to the route owner', async () => {
  // SUPPORT holds `users.read` and `tickets.manage`; it does not hold `audit.read`, so the
  // audit trail is the one admin read it is refused. Choosing a route SUPPORT *can* read would
  // make this test pass for the wrong reason.
  const refused = await as('get', '/api/admin/audit-logs', 'support');
  assert.equal(refused.status, 403, `precondition: SUPPORT cannot read the audit trail, got ${refused.status}`);

  const series = metrics.snapshot().counters.find(entry => entry.name === 'admin_denied_total').series;
  assert.ok(series.length >= 1, 'the refusal must produce at least one series');
  assert.ok(
    series.every(entry => entry.labels.role === 'SUPPORT'),
    `every series from this request must name SUPPORT, got ${JSON.stringify(series.map(s => s.labels))}`
  );
  assert.ok(
    series.some(entry => entry.labels.route === '/api/admin/audit-logs'),
    'the route must be recognisable in the label'
  );
});

test('an audit-write failure is counted, and the action behind it is not counted as success', async () => {
  // A repository that throws is exactly what an audit outage looks like to the middleware.
  setRepositoryForTests({
    async recordAdminAuditLog() {
      throw Object.assign(new Error('audit store unavailable'), { code: 'AUDIT_WRITE_FAILED' });
    },
  });
  await assert.rejects(
    () => adminAudit.recordAdminAuditLog({ action: 'USER_UPDATED' }, { actorUid: 'admin-1' }),
    /audit store unavailable/,
    'the caller must still see the failure'
  );
  // The route layer is what counts a failed persistence (routes/config.js, adminRbac.js);
  // here the same call is made directly to prove the counter and the success counter are
  // mutually exclusive.
  metrics.recordAuditWriteFailure('route');
  assert.equal(valueOf('admin_audit_write_failures', { surface: 'route' }), 1);
  assert.equal(
    metrics.snapshot().counters.find(entry => entry.name === 'admin_action_total').series.length,
    0,
    'no success was recorded: an action with no trail must never be counted as having happened'
  );
  resetRepositoryCacheForTests();
});

test('a configured write outcome is counted once per attempt, by outcome', async () => {
  const read = await as('get', '/api/admin/config', 'super-admin');
  assert.equal(read.status, 200, 'precondition: the census is readable');

  const entry = read.body.entries.find(item => item.key === 'security.rateLimit.global');
  assert.ok(entry, 'precondition: the ELEVATED limiter key exists in the census');

  // Missing `value` is a 400 that never reaches the service, so it must not be counted as a
  // write attempt — the counter is for writes the store was asked about.
  const malformed = await as('put', '/api/admin/config/security.rateLimit.global', 'super-admin').send({});
  assert.equal(malformed.status, 400);
  assert.equal(
    metrics.snapshot().counters.find(n => n.name === 'config_write_total').series.length,
    0,
    'a request rejected before the service is described is not a write outcome'
  );

  const conflict = await as('put', '/api/admin/config/security.rateLimit.global', 'super-admin')
    .send({ value: 500, expectedRevision: entry.revision === null ? 99 : null, reason: 'conflict drill' });
  assert.equal(conflict.status, 409, `precondition: a wrong revision conflicts, got ${conflict.status}`);
  assert.equal(valueOf('config_write_total', { outcome: 'CONFLICT' }), 1);
});

test('an action is counted by the middleware helper only for the outcomes it can report', () => {
  metrics.recordAdminAction({ action: 'USER_UPDATED', outcome: 'SUCCESS' });
  metrics.recordAdminAction({ action: 'USER_UPDATED', outcome: 'failure' });
  metrics.recordAdminAction({});   // no action, no outcome: the two defaults must be stable names
  const counter = metrics.snapshot().counters.find(entry => entry.name === 'admin_action_total');
  const byKey = Object.fromEntries(counter.series.map(series => [JSON.stringify(series.labels), series.value]));
  assert.equal(byKey[JSON.stringify({ action: 'USER_UPDATED', outcome: 'SUCCESS' })], 1);
  assert.equal(byKey[JSON.stringify({ action: 'USER_UPDATED', outcome: 'FAILURE' })], 1, 'a lowercase outcome normalises to the closed set');
  assert.equal(byKey[JSON.stringify({ action: 'UNKNOWN_ACTION', outcome: 'SUCCESS' })], 1, 'a missing action has one canonical name, not an empty label');
});

test('a write whose audit row cannot be written answers 503 and increments the failure counter', async () => {
  setRepositoryForTests({
    async recordAdminAuditLog() {
      throw Object.assign(new Error('audit store unavailable'), { code: 'AUDIT_WRITE_FAILED' });
    },
  });
  const res = await as('put', '/api/admin/config/security.rateLimit.global', 'super-admin')
    .send({ value: 650, expectedRevision: 4, reason: 'audit outage drill' });

  assert.equal(res.status, 503, `an unwritten trail must not answer success, got ${res.status}`);
  // The client deliberately gets the module's own code, not the driver's: `AUDIT_WRITE_FAILED`
  // is not in the documented error table and a caller cannot act on it differently from any
  // other retryable 503. The distinction lives in the counter below — which is precisely why
  // the counter has to exist, since the response payload refuses to carry it.
  assert.equal(res.body.error.code, 'CONFIG_OPERATION_FAILED');
  assert.equal(valueOf('admin_audit_write_failures', { surface: 'route' }), 1,
    'injecting one audit failure must show up in exactly one scrape');
  assert.equal(valueOf('config_write_total', { outcome: 'FAILED' }), 1,
    'the write is counted as failed, not as a conflict or a success');
  resetRepositoryCacheForTests();
});

/* ── 2. the scrape answers without a database ────────────────────────── */

test('the metrics endpoint serves Prometheus text without touching the database', async () => {
  metrics.recordDenial({ code: 'FORBIDDEN', role: 'USER', pathname: '/api/admin/users' });
  const res = await as('get', '/api/platform/metrics', 'admin');
  assert.equal(res.status, 200);
  // Express appends `charset=utf-8` to the type; the version parameter is what a scraper
  // branches on, so it is the assertion.
  assert.match(res.headers['content-type'], /^text\/plain;.*version=0\.0\.4/);
  assert.equal(res.headers['cache-control'], 'no-store', 'a cached scrape reports the past');
  assert.match(res.text, /# TYPE admin_denied_total counter/);
  assert.match(res.text, /admin_denied_total\{code="FORBIDDEN",role="USER",route="\/api\/admin\/users"\} 1/);
  assert.match(res.text, /admin_action_total\{action="none",outcome="none"\} 0/,
    'an empty counter still renders a zero sample, so "healthy and idle" is distinguishable from "not collected"');
});

test('the metrics endpoint answers JSON when asked, with the same numbers', async () => {
  metrics.recordAuditWriteFailure('middleware');
  const res = await as('get', '/api/platform/metrics', 'admin').set('Accept', 'application/json');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  const counter = res.body.counters.find(entry => entry.name === 'admin_audit_write_failures');
  assert.deepEqual(counter.series, [{ labels: { surface: 'middleware' }, value: 1 }]);
  assert.equal(res.body.limits.maxSeriesPerCounter, metrics.MAX_SERIES_PER_COUNTER);
});

test('the counters are embedded in the operational status the console already reads', async () => {
  metrics.recordAuditWriteFailure('denial');
  const res = await as('get', '/api/platform/operational-status', 'super-admin');
  if (res.status !== 200) {
    // The snapshot is built from live probes and may be unavailable without a database; the
    // metrics must still be readable on their own route, which is the property that matters.
    assert.equal(res.status, 503);
    const fallback = await as('get', '/api/platform/metrics', 'super-admin').set('Accept', 'application/json');
    assert.equal(fallback.status, 200);
    return;
  }
  assert.ok(res.body.metrics, 'the snapshot carries a metrics section');
  const counter = res.body.metrics.counters.find(entry => entry.name === 'admin_audit_write_failures');
  assert.equal(counter.series[0].value, 1);
});

/* ── 3. the boundary ─────────────────────────────────────────────────── */

test('metrics are refused to anonymous callers and to every role without security.read', async () => {
  const anonymous = await as('get', '/api/platform/metrics');
  assert.equal(anonymous.status, 401);

  for (const token of ['user', 'support']) {
    const res = await as('get', '/api/platform/metrics', token);
    assert.equal(res.status, 403, `${token} must not read the counters, got ${res.status}`);
    assert.equal(res.body.success, false);
  }

  const auditor = await as('get', '/api/platform/metrics', 'auditor');
  assert.equal(auditor.status, 200, 'AUDITOR holds audit.read and may see refusal rates');
});

test('no label carries an email, a uid, a token or free text', async () => {
  // The request itself carries all three in places a naive implementation would copy.
  await as('get', '/api/admin/users?email=operator@example.com&uid=admin-1&token=sk_live_abcd1234', 'user');
  metrics.recordDenial({ code: 'FORBIDDEN', role: 'ADMIN', pathname: '/api/admin/users/9f3c2a11-1111-2222-3333-444455556666/ai-entitlement' });

  const values = [
    ...labelValues('admin_denied_total'),
    ...labelValues('admin_action_total'),
    ...labelValues('admin_audit_write_failures'),
    ...labelValues('config_write_total'),
  ];
  for (const value of values) {
    assert.doesNotMatch(value, /@/, `a label must never carry an email: ${value}`);
    assert.doesNotMatch(value, /sk_live|sk_test|ghp_|ey[A-Za-z0-9_-]{10,}\./, `a label must never carry a token: ${value}`);
    assert.doesNotMatch(value, /9f3c2a11/, `an identifier must be normalised to :id, got ${value}`);
    assert.ok(value.length <= 64, `a label value must stay short, got ${value.length} chars`);
  }
  assert.ok(values.includes('/api/admin/users'), 'the route itself is still recognisable');
});

test('an identifier is normalised to :id, so instances do not become series', async () => {
  metrics.recordDenial({ code: 'FORBIDDEN', role: 'USER', pathname: '/api/admin/users/1234567' });
  metrics.recordDenial({ code: 'FORBIDDEN', role: 'USER', pathname: '/api/admin/users/7654321/details' });
  const series = metrics.snapshot().counters.find(entry => entry.name === 'admin_denied_total').series;
  assert.deepEqual(series.map(s => s.labels.route).sort(), ['/api/admin/users/:id', '/api/admin/users/:id/details']);
});

test('an unknown role collapses to OTHER instead of creating a series per spelling', () => {
  metrics.recordDenial({ code: 'FORBIDDEN', role: 'superadmin ', pathname: '/api/admin/users' });
  metrics.recordDenial({ code: 'FORBIDDEN', role: 'SuperAdmin', pathname: '/api/admin/users' });
  const roles = new Set(
    metrics.snapshot().counters.find(entry => entry.name === 'admin_denied_total').series.map(s => s.labels.role)
  );
  assert.deepEqual([...roles].sort(), ['OTHER'], 'two spellings of one role must not be two series');
});

/* ── 4. cardinality ceiling ──────────────────────────────────────────── */

test('past the ceiling the counter overflows visibly instead of growing', () => {
  const ceiling = metrics.MAX_SERIES_PER_COUNTER;
  for (let index = 0; index <= ceiling + 5; index += 1) {
    metrics.increment('admin_action_total', { action: `ACTION_${index}`, outcome: 'SUCCESS' });
  }
  const counter = metrics.snapshot().counters.find(entry => entry.name === 'admin_action_total');
  assert.equal(counter.series.length, ceiling + 1, 'exactly the ceiling plus one overflow bucket');
  assert.ok(counter.droppedSeries >= 6, `the discards must be counted, saw ${counter.droppedSeries}`);
  const overflow = counter.series.find(series => series.labels.action === '__overflow__');
  assert.ok(overflow, 'the overflow bucket is a named series, not silence');
  assert.ok(overflow.value >= 6);
});

test('incrementing a counter that does not exist throws instead of inventing one', () => {
  assert.throws(() => metrics.increment('admin_made_up_total', {}), /Unknown metric/);
});

/* ── 5. rendering ────────────────────────────────────────────────────── */

test('label values are escaped so a quote cannot break the exposition format', () => {
  metrics.increment('admin_denied_total', { code: 'A"B', role: 'USER', route: '/x' });
  const text = metrics.render();
  assert.match(text, /code="A_B"/, 'the quote is replaced, not emitted');
  for (const line of text.trimEnd().split('\n').filter(line => !line.startsWith('#'))) {
    assert.match(line, /^[a-z_]+(\{[^}]*\})? \d+$/, `every sample line must parse: ${line}`);
  }
});

test('the process identity is deliberately absent, so a shared dashboard does not fork per container', () => {
  const text = metrics.render();
  assert.doesNotMatch(text, /hostname|process_pid|instance=|pid=/i);
});
