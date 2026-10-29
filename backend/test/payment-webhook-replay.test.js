'use strict';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');
const { setPoolForTests } = require('../database/mysql');
const { setRepositoryForTests } = require('../repositories');

const auditRecords = [];
const ledgerRecord = {
  event_id: 'evt_verified_123',
  provider: 'stripe',
  event_type: 'payment_intent.succeeded',
  order_id: 'order_123',
  // Current production writes this metadata-only shape, not the signed Stripe event.
  payload: JSON.stringify({
    eventId: 'evt_verified_123',
    provider: 'stripe',
    eventType: 'payment_intent.succeeded',
    orderId: 'order_123',
    claimedAt: '2026-10-29T00:00:00.000Z',
  }),
};

let currentRecord = ledgerRecord;
let queryFailure = null;
const queryCalls = [];
const pool = {
  async getConnection() {
    throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), { code: 'ECONNREFUSED' });
  },
  async query(sql, params = []) {
    queryCalls.push({ sql, params });
    if (queryFailure) throw queryFailure;
    if (/SELECT \* FROM payment_webhook_events WHERE event_id = \? LIMIT 1/.test(sql)) {
      return [[currentRecord && currentRecord.event_id === params[0] ? currentRecord : []].flat()];
    }
    if (/SELECT event_id, provider, event_type, order_id, payload, received_at FROM payment_webhook_events/.test(sql)) {
      return [[]];
    }
    if (/SELECT COUNT\(\*\) AS total FROM payment_webhook_events/.test(sql)) {
      return [[{ total: 0 }]];
    }
    throw new Error(`Unexpected webhook test query: ${sql}`);
  },
};

setPoolForTests(pool);
setRepositoryForTests({
  async recordAdminAuditLog(record) {
    auditRecords.push(record);
    return true;
  },
});
setTokenVerifierForTests(async token => {
  if (token === 'super-admin') {
    return {
      uid: 'webhook-super-admin',
      email: 'webhook-super-admin@example.com',
      email_verified: true,
      role: 'SUPER_ADMIN',
      permissions: ['*'],
      auth_time: Math.floor(Date.now() / 1000),
      firebase: { sign_in_second_factor: 'totp' },
    };
  }
  if (token === 'admin') {
    return { uid: 'webhook-admin', email: 'webhook-admin@example.com', email_verified: true, role: 'ADMIN' };
  }
  throw new Error('INVALID_TOKEN');
});

const app = require('../index');

test.after(() => {
  setTokenVerifierForTests(null);
  setRepositoryForTests(null);
  setPoolForTests(null);
});

test('payment webhook replay refuses to claim processing when the ledger stores metadata only', async () => {
  const beforeQueries = queryCalls.length;
  const response = await request(app)
    .post('/api/platform/payment-webhooks/evt_verified_123/replay')
    .set('Authorization', 'Bearer super-admin');

  assert.equal(response.status, 409);
  assert.equal(response.body.error?.code, 'WEBHOOK_REPLAY_UNAVAILABLE');
  assert.match(response.body.error?.message || '', /No payment state was changed/);
  assert.equal(response.body.success, undefined, 'an unsupported replay must not return a success shape');
  assert.equal(queryCalls.length, beforeQueries + 1, 'the endpoint only reads the ledger and performs no replay writes');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(auditRecords.some(record =>
    record.pathname === '/api/platform/payment-webhooks/evt_verified_123/replay'
    && record.statusCode === 409), 'the unavailable replay attempt must still be audited');
});

test('payment webhook replay still enforces Super Admin authorization and event existence', async () => {
  const denied = await request(app)
    .post('/api/platform/payment-webhooks/evt_verified_123/replay')
    .set('Authorization', 'Bearer admin');
  assert.equal(denied.status, 403);

  currentRecord = null;
  const missing = await request(app)
    .post('/api/platform/payment-webhooks/evt_missing_123/replay')
    .set('Authorization', 'Bearer super-admin');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error?.code, 'WEBHOOK_EVENT_NOT_FOUND');
  currentRecord = ledgerRecord;
});

test('payment webhook diagnostic maps MariaDB connection failures to 503', async () => {
  queryFailure = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), { code: 'ECONNREFUSED' });
  let response;
  try {
    response = await request(app)
      .get('/api/platform/payment-webhooks')
      .set('Authorization', 'Bearer super-admin');
  } finally {
    queryFailure = null;
  }
  assert.equal(response.status, 503);
  assert.equal(response.body.error?.code, 'PAYMENT_WEBHOOKS_STORAGE_UNAVAILABLE');
});

test('webhook replay maps unavailable event storage to 503 without a false success', async () => {
  queryFailure = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), { code: 'ECONNREFUSED' });
  let response;
  try {
    response = await request(app)
      .post('/api/platform/payment-webhooks/evt_verified_123/replay')
      .set('Authorization', 'Bearer super-admin');
  } finally {
    queryFailure = null;
  }
  assert.equal(response.status, 503);
  assert.equal(response.body.error?.code, 'WEBHOOK_EVENT_STORAGE_UNAVAILABLE');
  assert.equal(response.body.success, undefined);
});
