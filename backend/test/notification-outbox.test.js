const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { MAX_ATTEMPTS, outboxId, queueEmailInTransaction, retryDelay } = require('../services/notificationOutbox');

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
      assert.match(sql, /INSERT IGNORE INTO notification_outbox/);
      const id = params[0];
      if (![...rows.values()].some(r => r.idempotency_key === params[8])) {
        rows.set(id, {
          id,
          event_id: params[1],
          recipient: params[2],
          template_type: params[3],
          vars: params[4],
          metadata: params[5],
          tenant_id: params[6],
          idempotency_key: params[8],
          state: 'NOTIFICATION_QUEUED',
          attempt_count: 0,
          next_attempt_at: params[9],
        });
      }
      return [{ affectedRows: 1 }, []];
    },
  };
  const id = await queueEmailInTransaction(connection, { eventId: 'application:1', recipient: 'USER@example.com', templateType: 'job_status_update', vars: { status: 'interview' } });
  assert.equal(id, outboxId('application:1'));
  const stored = rows.get(id);
  assert.equal(stored.recipient, 'user@example.com');
  assert.equal(stored.state, 'NOTIFICATION_QUEUED');
  assert.equal(stored.attempt_count, 0);
  // Re-queue of the same event does not duplicate the row (INSERT IGNORE + idempotency key).
  await queueEmailInTransaction(connection, { eventId: 'application:1', recipient: 'USER@example.com', templateType: 'job_status_update', vars: { status: 'interview' } });
  assert.equal(rows.size, 1);
  await assert.rejects(
    () => queueEmailInTransaction(connection, { eventId: 'bad', recipient: 'victim', templateType: 'welcome' }),
    /Invalid notification outbox event/
  );
});
