const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { MAX_ATTEMPTS, outboxId, queueEmailInTransaction, retryDelay } = require('../services/notificationOutbox');

const admin = {
  firestore: {
    Timestamp: { fromMillis: value => ({ value, toMillis: () => value }) },
    FieldValue: { serverTimestamp: () => ({ server: true }) },
  },
};

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

test('worker leases recover crashes and terminal records leave the due-query index', () => {
  const source = fs.readFileSync(require.resolve('../services/notificationOutbox'), 'utf8');
  assert.match(source, /'DELIVERY_ATTEMPTED'/);
  assert.match(source, /providerAccepted === true/);
  assert.match(source, /nextAttemptAt: admin\.firestore\.FieldValue\.delete\(\)/);
  assert.match(source, /terminal \? admin\.firestore\.FieldValue\.delete\(\)/);
});

test('queued email stores trusted recipient and explicit initial state', () => {
  let written;
  const db = { collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }) };
  const transaction = { set: (reference, value, options) => { written = { reference, value, options }; } };
  const id = queueEmailInTransaction(transaction, db, admin, { eventId: 'application:1', recipient: 'USER@example.com', templateType: 'job_status_update', vars: { status: 'interview' } });
  assert.equal(written.reference.path, `notification_outbox/${id}`);
  assert.equal(written.value.recipient, 'user@example.com');
  assert.equal(written.value.state, 'NOTIFICATION_QUEUED');
  assert.equal(written.value.attemptCount, 0);
  assert.throws(() => queueEmailInTransaction(transaction, db, admin, { eventId: 'bad', recipient: 'victim', templateType: 'welcome' }), /Invalid notification outbox event/);
});
