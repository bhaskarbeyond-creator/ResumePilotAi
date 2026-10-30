'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { platformRouter } = require('../routes/platform');

function makeApp() {
  const app = express();
  app.use(express.json());

  // Firebase Authentication remains the identity owner. MariaDB records the
  // required before/after administrative audit events through this explicit
  // repository contract double.
  const usersDb = new Map([
    ['super-uid', { email: 'super@airesume.guru', role: 'SUPER_ADMIN', displayName: 'Super Operator' }],
    ['admin-uid', { email: 'admin@airesume.guru', role: 'ADMIN', displayName: 'Platform Admin' }],
    ['target-uid', { email: 'user@example.com', role: 'USER', displayName: 'Target User' }],
  ]);

  const auditEvents = [];
  require('../repositories').setRepositoryForTests({
    async recordAdminAuditLog(event) { auditEvents.push(event); return event; },
  });

  const mockAdmin = {
    auth() {
      return {
        async listUsers() {
          return {
            users: [
              { uid: 'super-uid', email: 'super@airesume.guru', customClaims: { role: 'SUPER_ADMIN' }, emailVerified: true, multiFactor: { enrolledFactors: [{ factorId: 'totp' }] } },
              { uid: 'admin-uid', email: 'admin@airesume.guru', customClaims: { role: 'ADMIN' }, emailVerified: true, multiFactor: { enrolledFactors: [] } },
            ]
          };
        },
        async getUser(uid) {
          if (!usersDb.has(uid)) {
            const err = new Error('User not found');
            err.code = 'auth/user-not-found';
            throw err;
          }
          const u = usersDb.get(uid);
          return { uid, email: u.email, customClaims: { role: u.role } };
        },
        async setCustomUserClaims(uid, claims) {
          const u = usersDb.get(uid);
          if (u) u.role = claims.role;
        },
        async revokeRefreshTokens(_uid) {
          // Token revoked
          return true;
        }
      };
    },
  };

  // FP-A06: revocation is a DURABLE MariaDB decision (a cutoff in
  // `revoked_sessions`), not merely a refresh-token call. The driver seam below
  // models that one table so this suite can assert the row is written and read.
  const { getPool: realGetPool } = require('../database/mysql');
  const revocations = [];
  const mysqlModule = require('../database/mysql');
  mysqlModule.getPool = () => ({
    getConnection: async () => ({
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
      release() {},
      async query(sql, params = []) {
        if (/^INSERT INTO revoked_sessions/.test(sql)) {
          revocations.push({ id: params[0], userId: params[1], actor: params[5], reason: params[4] });
          return [{ affectedRows: 1 }];
        }
        if (/FROM revoked_sessions WHERE id = \?/.test(sql)) {
          const row = revocations.find(item => item.id === params[0]);
          return [[{ id: row.id, user_id: row.userId, scope: 'USER', cutoff: String(Math.floor(Date.now() / 1000)), expires_at: null, reason: row.reason, revoked_by: row.actor }]];
        }
        if (/FROM revoked_sessions WHERE user_id = \?/.test(sql)) return [[]];
        return [[]];
      },
    }),
    async query() { return [[]]; },
  });
  app.set('revocations', revocations);
  app.set('realGetPool', realGetPool);

  app.set('firebaseAdmin', mockAdmin);

  // Authenticated mock SuperAdmin middleware
  app.use((req, res, next) => {
    req.user = {
      uid: 'super-uid',
      email: 'super@airesume.guru',
      claims: { role: 'SUPER_ADMIN', auth_time: Math.floor(Date.now() / 1000) },
      emailVerified: true,
      admin: true,
      superAdmin: true,
    };
    next();
  });

  app.use('/api/platform', platformRouter);
  return app;
}

test('Platform Operators IAM Suite: GET /api/platform/operators lists operators with verified claims & MFA', async () => {
  const app = makeApp();
  const res = await request(app).get('/api/platform/operators');
  assert.equal(res.status, 200);
  assert.equal(Array.isArray(res.body.operators), true);
  assert.equal(res.body.operators.length >= 2, true);
  
  const superOp = res.body.operators.find(o => o.id === 'super-uid');
  assert.ok(superOp, 'SuperAdmin operator must be listed');
  assert.equal(superOp.role, 'SUPER_ADMIN');
  assert.equal(superOp.mfaEnabled, true);
});

test('Platform Operators IAM Suite: POST /api/platform/operators assigns ADMIN role to target user', async () => {
  const app = makeApp();
  const res = await request(app)
    .post('/api/platform/operators')
    .send({ uid: 'target-uid', role: 'ADMIN' });
  
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.role, 'ADMIN');
});

test('Platform Operators IAM Suite: POST /api/platform/operators rejects assignment of SUPER_ADMIN role', async () => {
  const app = makeApp();
  const res = await request(app)
    .post('/api/platform/operators')
    .send({ uid: 'target-uid', role: 'SUPER_ADMIN' });
  
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_OPERATOR');
});

test('Platform Operators IAM Suite: POST /api/platform/operators/:uid/revoke-sessions writes a durable cutoff', async () => {
  const app = makeApp();
  const res = await request(app)
    .post('/api/platform/operators/admin-uid/revoke-sessions')
    .send({ reason: 'suspected credential exposure' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.revokedUid, 'admin-uid');
  assert.match(res.body.message, /revoked/i);

  // The mandate contract is that already-issued ID tokens stop working, which is
  // only true if the cutoff row was persisted — refresh-token revocation alone is
  // insufficient and is asserted separately below.
  const revocations = app.get('revocations');
  assert.equal(revocations.length, 1);
  assert.equal(revocations[0].userId, 'admin-uid');
  assert.equal(revocations[0].actor, 'super-uid');
  assert.equal(revocations[0].reason, 'suspected credential exposure');
});

test('Platform Operators IAM Suite: the canonical revoke-session path has identical semantics', async () => {
  const app = makeApp();
  const res = await request(app)
    .post('/api/platform/operators/admin-uid/revoke-session')
    .send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.revokedUid, 'admin-uid');
  assert.equal(app.get('revocations').length, 1);

  // A revocation that cannot be persisted must not report success.
  const mysqlModule = require('../database/mysql');
  const working = mysqlModule.getPool;
  mysqlModule.getPool = () => ({
    getConnection: async () => ({
      async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
      async query() { throw new Error('storage unavailable'); },
    }),
  });
  try {
    const failed = await request(app).post('/api/platform/operators/admin-uid/revoke-session').send({});
    assert.equal(failed.status, 503);
    assert.equal(failed.body.success, undefined);
  } finally {
    mysqlModule.getPool = working;
  }
});

test('Platform Operators IAM Suite: POST /api/platform/operators rejects self-demotion by Super Admin', async () => {
  const app = makeApp();
  const res = await request(app)
    .post('/api/platform/operators')
    .send({ uid: 'super-uid', role: 'USER' });
  
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'SELF_DEMOTION_PROHIBITED');
});
