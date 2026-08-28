const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { MAX_ATTEMPTS, outboxId, queueEmailInTransaction, retryDelay, normalizeRow, processOutboxOnce } = require('../services/notificationOutbox');

test('notification outbox identity and retry policy are deterministic and bounded', () => {
  assert.equal(outboxId('event-1'), outboxId('event-1'));
  assert.notEqual(outboxId('event-1'), outboxId('event-2'));
  assert.equal(MAX_ATTEMPTS, 5);
  assert.equal(retryDelay(1), 60_000);
  assert.equal(retryDelay(2), 120_000);
  assert.ok(retryDelay(20) <= 3_600_000);
  const jittered = retryDelay(1, true);
  assert.ok(jittered >= 48_000 && jittered <= 72_000, `Jittered delay (${jittered}) should be within 80%-120% of base`);
});

test('outbox is MySQL-backed: zero Firestore primitives in the delivery queue', () => {
  const source = fs.readFileSync(require.resolve('../services/notificationOutbox'), 'utf8');
  // Durable lease semantics (crash recovery) and terminal-state handling remain.
  assert.match(source, /'DELIVERY_ATTEMPTED'/);
  assert.match(source, /DEAD_LETTER/);
  assert.match(source, /lease_owner/);
  assert.match(source, /lease_expires_at/);
  // The queue must be a MySQL table, not a Firestore collection.
  assert.match(source, /notification_outbox/);
  assert.doesNotMatch(source, /firestore/i, 'notification outbox must not reference Firestore');
  assert.doesNotMatch(source, /admin\.firestore/, 'notification outbox must not use Admin SDK sentinels');
});

