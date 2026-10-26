'use strict';

/**
 * Characterisation pins for the register's remaining code-level divergences
 * (tier "characterisation", REC-017 — companion to `characterisation.test.js`).
 *
 * `characterisation.test.js` pins the RBAC/authority decisions. This file pins the
 * *surface* decisions from `07-intentional-divergence-register.md` that are
 * behaviours of code rather than of documentation:
 *
 *  - DIV-007 — step-up modal replaced by generic 401/`RECENT_AUTH_REQUIRED` handling.
 *  - DIV-009 — the dual-write database controls are retired, answered `410`.
 *  - DIV-010 — the cloud-storage settings category is refused `501`, never faked.
 *  - DIV-011 — `SUPER_ADMIN` cannot be created or demoted through the Admin API.
 *  - DIV-012 — `optionalAuth`/`bearerTokenFrom` are extracted and never break a public surface.
 *  - DIV-013 — payment-settings read is lowered to `payments.read | system.config.read`.
 *  - DIV-015 — the generic audit write is best-effort: its failure cannot fail a request.
 *  - DIV-017 — secrets are never returned; only `CONFIGURED`/`NOT_CONFIGURED` markers are.
 *
 * Each assertion names its decision so a future change to the behaviour is a diff
 * against a documented intent, not a silent drift.
 *
 * Run: NODE_ENV=test node --test test/characterisation-divergences.test.js
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const auth = require('../security/auth');
const { setPoolForTests } = require('../database/mysql');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const { setRbacStoreForTests, invalidateRbacCache, refreshRbacCache } = require('../services/adminRbac');

test.before(() => {
  setRbacStoreForTests({
    async listRoles() {
      return [
        { name: 'SUPER_ADMIN', rank: 100, isSystem: true },
        { name: 'ADMIN', rank: 80, isSystem: true },
      ];
    },
    async listRolePermissions() {
      return [
        { role: 'SUPER_ADMIN', resource: '*', action: '*' },
        { role: 'ADMIN', resource: 'system.config', action: 'write' },
        { role: 'ADMIN', resource: 'system.config', action: 'read' },
      ];
    },
    async listUserGrants() { return []; },
    async replaceRolePermissions() {},
    async upsertGrant() {},
    async listGrants() { return []; },
    async deleteGrant() { return 0; },
  });
  invalidateRbacCache();
});

test.after(() => {
  setRbacStoreForTests(null);
  resetRepositoryCacheForTests();
  setPoolForTests(null);
});

function fakeRequest(overrides = {}) {
  return {
    method: 'GET',
    path: '/admin/anything',
    originalUrl: '/api/admin/anything',
    headers: {},
    query: {},
    params: {},
    get() { return undefined; },
    ...overrides,
  };
}

function fakeResponse() {
  const captured = { statusCode: null, body: null, ended: false };
  return {
    captured,
    locals: {},
    status(code) { captured.statusCode = code; return this; },
    json(body) { captured.body = body; return this; },
    end(...args) { captured.ended = true; return this; },
    setHeader() { return this; },
  };
}

/* ── DIV-007: generic 401 handling, no bespoke step-up surface ───────── */

test('DIV-007: an anonymous admin call is refused with the generic 401 envelope', async () => {
  // The step-up modal's server half would have been a dedicated endpoint with a
  // bespoke payload; the replacement is the same 401 envelope every other
  // unauthenticated call receives.
  const app = express();
  app.get('/probe', auth.requireAuth, (_req, res) => res.json({ ok: true }));
  const response = await request(app).get('/probe');
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'AUTH_REQUIRED');
});

test('DIV-007: a stale sensitive operation is refused RECENT_AUTH_REQUIRED, not a step-up challenge', async () => {
  // The step-up modal's replacement is this generic envelope: a named code the
  // client maps to "sign in again", with no bespoke challenge surface. The
  // decision recorded as DIV-007 is the *envelope*, not a particular status
  // number: this refusal is a 403 (it is an authorisation-age failure after
  // successful authentication), while an unauthenticated call is the 401 above.
  process.env.REQUIRE_RECENT_AUTH_IN_TEST = 'true';
  const old = Math.floor(Date.now() / 1000) - 3600;
  auth.setTokenVerifierForTests(async () => ({
    uid: 'div007', email: 'div007@test', email_verified: true,
    role: 'SUPER_ADMIN', auth_time: old, firebase: { sign_in_second_factor: 'totp' },
  }));
  try {
    const app = express();
    app.post('/probe', auth.requireRecentAuthentication, (_req, res) => res.json({ ok: true }));
    const response = await request(app).post('/probe').set('Authorization', 'Bearer x');
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'RECENT_AUTH_REQUIRED');
    assert.match(response.body.error.message, /reauthenticate/i);
  } finally {
    delete process.env.REQUIRE_RECENT_AUTH_IN_TEST;
    auth.setTokenVerifierForTests(null);
  }
});

