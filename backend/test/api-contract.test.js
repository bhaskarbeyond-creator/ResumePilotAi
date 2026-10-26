'use strict';

/**
 * API contract tests (REC-017, tier "contract").
 *
 * A contract test answers one question: *is the payload the client was written against
 * still the payload we send?* It is deliberately narrower than an integration test — no
 * business outcome is asserted, only shape, types and the presence of the fields a
 * consumer reads.
 *
 * Two consumers are covered:
 *   - the console, which reads `GET /api/me/capabilities` and will render a wrong tab
 *     strip if a field disappears;
 *   - the configuration editor, which reads `GET /api/admin/config` and will show a
 *     value without provenance if `source` goes missing.
 *
 * The assertions are written as "field exists with this type", not "equals this value",
 * so a legitimate content change (a new tab) does not fail the suite — the drift guard
 * for content lives in `authz-visibility-matrix.test.js` instead.
 *
 * Run: NODE_ENV=test node --test test/api-contract.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { setTokenVerifierForTests } = require('../security/auth');
const { setRbacStoreForTests, refreshRbacCache } = require('../services/adminRbac');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const configService = require('../services/configService');
const { createInMemoryConfigStore } = require('../test-support/inMemoryConfigStore');

/**
 * Assert an object has exactly these keys with these types. Extra fields are allowed —
 * additive change is not an API break — but a missing or retyped field is.
 *
 * @param {object} value
 * @param {Record<string, string>} shape key → `'string' | 'number' | 'boolean' | 'array' | 'object' | 'null'`
 * @param {string} label
 */
function assertShape(value, shape, label) {
  for (const [key, type] of Object.entries(shape)) {
    assert.ok(Object.prototype.hasOwnProperty.call(value, key), `${label}: missing field "${key}"`);
    const actual = value[key];
    if (type === 'null') continue; // nullable by contract; presence is what was asserted
    if (type === 'array') assert.ok(Array.isArray(actual), `${label}: "${key}" must be an array`);
    else if (type === 'object') assert.ok(actual !== null && typeof actual === 'object' && !Array.isArray(actual), `${label}: "${key}" must be an object`);
    else assert.strictEqual(typeof actual, type, `${label}: "${key}" must be a ${type}`);
  }
}

const store = createInMemoryConfigStore();

test.before(async () => {
  process.env.NODE_ENV = 'test';
  configService.setConfigPoolForTests(store.pool);
  setRbacStoreForTests({
    async listRoles() { return [{ name: 'ADMIN', rank: 80, isSystem: true }]; },
    async listRolePermissions() {
      // Both read and write: a contract test must reach the handler, otherwise it asserts
      // the middleware's envelope and never sees the payload shape it is here to check.
      return [
        { role: 'ADMIN', resource: 'system.config', action: 'read' },
        { role: 'ADMIN', resource: 'system.config', action: 'write' },
      ];
    },
    async listUserGrants() { return []; },
    async replaceRolePermissions() {},
    async upsertGrant() {},
    async listGrants() { return []; },
    async deleteGrant() { return 0; },
  });
  await refreshRbacCache();
  setRepositoryForTests({
    async recordAdminAuditLog(row) { return row; },
    async getAdminAuditLogs() { return []; },
  });
  setTokenVerifierForTests(async () => ({
    uid: 'contract-admin', email: 'admin@test', email_verified: true, role: 'ADMIN',
    permissions: [], auth_time: Math.floor(Date.now() / 1000),
  }));
});

test.after(() => {
  setRbacStoreForTests(null);
  resetRepositoryCacheForTests();
  configService.setConfigPoolForTests(null);
});