test('queued email stores trusted recipient, explicit initial state, and is idempotent', async () => {
  const rows = new Map();
  const connection = {
    async query(sql, params) {
      if (/^\s*INSERT INTO notification_outbox/.test(sql)) {
        const id = params[0];
        const duplicate = [...rows.values()].find(row => row.idempotency_key === params[7]);
        if (duplicate) return [{ affectedRows: 0 }, []];
        rows.set(id, {
          id, event_id: params[1], recipient: params[2], template_type: params[3],
          vars: params[4], metadata: params[5], tenant_id: params[6],
          idempotency_key: params[7], state: 'NOTIFICATION_QUEUED',
          attempt_count: 0, next_attempt_at: params[8],
        });
        return [{ affectedRows: 1 }, []];
      }
      if (/SELECT id, event_id, recipient, template_type FROM notification_outbox/.test(sql)) {
        const row = [...rows.values()].find(candidate => candidate.idempotency_key === params[0]);
        return [[...(row ? [row] : [])], []];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const id = await queueEmailInTransaction(connection, {
    eventId: 'application:1', recipient: 'USER@example.com', templateType: 'job_status_update',
    idempotencyKey: 'application:1', vars: { status: 'interview' },
  });
  assert.equal(id, outboxId('application:1'));
  const stored = rows.get(id);
  assert.equal(stored.recipient, 'user@example.com');
  assert.equal(stored.state, 'NOTIFICATION_QUEUED');
  assert.equal(stored.attempt_count, 0);
  // Re-queue of the same event follows duplicate-key handling and returns the
  // already-bound row without broad SQL error suppression.
  await queueEmailInTransaction(connection, {
    eventId: 'application:1', recipient: 'USER@example.com', templateType: 'job_status_update',
    idempotencyKey: 'application:1', vars: { status: 'interview' },
  });
  assert.equal(rows.size, 1);
  await assert.rejects(
    () => queueEmailInTransaction(connection, {
      eventId: 'application:2', recipient: 'other@example.com', templateType: 'job_status_update',
      idempotencyKey: 'application:1', vars: { status: 'offer' },
    }),
    error => error.code === 'NOTIFICATION_IDEMPOTENCY_CONFLICT' && error.status === 409
  );
  assert.equal(rows.size, 1);
  await assert.rejects(
    () => queueEmailInTransaction(connection, { eventId: 'bad', recipient: 'victim', templateType: 'welcome' }),
    /Invalid notification outbox event/
  );
});

test('sensitive lifecycle variables are encrypted at rest and decrypt only in the worker projection', async () => {
  const priorKey = process.env.ENTERPRISE_ENCRYPTION_KEY;
  const priorVersion = process.env.ENTERPRISE_ENCRYPTION_KEY_VERSION;
  const priorProvider = process.env.ENTERPRISE_ENCRYPTION_PROVIDER;
  process.env.ENTERPRISE_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.ENTERPRISE_ENCRYPTION_KEY_VERSION = 'v91';
  process.env.ENTERPRISE_ENCRYPTION_PROVIDER = 'server-key';
  try {
    let insertParams;
    const connection = { query: async (_sql, params) => { insertParams = params; return [{ affectedRows: 1 }, []]; } };
    const secretLink = 'https://example.test/login#mode=resetPassword&token=raw-bearer-secret';
    await queueEmailInTransaction(connection, {
      eventId: 'password-reset:user-1:hash', recipient: 'user@example.com', templateType: 'password_reset',
      vars: { reset_link: secretLink, user_name: 'User' }, sensitive: true,
    });
    assert.ok(insertParams, 'outbox insert must execute');
    assert.doesNotMatch(insertParams[4], /raw-bearer-secret/, 'persisted JSON must not contain the bearer link');
    const storedVars = JSON.parse(insertParams[4]);
    assert.equal(storedVars.__enterpriseEncrypted, true);
    const event = normalizeRow({
      id: insertParams[0], event_id: insertParams[1], recipient: insertParams[2], template_type: insertParams[3],
      vars: insertParams[4], metadata: insertParams[5], state: 'NOTIFICATION_QUEUED', attempt_count: 0,
    });
    assert.equal(event.payloadError, null);
    assert.equal(event.vars.reset_link, secretLink);
  } finally {
    if (priorKey === undefined) delete process.env.ENTERPRISE_ENCRYPTION_KEY; else process.env.ENTERPRISE_ENCRYPTION_KEY = priorKey;
    if (priorVersion === undefined) delete process.env.ENTERPRISE_ENCRYPTION_KEY_VERSION; else process.env.ENTERPRISE_ENCRYPTION_KEY_VERSION = priorVersion;
    if (priorProvider === undefined) delete process.env.ENTERPRISE_ENCRYPTION_PROVIDER; else process.env.ENTERPRISE_ENCRYPTION_PROVIDER = priorProvider;
  }
});

test('sensitive enqueue and encrypted payload reads fail closed without key continuity', async () => {
  const priorKey = process.env.ENTERPRISE_ENCRYPTION_KEY;
  const priorKeys = process.env.ENTERPRISE_ENCRYPTION_KEYS;
  const priorProvider = process.env.ENTERPRISE_ENCRYPTION_PROVIDER;
  delete process.env.ENTERPRISE_ENCRYPTION_KEY;
  delete process.env.ENTERPRISE_ENCRYPTION_KEYS;
  process.env.ENTERPRISE_ENCRYPTION_PROVIDER = 'server-key';
  try {
    let queried = false;
    await assert.rejects(
      () => queueEmailInTransaction({ query: async () => { queried = true; } }, {
        eventId: 'verification:user-1:hash', recipient: 'user@example.com', templateType: 'email_verification',
        vars: { verification_link: 'https://example.test/secret' }, sensitive: true,
      }),
      error => error?.code === 'OUTBOX_ENCRYPTION_UNAVAILABLE'
    );
    assert.equal(queried, false, 'plaintext must never be inserted when encryption is unavailable');
    const event = normalizeRow({
      id: 'id', event_id: 'event', recipient: 'user@example.com', template_type: 'password_reset',
      vars: JSON.stringify({ __enterpriseEncrypted: true, alg: 'AES-256-GCM', keyVersion: 'v404', wrappedKey: 'x.y.z', iv: 'x', tag: 'y', ciphertext: 'z' }),
      metadata: '{}', state: 'NOTIFICATION_QUEUED', attempt_count: 0,
    });
    assert.equal(event.payloadError, 'OUTBOX_ENCRYPTION_UNAVAILABLE');
    assert.deepEqual(event.vars, {}, 'worker must never dispatch an unreadable encrypted payload');
  } finally {
    if (priorKey === undefined) delete process.env.ENTERPRISE_ENCRYPTION_KEY; else process.env.ENTERPRISE_ENCRYPTION_KEY = priorKey;
    if (priorKeys === undefined) delete process.env.ENTERPRISE_ENCRYPTION_KEYS; else process.env.ENTERPRISE_ENCRYPTION_KEYS = priorKeys;
    if (priorProvider === undefined) delete process.env.ENTERPRISE_ENCRYPTION_PROVIDER; else process.env.ENTERPRISE_ENCRYPTION_PROVIDER = priorProvider;
  }
});

test('an unreadable encrypted payload is never dispatched and reaches the DLQ after bounded retries', async () => {
  const priorKey = process.env.ENTERPRISE_ENCRYPTION_KEY;
  const priorKeys = process.env.ENTERPRISE_ENCRYPTION_KEYS;
  delete process.env.ENTERPRISE_ENCRYPTION_KEY;
  delete process.env.ENTERPRISE_ENCRYPTION_KEYS;
  let attemptCount = 0;
  let state = 'NOTIFICATION_QUEUED';
  let dispatchCount = 0;
  const row = () => ({
    id: 'encrypted-event-id', event_id: 'password-reset:user:hash', recipient: 'user@example.com', template_type: 'password_reset',
    vars: JSON.stringify({ __enterpriseEncrypted: true, alg: 'AES-256-GCM', keyVersion: 'v404', wrappedKey: 'x.y.z', iv: 'x', tag: 'y', ciphertext: 'z' }),
    metadata: '{}', state, attempt_count: attemptCount, max_attempts: 5, provider_accepted: 0,
  });
  const pool = {
    async query(sql, params) {
      if (/SELECT id FROM notification_outbox/.test(sql)) return [state === 'DEAD_LETTER' ? [] : [{ id: row().id }], []];
      if (/SET lease_owner/.test(sql)) return [{ affectedRows: state === 'DEAD_LETTER' ? 0 : 1 }, []];
      if (/SELECT \* FROM notification_outbox/.test(sql)) return [[row()], []];
      if (/SET state = \?, attempt_count/.test(sql)) {
        state = params[0];
        attemptCount = params[1];
        assert.equal(params[3], 'OUTBOX_ENCRYPTION_UNAVAILABLE');
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  try {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await processOutboxOnce({
        pool, workerId: 'worker-1', now: Date.now() + attempt * 4_000_000,
        dispatch: async () => { dispatchCount += 1; return { success: true }; },
      });
      assert.equal(result.processed, true);
      assert.equal(result.providerAccepted, false);
      assert.equal(state, attempt === 5 ? 'DEAD_LETTER' : 'RETRYING');
    }
    assert.equal(dispatchCount, 0);
    assert.equal((await processOutboxOnce({ pool, dispatch: async () => ({ success: true }) })).processed, false);
  } finally {
    if (priorKey === undefined) delete process.env.ENTERPRISE_ENCRYPTION_KEY; else process.env.ENTERPRISE_ENCRYPTION_KEY = priorKey;
    if (priorKeys === undefined) delete process.env.ENTERPRISE_ENCRYPTION_KEYS; else process.env.ENTERPRISE_ENCRYPTION_KEYS = priorKeys;
  }
});