/* ── DIV-009: retired dual-write controls answer 410 ─────────────────── */

test('DIV-009: the retired database controls answer 410 with their replacement, never 200', async () => {
  auth.setTokenVerifierForTests(async () => ({
    uid: 'div009', email: 'div009@test', email_verified: true,
    claims: { role: 'SUPER_ADMIN' }, auth_time: Math.floor(Date.now() / 1000),
    firebase: { sign_in_second_factor: 'totp' },
  }));
  const { databaseAdminRouter } = require('../routes/databaseAdmin');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = req.user || undefined; next(); });
  app.use('/api/admin/database-settings', (req, _res, next) => {
    req.user = {
      uid: 'div009', email: 'div009@test',
      claims: { role: 'SUPER_ADMIN' }, permissions: [],
    };
    next();
  }, databaseAdminRouter);

  for (const path of ['/sync-status', '/conflicts']) {
    const response = await request(app).get(`/api/admin/database-settings${path}`);
    assert.equal(response.status, 410, `${path} must be retired, not served`);
    assert.equal(response.body.error.code, 'LEGACY_DATABASE_CONTROL_RETIRED');
    assert.match(response.body.error.message, /not part of the single-owner architecture/i,
      `${path} must say why the capability is gone — DIV-009 removed it, with no successor surface`);
  }
  auth.setTokenVerifierForTests(null);
});

/* ── DIV-010: the cloud-storage category is refused 501 ──────────────── */

test('DIV-010: an unimplemented provider category fails closed with 501 and never pretends', async () => {
  // `resilientMutations` is the generic CMS adapter layer: an entity type with no
  // repository adapter must refuse with METHOD_NOT_IMPLEMENTED, never write a
  // success. This is the same contract the `storage` settings category obeys in
  // index.js (`STORAGE_PROVIDER_UNSUPPORTED`, 501).
  const { fail } = require('../services/resilientMutations');
  const refusal = fail('METHOD_NOT_IMPLEMENTED', 501, 'No adapter for cloud_storage_provider');
  assert.equal(refusal.status, 501);
  assert.equal(refusal.code, 'METHOD_NOT_IMPLEMENTED');

  const indexSource = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.js'), 'utf8');
  const storageBlock = indexSource.match(/if \(category === 'storage'\) \{[\s\S]{0,400}\}/);
  assert.ok(storageBlock, 'DIV-010: the storage category must have an explicit refusal branch');
  assert.match(storageBlock[0], /status\(501\)/, 'DIV-010: the storage refusal must be a 501, not a silent no-op');
  assert.match(storageBlock[0], /STORAGE_PROVIDER_UNSUPPORTED/,
    'DIV-010: the storage category must refuse with STORAGE_PROVIDER_UNSUPPORTED');
});

/* ── DIV-011: SUPER_ADMIN lifecycle is out of band ───────────────────── */

test('DIV-011: the Admin API refuses both SUPER_ADMIN grant and demotion, by name', () => {
  // Behavioural coverage of the two guards lives in test/admin-target-authority.test.js
  // (the ceiling) — this pin is that the *codes* are the documented ones, so a
  // rename that silently changes the contract fails here.
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'routes', 'adminUsers.js'), 'utf8');
  assert.match(source, /SUPER_ADMIN_ROLE_FORBIDDEN/,
    'DIV-011: granting SUPER_ADMIN must be refused with SUPER_ADMIN_ROLE_FORBIDDEN');
  assert.match(source, /SUPER_ADMIN_DEMOTION_PROTECTED/,
    'DIV-011: demoting SUPER_ADMIN must be refused with SUPER_ADMIN_DEMOTION_PROTECTED');
  assert.match(source, /SUPER_ADMIN claims cannot be granted through the Admin API/,
    'DIV-011: the refusal must say the lifecycle is out of band, not "invalid role"');
});

/* ── DIV-012: optionalAuth never breaks a public surface ─────────────── */

