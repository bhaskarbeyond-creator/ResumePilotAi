process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { requireAuth, setTokenVerifierForTests, setUserLookupForTests } = require('../security/auth');

test('Email Verification & AI Access Lifecycle Suite', async (t) => {
  await t.test('1. Valid verified token produces emailVerified: true immediately', async () => {
    setTokenVerifierForTests(async token => ({
      uid: 'user-verified-1',
      email: 'user@example.com',
      email_verified: true,
      role: 'USER',
    }));
    setUserLookupForTests(async () => null);

    const req = { get: () => 'Bearer valid-verified-token' };
    const res = { status: () => ({ json: () => {} }) };
    let nextCalled = false;

    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.user.emailVerified, true);
    assert.equal(req.user.uid, 'user-verified-1');
  });

  await t.test('2. Unverified token without live backend verification remains emailVerified: false', async () => {
    setTokenVerifierForTests(async token => ({
      uid: 'user-unverified-1',
      email: 'unverified@example.com',
      email_verified: false,
      role: 'USER',
    }));
    setUserLookupForTests(async uid => ({ uid, emailVerified: false }));

    const req = { get: () => 'Bearer unverified-token' };
    const res = { status: () => ({ json: () => {} }) };
    let nextCalled = false;

    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.user.emailVerified, false);
  });

  await t.test('3. Stale JWT (email_verified=false) automatically recovers when live Firebase user is verified', async () => {
    setTokenVerifierForTests(async token => ({
      uid: 'user-stale-jwt-1',
      email: 'stale@example.com',
      email_verified: false,
      role: 'USER',
    }));
    setUserLookupForTests(async uid => ({ uid, emailVerified: true }));

    const req = { get: () => 'Bearer stale-jwt-token' };
    const res = { status: () => ({ json: () => {} }) };
    let nextCalled = false;

    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.user.emailVerified, true, 'Live Firebase lookup must upgrade stale token to emailVerified=true');
  });

  await t.test('4. Invalid or malformed token is rejected with 401 INVALID_AUTH_TOKEN', async () => {
    setTokenVerifierForTests(async () => {
      throw new Error('Firebase ID token is malformed or invalid');
    });

    let statusCode = null;
    let jsonBody = null;
    const req = { get: () => 'Bearer malformed-token' };
    const res = {
      locals: { requestId: 'req-err-1' },
      status(code) {
        statusCode = code;
        return {
          json(body) {
            jsonBody = body;
          }
        };
      }
    };
    let nextCalled = false;

    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 401);
    assert.equal(jsonBody?.error?.code, 'INVALID_AUTH_TOKEN');
  });

  await t.test('5. Revoked token is rejected with 401 INVALID_AUTH_TOKEN', async () => {
    setTokenVerifierForTests(async () => {
      const err = new Error('Firebase ID token has been revoked');
      err.code = 'auth/id-token-revoked';
      throw err;
    });

    let statusCode = null;
    let jsonBody = null;
    const req = { get: () => 'Bearer revoked-token' };
    const res = {
      locals: { requestId: 'req-revoked-1' },
      status(code) {
        statusCode = code;
        return {
          json(body) {
            jsonBody = body;
          }
        };
      }
    };
    let nextCalled = false;

    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 401);
    assert.equal(jsonBody?.error?.code, 'INVALID_AUTH_TOKEN');
  });

  await t.test('6. Missing Authorization header returns 401 AUTH_REQUIRED', async () => {
    let statusCode = null;
    let jsonBody = null;
    const req = { get: () => null };
    const res = {
      locals: { requestId: 'req-missing-1' },
      status(code) {
        statusCode = code;
        return {
          json(body) {
            jsonBody = body;
          }
        };
      }
    };
    let nextCalled = false;

    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 401);
    assert.equal(jsonBody?.error?.code, 'AUTH_REQUIRED');
  });
});
