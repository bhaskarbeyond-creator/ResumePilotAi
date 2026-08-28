'use strict';

process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const auth = require('../security/auth');
const { usersDataRouter } = require('../routes/usersData');

function repository(initial = null) {
  let state = initial ? { ...structuredClone(initial) } : null;
  let writes = 0;
  return {
    get writes() { return writes; },
    snapshot: () => structuredClone(state),
    async getUser(uid) { return state?.id === uid ? structuredClone(state) : null; },
    async saveUserWithRevisionGuard(uid, payload, expectedRevision) {
      const current = Number(state?.revision || 0);
      if (current !== Number(expectedRevision)) {
        throw Object.assign(new Error('Profile changed in another tab or device.'), { code: 'PROFILE_CONFLICT', status: 409, remoteRevision: current });
      }
      writes += 1;
      state = { ...(state || {}), ...structuredClone(payload), id: uid, revision: current + 1 };
      return structuredClone(state);
    },
    async recordSecurityAuditLog() {},
  };
}

function appFor(repo) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use((req, _res, next) => { req.repository = repo; next(); });
  app.set('firebaseAdmin', { auth: () => ({}) });
  app.use('/api/users-data', usersDataRouter);
  return app;
}

const bearer = { Authorization: 'Bearer profile-test-token' };

test.before(() => {
  auth.setTokenVerifierForTests(async () => ({ uid: 'alice', email: 'alice@example.com', email_verified: true, role: 'USER' }));
});

test('profile API requires an explicit revision and rejects protected-field mass assignment', async () => {
  const repo = repository({ id: 'alice', email: 'alice@example.com', membership: 'Basic', paymentStatus: 'INACTIVE', revision: 3 });
  const app = appFor(repo);
  const missing = await request(app).post('/api/users-data/profile').set(bearer).send({ profile: { firstname: 'Asha' } });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.code, 'PROFILE_REVISION_REQUIRED');

  for (const profile of [{ membership: 'Premium' }, { role: 'SUPER_ADMIN' }, { paymentStatus: 'ACTIVE' }, { permissions: ['*'] }]) {
    const response = await request(app).post('/api/users-data/profile').set(bearer).send({ expectedRevision: 3, profile });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'PROFILE_FIELD_FORBIDDEN');
  }
  assert.equal(repo.writes, 0);
  assert.equal(repo.snapshot().membership, 'Basic');
});

test('profile API rejects owner mismatch, identity-email mismatch, and malformed envelope', async () => {
  const repo = repository({ id: 'alice', email: 'alice@example.com', revision: 1 });
  const app = appFor(repo);
  const owner = await request(app).post('/api/users-data/profile').set(bearer).send({ userId: 'bob', expectedRevision: 1, profile: { firstname: 'Asha' } });
  assert.equal(owner.status, 403);
  assert.equal(owner.body.code, 'PROFILE_OWNER_MISMATCH');
  const email = await request(app).post('/api/users-data/profile').set(bearer).send({ expectedRevision: 1, profile: { email: 'attacker@example.com' } });
  assert.equal(email.status, 403);
  assert.equal(email.body.code, 'IDENTITY_EMAIL_MISMATCH');
  const envelope = await request(app).post('/api/users-data/profile').set(bearer).send({ expectedRevision: 1, profile: { firstname: 'Asha' }, membership: 'Premium' });
  assert.equal(envelope.status, 400);
  assert.equal(envelope.body.code, 'INVALID_PROFILE_ENVELOPE');
  assert.equal(repo.writes, 0);
});

test('profile API applies a valid owner update, preserves billing state, and returns nested profile revision', async () => {
  const repo = repository({
    id: 'alice', email: 'alice@example.com', firstname: 'Old', membership: 'Premium',
    membershipEnds: '2030-01-01T00:00:00.000Z', paymentStatus: 'ACTIVE', revision: 4,
    extra_data: { summary: 'Old summary', aiQuotaOverride: { dailyLimit: 77 } },
    summary: 'Old summary', aiQuotaOverride: { dailyLimit: 77 },
  });
  const response = await request(appFor(repo)).post('/api/users-data/profile').set(bearer).send({
    expectedRevision: 4,
    profile: { firstname: 'Asha', summary: 'New summary', email: 'alice@example.com' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.user.profile.firstname, 'Asha');
  assert.equal(response.body.user.profile.summary, 'New summary');
  assert.equal(response.body.user.profile.revision, 5);
  assert.equal(repo.snapshot().membership, 'Premium');
  assert.equal(repo.snapshot().paymentStatus, 'ACTIVE');
  assert.deepEqual(repo.snapshot().extra_data.aiQuotaOverride, { dailyLimit: 77 });
});

test('profile API stale write returns authoritative revision/profile and performs no mutation', async () => {
  const repo = repository({ id: 'alice', email: 'alice@example.com', firstname: 'Remote', summary: 'Remote bio', revision: 9 });
  const response = await request(appFor(repo)).post('/api/users-data/profile').set(bearer).send({
    expectedRevision: 8,
    profile: { firstname: 'Local', summary: 'Stale bio' },
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'PROFILE_CONFLICT');
  assert.equal(response.body.remoteRevision, 9);
  assert.equal(response.body.remoteProfile.summary, 'Remote bio');
  assert.equal(repo.writes, 0);
});