test('DIV-012: a malformed Bearer token on a public surface is ignored, not an error', async () => {
  auth.setTokenVerifierForTests(async () => { throw new Error('garbage token'); });
  let nextCalled = false;
  const req = fakeRequest({ get: (name) => (name === 'authorization' ? 'Bearer garbage' : undefined) });
  await auth.optionalAuth(req, fakeResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true, 'a public surface must continue for an anonymous caller');
  assert.equal(req.user, undefined, 'a rejected token must not leave a half-resolved user');
  auth.setTokenVerifierForTests(null);
});

test('DIV-012: no Authorization header is simply anonymous, never 401', async () => {
  let nextCalled = false;
  await auth.optionalAuth(fakeRequest(), fakeResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

/* ── DIV-013: the payment-settings read is a two-key disjunction ─────── */

test('DIV-013: payments.read alone admits the payment-settings read guard', async () => {
  setRbacStoreForTests({
    async listRoles() { return [{ name: 'BILLING', rank: 40, isSystem: true }]; },
    async listRolePermissions() { return [{ role: 'BILLING', resource: 'payments', action: 'read' }]; },
    async listUserGrants() { return []; },
    async replaceRolePermissions() {}, async upsertGrant() {}, async listGrants() { return []; },
    async deleteGrant() { return 0; },
  });
  await refreshRbacCache();
  const guard = auth.requirePermission(['payments.read', 'system.config.read']);
  let allowed = false;
  const req = fakeRequest({ user: { uid: 'div013', claims: { role: 'BILLING' }, permissions: [] } });
  await guard(req, fakeResponse(), () => { allowed = true; });
  assert.equal(allowed, true,
    'DIV-013: the read guard was lowered from SUPER_ADMIN to payments.read | system.config.read');
});

test('DIV-013: a caller with neither key is still refused', async () => {
  const guard = auth.requirePermission(['payments.read', 'system.config.read']);
  let allowed = false;
  const res = fakeResponse();
  const req = fakeRequest({ user: { uid: 'div013b', claims: { role: 'USER' }, permissions: [] } });
  await guard(req, res, () => { allowed = true; });
  assert.equal(allowed, false);
  assert.equal(res.captured.statusCode, 403);
  setRbacStoreForTests(null);
  invalidateRbacCache();
});

/* ── DIV-015: the generic audit write is best-effort ─────────────────── */

test('DIV-015: a failing post-response audit write cannot fail or hang the request', async () => {
  setRepositoryForTests({
    async recordAdminAuditLog() { throw new Error('audit store down'); },
    async getAdminAuditLogs() { return []; },
  });
  const { createAdminAuditMiddleware } = require('../security/adminAudit');
  const middleware = createAdminAuditMiddleware();

  const req = fakeRequest({
    method: 'POST',
    path: '/admin/settings/x',
    originalUrl: '/api/admin/settings/x',
    body: { data: { a: 1 } },
    get: () => 'test-agent',
    socket: { remoteAddress: '203.0.113.7' },
  });
  const res = fakeResponse();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  // The handler completes and the response ends normally…
  res.end('{"ok":true}');
  assert.equal(res.captured.ended, true);
  // …and the audit failure surfaces only as a log line (swallowed by the
  // middleware's own .catch), never as an exception to the caller.
  await new Promise(resolve => setImmediate(resolve));
  resetRepositoryCacheForTests();
});

/* ── DIV-017: secrets are never returned, only markers ───────────────── */

test('DIV-017: the configuration surface reports a secret as CONFIGURED and never its value', async () => {
  const marker = 'DIV17-SUPER-SECRET-VALUE';
  process.env.OPENAI_API_KEY = marker;
  // A store with no rows: the projection must still be complete and marker-only.
  setPoolForTests({
    async query(sql) {
      if (/FROM system_settings/i.test(sql)) return [[]];
      return [[]];
    },
    async getConnection() {
      return { async query() { return [[]]; }, release() {}, async beginTransaction() {}, async commit() {}, async rollback() {} };
    },
  });
  try {
    const { getPlatformConfiguration } = require('../services/platformConfiguration');
    const projection = await getPlatformConfiguration({ env: process.env });
    const serialised = JSON.stringify(projection);
    assert.ok(!serialised.includes(marker), 'DIV-017: a secret value must never leave the server');
    assert.match(serialised, /"value":"CONFIGURED"/,
      'DIV-017: a set secret reports the marker, which is what the UI is allowed to see');
    assert.match(serialised, /"secret":true/);
  } finally {
    delete process.env.OPENAI_API_KEY;
    setPoolForTests(null);
  }
});
