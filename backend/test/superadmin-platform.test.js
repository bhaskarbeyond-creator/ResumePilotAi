'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const {
  deriveAction,
  deriveCategory,
  deriveSeverity,
  sanitizeAuditValue,
  recordAdminAuditLog,
} = require('../security/adminAudit');
const { isSuperAdmin, setTokenVerifierForTests } = require('../security/auth');
const { InMemoryTenantRegistry } = require('../enterprise/tenantRegistry');
const { TenantService } = require('../enterprise/tenantService');
const { MemoryFirestore, createMemoryAdmin } = require('./helpers/memoryFirestore');

setTokenVerifierForTests(async token => {
  const now = Math.floor(Date.now() / 1000);
  if (token === 'user') return { uid: 'user-1', email: 'user@example.com', email_verified: true, role: 'USER', auth_time: now };
  if (token === 'admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now };
  if (token === 'support') return { uid: 'support-1', email: 'support@example.com', email_verified: true, role: 'SUPPORT', auth_time: now };
  if (token === 'stale-admin') return { uid: 'admin-1', email: 'admin@example.com', email_verified: true, role: 'ADMIN', auth_time: now - 3600 };
  if (token === 'super-admin') return { uid: 'super-1', email: 'super@example.com', email_verified: true, role: 'SUPER_ADMIN', auth_time: now };
  throw new Error('invalid token');
});

const app = require('../index');
const bearer = token => ({ Authorization: `Bearer ${token}` });

test('Super Admin & Platform Module: Sanitization protects secrets', () => {
  const sensitiveObj = {
    apiKey: 'sk-1234567890abcdef',
    password: 'SuperSecretPassword!',
    token: 'jwt.bearer.token',
    clientSecret: 'secret-xyz',
    normalField: 'hello-world',
    nested: {
      privateKey: '-----BEGIN RSA PRIVATE KEY-----',
      userEmail: 'admin@example.com',
      card: '4111222233334444',
    },
  };

  const sanitized = sanitizeAuditValue('root', sensitiveObj);
  assert.equal(sanitized.apiKey, '[REDACTED]');
  assert.equal(sanitized.password, '[REDACTED]');
  assert.equal(sanitized.token, '[REDACTED]');
  assert.equal(sanitized.clientSecret, '[REDACTED]');
  assert.equal(sanitized.normalField, 'hello-world');
  assert.equal(sanitized.nested.privateKey, '[REDACTED]');
  assert.equal(sanitized.nested.card, '[REDACTED]');
  assert.equal(sanitized.nested.userEmail, 'admin@example.com');
});

test('Super Admin & Platform Module: Action & Category Derivation', () => {
  assert.equal(deriveAction('POST', '/api/admin/ai-settings'), 'POST_AI_SETTINGS');
  assert.equal(deriveAction('POST', '/api/admin/ai/test-provider'), 'TEST_AI_PROVIDER');
  assert.equal(deriveAction('DELETE', '/api/admin/users/12345'), 'DELETE_USER_PROFILE');
  assert.equal(deriveAction('POST', '/api/platform/maintenance'), 'POST_PLATFORM_MAINTENANCE');
  assert.equal(deriveAction('POST', '/api/platform/tenants'), 'POST_PLATFORM_TENANT');
  assert.equal(deriveAction('GET', '/api/admin/health-summary'), 'READ_HEALTH_SUMMARY');

  assert.equal(deriveCategory('/api/admin/ai-settings'), 'ai.governance');
  assert.equal(deriveCategory('/api/admin/payment-settings'), 'billing.payments');
  assert.equal(deriveCategory('/api/admin/users/123'), 'iam.users');
  assert.equal(deriveCategory('/api/platform/health'), 'platform.health');
  assert.equal(deriveCategory('/api/admin/blog/posts'), 'content.media');
});

test('Super Admin & Platform Module: Severity derivation matches operational risk', () => {
  assert.equal(deriveSeverity('GET', '/api/admin/settings/general', 200), 'INFO');
  assert.equal(deriveSeverity('POST', '/api/admin/settings/general', 200), 'MEDIUM');
  assert.equal(deriveSeverity('DELETE', '/api/admin/users/test-uid', 200), 'HIGH');
  assert.equal(deriveSeverity('POST', '/api/admin/firebase-service-account', 200), 'HIGH');
  assert.equal(deriveSeverity('POST', '/api/admin/ai-settings', 500), 'HIGH');
  assert.equal(deriveSeverity('POST', '/api/admin/ai-settings', 403), 'MEDIUM');
});

test('Super Admin & Platform Module: isSuperAdmin correctly identifies role & wildcard', () => {
  const superAdminUser = { uid: 'sa1', email: 'sa@example.com', claims: { role: 'SUPER_ADMIN' } };
  const adminUser = { uid: 'a1', email: 'admin@example.com', claims: { role: 'ADMIN' } };
  const wildcardUser = { uid: 'w1', email: 'w@example.com', claims: { permissions: ['*'] } };
  const regularUser = { uid: 'u1', email: 'user@example.com', claims: { role: 'USER' } };

  assert.equal(isSuperAdmin(superAdminUser), true);
  assert.equal(isSuperAdmin(wildcardUser), true);
  assert.equal(isSuperAdmin(adminUser), false);
  assert.equal(isSuperAdmin(regularUser), false);
  assert.equal(isSuperAdmin(null), false);
});

test('Super Admin & Platform Module: recordAdminAuditLog mock execution succeeds', async () => {
  const fakeDocs = {};
  const mockDb = {
    collection(name) {
      return {
        doc(id = 'generated-id') {
          return {
            async set(data) {
              fakeDocs[`${name}/${id}`] = data;
              return { writeTime: new Date() };
            },
          };
        },
      };
    },
  };
  const mockAdmin = {
    firestore: {
      FieldValue: {
        serverTimestamp: () => new Date(),
      },
    },
  };

  const result = await recordAdminAuditLog(mockDb, mockAdmin, {
    actorUid: 'admin-001',
    actorEmail: 'admin@domain.com',
    action: 'UPDATE_AI_SETTINGS',
    category: 'ai.governance',
    severity: 'MEDIUM',
    outcome: 'SUCCESS',
    method: 'POST',
    pathname: '/api/admin/ai-settings',
    statusCode: 200,
    durationMs: 45,
    metadata: { provider: 'nvidia', activeModel: 'meta/llama-3.2-11b' },
  });

  assert.ok(result);
  assert.equal(result.actorUid, 'admin-001');
  assert.equal(result.action, 'UPDATE_AI_SETTINGS');
  assert.equal(result.outcome, 'SUCCESS');
  assert.ok(fakeDocs[`admin_audit_logs/${result.id}`]);
});

test('Platform API: /api/platform/health returns structured diagnostic data', async () => {
  const res = await request(app)
    .get('/api/platform/health')
    .set(bearer('admin'));

  assert.equal(res.status, 200);
  assert.ok(res.body.healthScore !== undefined);
  assert.ok(res.body.status);
  assert.ok(res.body.subsystems);
  assert.ok(res.body.subsystems.runtime);
  assert.ok(res.body.commitSha);
});

test('Platform API: /api/platform/health rejects unauthenticated & non-admin callers', async () => {
  const anon = await request(app).get('/api/platform/health');
  assert.equal(anon.status, 401);

  const user = await request(app).get('/api/platform/health').set(bearer('user'));
  assert.equal(user.status, 403);
});

test('Platform API: /api/platform/maintenance status is readable by Admin and editable only by Super Admin', async () => {
  const readRes = await request(app)
    .get('/api/platform/maintenance')
    .set(bearer('admin'));
  assert.equal(readRes.status, 200);
  assert.equal(typeof readRes.body.enabled, 'boolean');

  // Admin cannot toggle maintenance (Super Admin only)
  const adminToggle = await request(app)
    .post('/api/platform/maintenance')
    .set(bearer('admin'))
    .send({ enabled: true });
  assert.equal(adminToggle.status, 403);
  assert.equal(adminToggle.body.error.code, 'FORBIDDEN');
});

test('SUPER_ADMIN provisions a standard user without accepting client role or password audit leakage', async () => {
  const originalDb = app.get('db');
  const originalAdmin = app.get('firebaseAdmin');
  const db = new MemoryFirestore();
  const firebaseAdmin = createMemoryAdmin({ db });
  const identities = new Map();
  firebaseAdmin.auth = () => ({
    async createUser(input) {
      const uid = `created-${identities.size + 1}`;
      if ([...identities.values()].some(identity => identity.email === input.email)) { const error = new Error('exists'); error.code = 'auth/email-already-exists'; throw error; }
      const identity = { uid, email: input.email, displayName: input.displayName, disabled: false, emailVerified: false, customClaims: {} };
      identities.set(uid, identity);
      return identity;
    },
    async deleteUser(uid) { identities.delete(uid); },
    async listUsers() { return { users: [...identities.values()] }; },
  });
  app.set('db', db);
  app.set('firebaseAdmin', firebaseAdmin);
  try {
    const denied = await request(app).post('/api/admin/users').set(bearer('admin')).send({ email: 'new@example.test', displayName: 'New User', temporaryPassword: 'SafeTemporaryPassword!42' });
    assert.equal(denied.status, 403);
    const created = await request(app).post('/api/admin/users').set(bearer('super-admin')).send({
      email: 'new@example.test', displayName: 'New User', temporaryPassword: 'SafeTemporaryPassword!42', role: 'SUPER_ADMIN', membership: 'Premium',
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.role, 'USER');
    assert.equal(created.body.user.membership, 'Basic');
    assert.equal(identities.get(created.body.user.id).customClaims.role, undefined);
    const profile = await db.collection('users').doc(created.body.user.id).get();
    assert.equal(profile.data().role, 'USER');
    assert.doesNotMatch(JSON.stringify(profile.data()), /SafeTemporaryPassword/);
    await new Promise(resolve => setTimeout(resolve, 25));
    const persisted = JSON.stringify(db.dump());
    assert.doesNotMatch(persisted, /SafeTemporaryPassword/);
    assert.match(persisted, /USER_PROVISIONED/);
  } finally {
    app.set('db', originalDb);
    app.set('firebaseAdmin', originalAdmin);
  }
});

test('server user directory paginates and filters the curated roster without exposing raw profile payloads', async () => {
  const originalDb = app.get('db');
  const originalAdmin = app.get('firebaseAdmin');
  const db = new MemoryFirestore();
  const firebaseAdmin = createMemoryAdmin({ db });
  firebaseAdmin.auth = () => ({
    async listUsers() {
      return { users: [
        { uid: 'user-a', email: 'alex@example.test', displayName: 'Alex', disabled: false, customClaims: { role: 'USER' } },
        { uid: 'user-b', email: 'bea@example.test', displayName: 'Bea', disabled: true, customClaims: { role: 'ADMIN' } },
      ] };
    },
  });
  app.set('db', db);
  app.set('firebaseAdmin', firebaseAdmin);
  try {
    await db.collection('users').doc('user-a').set({ userId: 'user-a', email: 'alex@example.test', displayName: 'Alex', membership: 'Basic', role: 'USER', privateNote: 'must never be returned', updatedAt: new Date('2026-01-01') });
    await db.collection('users').doc('user-b').set({ userId: 'user-b', email: 'bea@example.test', displayName: 'Bea', membership: 'Premium', role: 'ADMIN', suspended: true, updatedAt: new Date('2026-02-01') });
    const denied = await request(app).get('/api/admin/users').set(bearer('user'));
    assert.equal(denied.status, 403);
    const filtered = await request(app).get('/api/admin/users?membership=Premium&status=suspended&limit=1').set(bearer('admin'));
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.pagination.total, 1);
    assert.equal(filtered.body.users.length, 1);
    assert.equal(filtered.body.users[0].id, 'user-b');
    assert.equal(Object.hasOwn(filtered.body.users[0], 'privateNote'), false);
    const searched = await request(app).get('/api/admin/users?q=alex&limit=1').set(bearer('admin'));
    assert.equal(searched.status, 200);
    assert.equal(searched.body.users[0].id, 'user-a');
  } finally {
    app.set('db', originalDb);
    app.set('firebaseAdmin', originalAdmin);
  }
});

test('generic user administration protects SUPER_ADMIN identities and enforces role boundaries server-side', async () => {
  const originalDb = app.get('db');
  const originalAdmin = app.get('firebaseAdmin');
  const db = new MemoryFirestore();
  const firebaseAdmin = createMemoryAdmin({ db });
  const identities = new Map([
    ['super-target', { uid: 'super-target', disabled: false, customClaims: { role: 'SUPER_ADMIN' }, email: 'target-super@example.test' }],
    ['ordinary-target', { uid: 'ordinary-target', disabled: false, customClaims: { role: 'USER' }, email: 'ordinary@example.test' }],
  ]);
  firebaseAdmin.auth = () => ({
    async getUser(uid) {
      const user = identities.get(uid);
      if (!user) { const error = new Error('missing'); error.code = 'auth/user-not-found'; throw error; }
      return { ...user, customClaims: { ...user.customClaims } };
    },
    async updateUser(uid, update) { identities.set(uid, { ...identities.get(uid), ...(Object.hasOwn(update, 'disabled') ? { disabled: update.disabled } : {}) }); },
    async revokeRefreshTokens() {},
    async setCustomUserClaims(uid, claims) { identities.set(uid, { ...identities.get(uid), customClaims: { ...claims } }); },
  });
  app.set('db', db);
  app.set('firebaseAdmin', firebaseAdmin);
  try {
    await db.collection('users').doc('super-target').set({ role: 'SUPER_ADMIN', membership: 'Premium', suspended: false });
    await db.collection('users').doc('ordinary-target').set({ role: 'USER', membership: 'Basic', suspended: false });

    for (const token of ['user', 'support', 'admin']) {
      const protectedAttempt = await request(app).patch('/api/admin/users/super-target').set(bearer(token)).send({ suspended: true, expectedSuspended: false });
      assert.equal(protectedAttempt.status, token === 'admin' ? 403 : 403, token);
      assert.equal(identities.get('super-target').disabled, false, token);
    }

    const staleUserMutation = await request(app).patch('/api/admin/users/ordinary-target').set(bearer('stale-admin')).send({ suspended: true, expectedSuspended: false });
    assert.equal(staleUserMutation.status, 403);
    assert.equal(staleUserMutation.body.error.code, 'RECENT_AUTH_REQUIRED');

    const adminRoleAttempt = await request(app).patch('/api/admin/users/ordinary-target').set(bearer('admin')).send({ role: 'ADMIN', expectedRole: 'USER' });
    assert.equal(adminRoleAttempt.status, 403);

    const adminSuspendsOrdinary = await request(app).patch('/api/admin/users/ordinary-target').set(bearer('admin')).send({ suspended: true, expectedSuspended: false });
    assert.equal(adminSuspendsOrdinary.status, 200);
    assert.equal(identities.get('ordinary-target').disabled, true);

    const superGrantsRole = await request(app).patch('/api/admin/users/ordinary-target').set(bearer('super-admin')).send({ role: 'ADMIN', expectedRole: 'USER' });
    assert.equal(superGrantsRole.status, 200);
    assert.equal(identities.get('ordinary-target').customClaims.role, 'ADMIN');
  } finally {
    app.set('db', originalDb);
    app.set('firebaseAdmin', originalAdmin);
  }
});

test('Admin audit API supports filtered keyset pagination', async () => {
  const originalDb = app.get('db');
  const originalAdmin = app.get('firebaseAdmin');
  const db = new MemoryFirestore();
  app.set('db', db);
  app.set('firebaseAdmin', createMemoryAdmin({ db }));
  try {
    const emptyStats = await request(app).get('/api/admin/audit-logs/stats').set(bearer('admin'));
    assert.equal(emptyStats.status, 200);
    assert.equal(emptyStats.body.successRate, null);
    for (let index = 0; index < 3; index += 1) {
      await db.collection('admin_audit_logs').doc(`event-${index}`).set({
        action: 'PLATFORM_TENANT_SUSPENDED', category: 'platform.control-plane', severity: 'HIGH', outcome: 'SUCCESS',
        actorUid: 'super-1', metadata: { source: 'test' }, createdAt: new Date(Date.now() + index),
      });
    }
    const first = await request(app).get('/api/admin/audit-logs?limit=2&category=platform.control-plane').set(bearer('admin'));
    assert.equal(first.status, 200);
    assert.equal(first.body.logs.length, 2);
    assert.equal(first.body.hasMore, true);
    const second = await request(app).get(`/api/admin/audit-logs?limit=2&category=platform.control-plane&startAfterDocId=${first.body.logs.at(-1).id}`).set(bearer('admin'));
    assert.equal(second.status, 200);
    assert.equal(second.body.logs.length, 1);
    assert.notEqual(second.body.logs[0].id, first.body.logs[0].id);
  } finally {
    app.set('db', originalDb);
    app.set('firebaseAdmin', originalAdmin);
  }
});

test('Phrase administration is real backend CRUD, revision-safe, and unavailable to regular users', async () => {
  const originalDb = app.get('db');
  const originalAdmin = app.get('firebaseAdmin');
  const db = new MemoryFirestore();
  app.set('db', db);
  app.set('firebaseAdmin', createMemoryAdmin({ db }));
  try {
    const denied = await request(app).get('/api/admin/phrases').set(bearer('user'));
    assert.equal(denied.status, 403);

    const created = await request(app).post('/api/admin/phrases').set(bearer('admin')).send({ name: 'Achievement Statements' });
    assert.equal(created.status, 201);
    assert.equal(created.body.category.id, 'achievement-statements');

    const categoryId = created.body.category.id;
    const added = await request(app).post(`/api/admin/phrases/${categoryId}/entries`).set(bearer('admin')).send({ phrase: 'Reduced delivery cycle time by 35%.', expectedRevision: 1 });
    assert.equal(added.status, 201);
    const publicProjection = await request(app).get('/public/phrases.json');
    assert.equal(publicProjection.status, 200);
    assert.deepEqual(publicProjection.body.categories.find(category => category.id === categoryId)?.phrases, ['Reduced delivery cycle time by 35%.']);
    assert.equal(added.body.category.revision, 2);

    const stale = await request(app).delete(`/api/admin/phrases/${categoryId}/entries`).set(bearer('admin')).send({ phrase: 'Reduced delivery cycle time by 35%.', expectedRevision: 1 });
    assert.equal(stale.status, 409);

    const removed = await request(app).delete(`/api/admin/phrases/${categoryId}/entries`).set(bearer('admin')).send({ phrase: 'Reduced delivery cycle time by 35%.', expectedRevision: 2 });
    assert.equal(removed.status, 200);
    const categoryDeleted = await request(app).delete(`/api/admin/phrases/${categoryId}`).set(bearer('admin')).send({ expectedRevision: 3 });
    assert.equal(categoryDeleted.status, 200);
  } finally {
    app.set('db', originalDb);
    app.set('firebaseAdmin', originalAdmin);
  }
});

test('Platform queue replay only requeues confirmed dead-letter records for SUPER_ADMIN', async () => {
  const originalDb = app.get('db');
  const originalAdmin = app.get('firebaseAdmin');
  const db = new MemoryFirestore();
  const firebaseAdmin = createMemoryAdmin({ db });
  app.set('db', db);
  app.set('firebaseAdmin', firebaseAdmin);
  try {
    await db.collection('notification_outbox').doc('dead-job').set({
      state: 'DEAD_LETTER', attemptCount: 5, recipient: 'person@example.test', templateType: 'audit', createdAt: new Date(),
    });
    await db.collection('notification_outbox').doc('active-job').set({
      state: 'NOTIFICATION_QUEUED', attemptCount: 0, recipient: 'person@example.test', templateType: 'audit', createdAt: new Date(),
    });

    const listed = await request(app).get('/api/platform/queues').set(bearer('super-admin'));
    assert.equal(listed.status, 200);
    assert.equal(listed.body.summary.deadLetterCount, 1);

    const missing = await request(app).post('/api/platform/queues/retry').set(bearer('super-admin')).send({ jobId: 'dead-job' });
    assert.equal(missing.status, 422);
    assert.equal(missing.body.error.code, 'CONFIRMATION_REQUIRED');

    const active = await request(app).post('/api/platform/queues/retry').set(bearer('super-admin')).send({ jobId: 'active-job', confirmation: 'REPLAY active-job' });
    assert.equal(active.status, 409);
    assert.equal(active.body.error.code, 'JOB_NOT_DEAD_LETTER');

    const replayed = await request(app).post('/api/platform/queues/retry').set(bearer('super-admin')).send({ jobId: 'dead-job', confirmation: 'REPLAY dead-job' });
    assert.equal(replayed.status, 200);
    assert.equal(replayed.body.retriedCount, 1);
    const after = await db.collection('notification_outbox').doc('dead-job').get();
    assert.equal(after.data().state, 'NOTIFICATION_QUEUED');
    assert.equal(after.data().attemptCount, 0);

    const denied = await request(app).post('/api/platform/queues/retry').set(bearer('admin')).send({ jobId: 'dead-job', confirmation: 'REPLAY dead-job' });
    assert.equal(denied.status, 403);
  } finally {
    app.set('db', originalDb);
    app.set('firebaseAdmin', originalAdmin);
  }
});

test('Platform tenant registry is independent of the feature-gated enterprise route and protects lifecycle actions', async () => {
  const originalService = app.get('tenantService');
  const registry = new InMemoryTenantRegistry();
  app.set('tenantService', new TenantService({ registry }));
  try {
    const regularAdmin = await request(app).get('/api/platform/tenants').set(bearer('admin'));
    assert.equal(regularAdmin.status, 403, 'ADMIN cannot enumerate the Super Admin tenant registry');

    const created = await request(app)
      .post('/api/platform/tenants')
      .set(bearer('super-admin'))
      .send({ displayName: 'QA Control Plane Tenant', slug: 'qa-control-plane', isolationTier: 'STANDARD' });
    assert.equal(created.status, 201);
    assert.equal(created.body.tenant.slug, 'qa-control-plane');
    const tenantId = created.body.tenant.id;

    const listed = await request(app).get('/api/platform/tenants').set(bearer('super-admin'));
    assert.equal(listed.status, 200);
    assert.ok(listed.body.tenants.some(tenant => tenant.id === tenantId));

    const profile = await request(app)
      .patch(`/api/platform/tenants/${tenantId}`)
      .set(bearer('super-admin'))
      .send({ displayName: 'QA Control Plane Tenant Renamed' });
    assert.equal(profile.status, 200);
    assert.equal(profile.body.tenant.displayName, 'QA Control Plane Tenant Renamed');

    const missingConfirmation = await request(app)
      .post(`/api/platform/tenants/${tenantId}/suspend`)
      .set(bearer('super-admin'))
      .send({});
    assert.equal(missingConfirmation.status, 422);
    assert.equal(missingConfirmation.body.error.code, 'CONFIRMATION_REQUIRED');

    const suspended = await request(app)
      .post(`/api/platform/tenants/${tenantId}/suspend`)
      .set(bearer('super-admin'))
      .send({ confirmation: 'SUSPEND qa-control-plane' });
    assert.equal(suspended.status, 200);
    assert.equal(suspended.body.tenant.lifecycleState, 'SUSPENDED');

    const adminMutation = await request(app)
      .post(`/api/platform/tenants/${tenantId}/reactivate`)
      .set(bearer('admin'))
      .send({ confirmation: 'REACTIVATE qa-control-plane' });
    assert.equal(adminMutation.status, 403);

    const decommissioned = await request(app)
      .post(`/api/platform/tenants/${tenantId}/decommission`)
      .set(bearer('super-admin'))
      .send({ confirmation: 'DECOMMISSION qa-control-plane' });
    assert.equal(decommissioned.status, 200);
    assert.equal(decommissioned.body.tenant.lifecycleState, 'DELETING');
  } finally {
    app.set('tenantService', originalService);
  }
});
