process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireAuth, setTokenVerifierForTests } = require('../security/auth');

test('Email Verification & AI Access Flow', async (t) => {
  await t.test('1. Valid verified token produces emailVerified: true', async () => {
    setTokenVerifierForTests(async token => ({
      uid: 'user-verified-1',
      email: 'user@example.com',
      email_verified: true,
      role: 'USER',
    }));

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

    const req = { get: () => 'Bearer unverified-token' };
    const res = { status: () => ({ json: () => {} }) };
    let nextCalled = false;

    await requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.user.emailVerified, false);
  });
});