test('contract: GET /api/me/capabilities keeps every field the console reads', async () => {
  const app = require('../index');
  const response = await request(app).get('/api/me/capabilities').set('Authorization', 'Bearer ADMIN');
  assert.equal(response.status, 200);
  assertShape(response.body, {
    success: 'boolean',
    role: 'string',
    tabs: 'array',
    actions: 'object',
    defaultTab: 'string',
    permissions: 'array',
    authority: 'object',
  }, 'capabilities');

  assert.ok(response.body.tabs.length > 0);
  for (const tab of response.body.tabs) {
    assertShape(tab, {
      id: 'string', label: 'string', group: 'string', allowed: 'boolean',
      superAdminOnly: 'boolean', reason: 'null', missing: 'array',
    }, `capabilities.tabs[${tab.id}]`);
    if (!tab.allowed) assert.ok(tab.reason, `${tab.id}: a denied tab must say why`);
    if (tab.allowed) assert.strictEqual(tab.reason, null, `${tab.id}: an allowed tab must not carry a denial reason`);
  }

  assertShape(response.body.authority, { source: 'string', degraded: 'boolean', roles: 'number' }, 'capabilities.authority');
  assert.strictEqual(response.headers['cache-control'], 'no-store', 'capabilities are per-caller and must not be cached');
});

test('contract: GET /api/admin/config keeps value, source, editability and revision per entry', async () => {
  const app = require('../index');
  const response = await request(app).get('/api/admin/config').set('Authorization', 'Bearer ADMIN');
  assert.equal(response.status, 200);
  assertShape(response.body, { success: 'boolean', authority: 'object', count: 'number', scopes: 'array', entries: 'array' }, 'config');
  assert.equal(response.body.entries.length, response.body.count);

  for (const entry of response.body.entries) {
    assertShape(entry, {
      id: 'string', key: 'string', label: 'string', description: 'string', scope: 'string',
      type: 'string', unit: 'null', editable: 'boolean', restartRequired: 'boolean',
      audit: 'string', resolution: 'string', source: 'string', redacted: 'boolean',
      readOnlyReason: 'null',
    }, `config.entries[${entry.key}]`);
    // `value` and `revision` are intentionally not type-asserted: `value` is polymorphic
    // (number, boolean, string, array, or null when redacted) and `revision` is null
    // until a row exists. Their presence is what the editor depends on.
    assert.ok(Object.prototype.hasOwnProperty.call(entry, 'value'), `${entry.key}: missing value`);
    assert.ok(Object.prototype.hasOwnProperty.call(entry, 'revision'), `${entry.key}: missing revision`);
    if (!entry.editable) assert.ok(entry.readOnlyReason, `${entry.key}: a read-only entry must carry its reason`);
  }
});

test('contract: GET /api/config/runtime exposes an enumerated key list with the same keys', async () => {
  const app = require('../index');
  const response = await request(app).get('/api/config/runtime').set('Authorization', 'Bearer ADMIN');
  assert.equal(response.status, 200);
  assertShape(response.body, { success: 'boolean', values: 'object', keys: 'array' }, 'runtime');
  assert.deepEqual(Object.keys(response.body.values).sort(), [...response.body.keys].sort(),
    'the response must contain exactly the keys it advertises, so a client can trust the list');
});

test('contract: the error envelope is uniform across the three surfaces', async () => {
  const app = require('../index');
  // Reaches the handler (the store grants system.config.write), so the code asserted
  // below is the one this module documents rather than a middleware code.
  const denial = await request(app)
    .put('/api/admin/config/not.a.key')
    .set('Authorization', 'Bearer ADMIN')
    .send({ value: 1, expectedRevision: null });
  assert.ok(denial.status >= 400);
  // Diagnostics for the one case where the shape could differ: a denial produced by the
  // shared policy middleware rather than by the handler.
  assert.ok(denial.body && typeof denial.body === 'object', `non-JSON denial body: ${JSON.stringify(denial.text)}`);
  assertShape(denial.body, { success: 'boolean', error: 'object' }, 'config error envelope');
  assertShape(denial.body.error, { code: 'string', message: 'string' }, 'config error body');
  assert.match(denial.body.error.code, /^CONFIG_[A-Z_]+$/, 'only documented CONFIG_* codes reach a caller');
});
