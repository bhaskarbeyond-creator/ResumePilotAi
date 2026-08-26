'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { adminUsersRouter } = require('../routes/adminUsers');
const { adminAuditRouter } = require('../routes/adminAudit');
const { platformRouter } = require('../routes/platform');

// Mock MySQL Repository providing complete data
class MockHealthyMySQLRepository {
  constructor() {
    this.users = {
      'user_123': {
        id: 'user_123',
        userId: 'user_123',
        email: 'ceo@enterprise.com',
        displayName: 'Enterprise Leader',
        role: 'ADMIN',
        membership: 'Premium',
        membershipEnds: '2027-01-01T00:00:00.000Z',
        paymentStatus: 'ACTIVE',
        preferredCurrency: 'USD',
        suspended: false,
        emailVerified: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      }
    };
    this.auditLogs = [
      {
        id: 'audit_1',
        actorUid: 'admin_1',
        actorEmail: 'admin@company.com',
        actorRole: 'SUPER_ADMIN',
        action: 'USER_ADMIN_UPDATED',
        category: 'iam.users',
        severity: 'INFO',
        outcome: 'SUCCESS',
        resourceId: 'user_123',
        createdAt: new Date().toISOString(),
      }
    ];
  }

  async getUser(uid) {
    return this.users[uid] || null;
  }

  async getUsers() {
    return Object.values(this.users);
  }

  async saveUser(uid, data) {
    this.users[uid] = { ...(this.users[uid] || {}), ...data, id: uid };
    return this.users[uid];
  }

  async getUserContentCounts(_uid) {
    return { resumeCount: 5, portfolioCount: 2, coverCount: 3 };
  }

  async getUserPaymentOrders(_uid) {
    return [
      { id: 'ord_1', planId: 'yearly', amount: 499, currency: 'USD', status: 'COMPLETED', createdAt: '2026-01-01T00:00:00.000Z' }
    ];
  }

  async getAdminAuditLogs(_options = {}) {
    return this.auditLogs;
  }

  async recordAdminAuditLog(data) {
    this.auditLogs.push(data);
    return data;
  }

  async getSecurityAuditLogs(options = {}) {
    return [
      { id: 'sec_1', actorUid: 'admin_1', targetUid: options.targetUid, action: 'USER_ADMIN_UPDATED', severity: 'MEDIUM', createdAt: new Date().toISOString() }
    ];
  }

  async recordSecurityAuditLog(data) {
    return data;
  }

  async getSetting(category) {
    if (category === 'public_config') {
      return {
        modules: { atsChecker: true, resumeImport: true, aiAssistant: true },
        subscriptions: { stripeEnabled: true }
      };
    }
    return null;
  }
}

// Mock Broken Firestore that always throws RESOURCE_EXHAUSTED (Code 8)
const mockQuotaExhaustedFirestore = {
  collection: () => {
    const error = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
    error.code = 8;
    throw error;
  },
  batch: () => {
    const error = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
    error.code = 8;
    throw error;
  }
};

// Mock Firebase Auth
const mockFirebaseAuth = {
  auth: () => ({
    getUser: async (uid) => ({
      uid,
      email: 'ceo@enterprise.com',
      displayName: 'Enterprise Leader',
      disabled: false,
      emailVerified: true,
      providerData: [{ providerId: 'password', email: 'ceo@enterprise.com' }],
      metadata: { creationTime: '2026-01-01T00:00:00Z', lastSignInTime: '2026-08-25T00:00:00Z' },
      customClaims: { role: 'ADMIN' },
    }),
    listUsers: async () => ({
      users: [{
        uid: 'user_123',
        email: 'ceo@enterprise.com',
        displayName: 'Enterprise Leader',
        disabled: false,
        emailVerified: true,
        providerData: [{ providerId: 'password', email: 'ceo@enterprise.com' }],
        metadata: { creationTime: '2026-01-01T00:00:00Z', lastSignInTime: '2026-08-25T00:00:00Z' },
        customClaims: { role: 'ADMIN' },
      }],
      pageToken: null,
    }),
    setCustomUserClaims: async () => {},
    updateUser: async () => {},
  }),
  firestore: {
    FieldValue: {
      serverTimestamp: () => new Date(),
      delete: () => null,
    }
  }
};

function buildTestApp() {
  const app = express();
  app.use(express.json());

  // Inject broken Firestore and healthy MySQL mock
  const mockRepo = new MockHealthyMySQLRepository();
  app.set('db', mockQuotaExhaustedFirestore);
  app.set('firebaseAdmin', mockFirebaseAuth);

  // Middleware to attach mock repository
  app.use((req, res, next) => {
    req.repository = mockRepo;
    req.user = { uid: 'superadmin_1', email: 'superadmin@company.com', claims: { role: 'SUPER_ADMIN' } };
    res.locals = { requestId: 'req_test_123' };
    next();
  });

  app.use('/api/admin/users', adminUsersRouter);
  app.use('/api/admin', adminAuditRouter);
  app.use('/api/platform', platformRouter);

  return app;
}

test('Zero-Trust Firestore Failure Isolation Test Suite', async (t) => {
  const app = buildTestApp();

  await t.test('1. User 360 (GET /api/admin/users/:uid/details) succeeds (HTTP 200) with complete data during Firestore quota exhaustion', async () => {
    const res = await request(app).get('/api/admin/users/user_123/details');
    assert.equal(res.status, 200, `Expected 200 OK but got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user360.identity.email, 'ceo@enterprise.com');
    assert.equal(res.body.user360.identity.role, 'ADMIN');
    assert.equal(res.body.user360.content.resumeCount, 5);
    assert.equal(res.body.user360.content.portfolioCount, 2);
    assert.equal(res.body.user360.billing.orders.length, 1);
    assert.equal(res.body.user360.auditTimeline.length, 2);
  });

  await t.test('2. User Directory (GET /api/admin/users) succeeds (HTTP 200) during Firestore quota exhaustion', async () => {
    const res = await request(app).get('/api/admin/users');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.users.length, 1);
    assert.equal(res.body.users[0].email, 'ceo@enterprise.com');
  });

  await t.test('3. User Patch (PATCH /api/admin/users/:uid) saves to MariaDB (HTTP 200) during Firestore quota exhaustion', async () => {
    const res = await request(app)
      .patch('/api/admin/users/user_123')
      .send({ displayName: 'Updated Enterprise Leader', membership: 'Premium' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.displayName, 'Updated Enterprise Leader');
  });

  await t.test('4. Admin Audit Logs (GET /api/admin/audit-logs) reads from MariaDB (HTTP 200) during Firestore quota exhaustion', async () => {
    const res = await request(app).get('/api/admin/audit-logs');
    assert.equal(res.status, 200);
    assert.equal(Array.isArray(res.body.logs), true);
    assert.ok(res.body.logs.length >= 1);
    assert.equal(res.body.logs[0].actorRole, 'SUPER_ADMIN');
  });

  await t.test('5. Public Config (GET /api/platform/public-config) serves from MariaDB (HTTP 200) during Firestore quota exhaustion', async () => {
    const res = await request(app).get('/api/platform/public-config');
    assert.equal(res.status, 200);
    assert.equal(res.body.modules.atsChecker, true);
    assert.equal(res.body.modules.resumeImport, true);
  });
});
