'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { platformRouter } = require('../routes/platform');

function makeApp() {
  const app = express();
  app.use(express.json());

  // Mock DB and Firebase Admin
  const auditLogs = [];
  const usersDb = new Map([
    ['super-uid', { email: 'super@airesume.guru', role: 'SUPER_ADMIN', displayName: 'Super Operator' }],
    ['admin-uid', { email: 'admin@airesume.guru', role: 'ADMIN', displayName: 'Platform Admin' }],
    ['target-uid', { email: 'user@example.com', role: 'USER', displayName: 'Target User' }],
  ]);

  const mockDb = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              const data = usersDb.get(id) || {};
              return { exists: usersDb.has(id), data: () => data };
            },
            async set(data, opts) {
              const existing = usersDb.get(id) || {};
              usersDb.set(id, opts?.merge ? { ...existing, ...data } : data);
            }
          };
        },
      };
    }
  };

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
        async revokeRefreshTokens(uid) {
          // Token revoked
          return true;
        }
      };
    },
    firestore: {
      FieldValue: {
        serverTimestamp: () => new Date().toISOString()
      }
    }
  };

  app.set('db', mockDb);
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

test('Platform Operators IAM Suite: POST /api/platform/operators/:uid/revoke-sessions invalidates all tokens', async () => {
  const app = makeApp();
  const res = await request(app)
    .post('/api/platform/operators/admin-uid/revoke-sessions')
    .send({});
  
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.match(res.body.message, /revoked/i);
});

test('Platform Operators IAM Suite: POST /api/platform/operators rejects self-demotion by Super Admin', async () => {
  const app = makeApp();
  const res = await request(app)
    .post('/api/platform/operators')
    .send({ uid: 'super-uid', role: 'USER' });
  
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'SELF_DEMOTION_PROHIBITED');
});
