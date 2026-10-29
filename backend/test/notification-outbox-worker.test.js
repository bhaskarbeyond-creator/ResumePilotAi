'use strict';

/**
 * Transactional outbox worker suite (DISC-022 / FS-M8A-05).
 *
 * DATABASE-BACKED: rows live in the real `notification_outbox` table, are
 * claimed through the production lease mechanism, and are verified from a
 * SEPARATE connection so the assertions are about persisted state rather than
 * about in-process bookkeeping.
 *
 * The mail provider is the only test double (an explicit external-service
 * boundary) and it uses the repository's sanctioned injection hooks:
 * `setSendMailForTests` / `resetSendMailForTests`.
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const fixtures = require('./helpers/mandate11a');
const { mariaTest, bearer } = fixtures;

if (fixtures.isMariaEnabled()) fixtures.requireDisposableTarget();

const request = require('supertest');
const app = require('../index');
const { getPool } = require('../database/mysql');
const { queueEmailInTransaction, claimDueEvent } = require('../services/notificationOutbox');
const worker = require('../services/outboxWorker');
const { setSendMailForTests, resetSendMailForTests } = require('../services/mailer');

fixtures.installIdentities();

const EVENT_PREFIX = 'm11a-outbox';
let pool;
let sentMessages = [];

async function setup() {
  pool = getPool();
  await fixtures.seedUsers(pool);
  sentMessages = [];
  setSendMailForTests(async message => {
    sentMessages.push(message);
    return { messageId: `fixture-${sentMessages.length}` };
  });
  await isolateOutbox();
}

/**
 * Park any claimable row this suite did not create so the observable batch is
 * exactly the fixture set. (The suite shares a disposable database with other
 * work; without this, an unrelated due row would join the batch and make the
 * counts non-deterministic.)
 */
async function isolateOutbox() {
  await pool.query(
    `UPDATE notification_outbox
        SET next_attempt_at = ?
      WHERE event_id NOT LIKE ?
        AND state IN ('NOTIFICATION_QUEUED', 'RETRYING', 'DELIVERY_ATTEMPTED')
        AND attempt_count < max_attempts`,
    [Date.now() + 24 * 60 * 60_000, `${EVENT_PREFIX}%`]
  ).catch(() => {});
}

async function cleanupEvents() {
  await pool.query('DELETE FROM notification_outbox WHERE event_id LIKE ?', [`${EVENT_PREFIX}%`]).catch(() => {});
}

/** Enqueue one outbox row and pin its due time so ordering is deterministic. */
async function enqueue({ key, templateType = 'welcome', recipient = 'candidate@m11a.test', dueAt = 1, vars = { candidate_name: 'Outbox Candidate' }, metadata = {} }) {
  const connection = await pool.getConnection();
  let id;
  try {
    await connection.beginTransaction();
    id = await queueEmailInTransaction(connection, {
      eventId: `${EVENT_PREFIX}:${key}`,
      idempotencyKey: `${EVENT_PREFIX}:${key}`,
      recipient,
      templateType,
      vars,
      metadata,
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
  await pool.query('UPDATE notification_outbox SET next_attempt_at = ? WHERE id = ?', [dueAt, id]);
  return id;
}

async function readRow(id) {
  const [rows] = await pool.query('SELECT * FROM notification_outbox WHERE id = ?', [id]);
  return rows[0];
}

test.after(async () => {
  resetSendMailForTests();
  if (!fixtures.isMariaEnabled() || !pool) return;
  await cleanupEvents();
  await fixtures.cleanup(pool, { userIds: Object.values(fixtures.IDENTITIES).map(identity => identity.uid) });
  await pool.end().catch(() => {});
});

// ─── Unit-level validation (executes without a database) ───────────────────

test('batch size is validated and capped', () => {
  assert.equal(worker.normalizeBatchSize(undefined), worker.DEFAULT_BATCH_SIZE);
  assert.equal(worker.normalizeBatchSize(5), 5);
  assert.equal(worker.normalizeBatchSize('100'), 100);
  for (const invalid of [0, -1, 101, 1.5, 'ten', null === null ? Infinity : 0]) {
    assert.throws(() => worker.normalizeBatchSize(invalid), error => error.code === 'INVALID_BATCH_SIZE', `batchSize ${invalid} must be rejected`);
  }
  assert.equal(worker.MAX_BATCH_SIZE, 100);
  assert.ok(worker.DELIVERABLE_TEMPLATE_TYPES.includes('welcome'));
  assert.equal(worker.DELIVERABLE_TEMPLATE_TYPES.includes('unsupported_template_type'), false);
});

test('error sanitization removes newlines, credentials and unbounded text', () => {
  const sanitized = worker.sanitizeError(new Error(`smtp failure\npassword=hunter2 token=abc123 ${'x'.repeat(900)}`));
  assert.equal(sanitized.includes('\n'), false);
  assert.equal(sanitized.includes('hunter2'), false);
  assert.equal(sanitized.includes('abc123'), false);
  assert.ok(sanitized.length <= 500);
  assert.equal(worker.sanitizeError(new Error('   ')), 'Delivery attempt failed');
});

// ─── Processing ────────────────────────────────────────────────────────────

mariaTest('messages are processed oldest-due first and the batch size is enforced', async () => {
  await setup();
  await cleanupEvents();
  const first = await enqueue({ key: 'order-1', dueAt: 1000, recipient: 'one@m11a.test' });
  const second = await enqueue({ key: 'order-2', dueAt: 2000, recipient: 'two@m11a.test' });
  const third = await enqueue({ key: 'order-3', dueAt: 3000, recipient: 'three@m11a.test' });

  const batch = await worker.processPendingOutboxMessages({ pool, batchSize: 2, now: Date.now() });
  assert.equal(batch.processed, 2);
  assert.deepEqual(sentMessages.map(message => message.to), ['one@m11a.test', 'two@m11a.test']);
  assert.equal((await readRow(first)).state, 'DELIVERED');
  assert.equal((await readRow(second)).state, 'DELIVERED');
  assert.equal((await readRow(third)).state, 'NOTIFICATION_QUEUED', 'the batch limit must stop processing');

  const remainder = await worker.processPendingOutboxMessages({ pool, batchSize: 25, now: Date.now() });
  assert.equal(remainder.processed, 1);
  assert.equal((await readRow(third)).state, 'DELIVERED');
  await assert.rejects(
    () => worker.processPendingOutboxMessages({ pool, batchSize: 500 }),
    error => error.code === 'INVALID_BATCH_SIZE'
  );
});

mariaTest('successful delivery persists DELIVERED with the mailer payload and delivery timestamp', async () => {
  await setup();
  await cleanupEvents();
  const id = await enqueue({ key: 'success', dueAt: 10, recipient: 'delivered@m11a.test' });

  const outcome = await worker.processPendingOutboxMessages({ pool, batchSize: 5 });
  assert.equal(outcome.processed, 1);
  assert.equal(outcome.successes, 1);
  assert.equal(outcome.failures, 0);

  assert.equal(sentMessages.length, 1);
  const message = sentMessages[0];
  assert.equal(message.to, 'delivered@m11a.test');
  assert.ok(typeof message.subject === 'string' && message.subject.length > 0);
  assert.ok(typeof message.html === 'string' && message.html.length > 0);
  assert.ok(typeof message.text === 'string' && message.text.length > 0);

  const row = await readRow(id);
  assert.equal(row.state, 'DELIVERED');
  assert.equal(Number(row.provider_accepted), 1);
  assert.ok(row.provider_accepted_at, 'delivered_at equivalent must be recorded');
  assert.equal(row.last_error, null);
  assert.equal(Number(row.attempt_count), 1);
});

mariaTest('a delivery failure increments the attempt count and stores a bounded error', async () => {
  await setup();
  await cleanupEvents();
  const id = await enqueue({ key: 'failure', dueAt: 10, recipient: 'failing@m11a.test' });
  setSendMailForTests(async () => {
    throw new Error('SMTP said no\npassword=supersecret and the connection died');
  });

  const outcome = await worker.processPendingOutboxMessages({ pool, batchSize: 5 });
  assert.equal(outcome.processed, 1);
  assert.equal(outcome.failures, 1);

  const row = await readRow(id);
  assert.equal(row.state, 'RETRYING');
  assert.equal(Number(row.attempt_count), 1);
  assert.ok(Number(row.next_attempt_at) > Date.now(), 'retry must be scheduled in the future');
  assert.ok(String(row.last_error).length <= 500);
  assert.equal(String(row.last_error).includes('\n'), false);
  assert.equal(String(row.last_error).includes('supersecret'), false);
});

mariaTest('the fifth failed attempt dead-letters the message and it is never retried', async () => {
  await setup();
  await cleanupEvents();
  const id = await enqueue({ key: 'dead-letter', dueAt: 10, recipient: 'dead@m11a.test' });
  setSendMailForTests(async () => { throw new Error('provider is down'); });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await pool.query('UPDATE notification_outbox SET next_attempt_at = 0 WHERE id = ?', [id]);
    const outcome = await worker.processPendingOutboxMessages({ pool, batchSize: 1 });
    assert.equal(outcome.processed, 1, `attempt ${attempt} must be processed`);
    assert.equal(outcome.failures, 1);
  }

  const dead = await readRow(id);
  assert.equal(dead.state, 'DEAD_LETTER');
  assert.equal(Number(dead.attempt_count), 5);

  // Dead-letter rows leave the claimable set: a further run processes nothing.
  sentMessages = [];
  setSendMailForTests(async message => { sentMessages.push(message); return { messageId: 'never' }; });
  await pool.query('UPDATE notification_outbox SET next_attempt_at = 0 WHERE id = ?', [id]);
  const after = await worker.processPendingOutboxMessages({ pool, batchSize: 10 });
  assert.equal(after.processed, 0);
  assert.equal(sentMessages.length, 0, 'a dead-lettered message must not be retried automatically');
});

mariaTest('one failing message does not stop the rest of the batch', async () => {
  await setup();
  await cleanupEvents();
  const failing = await enqueue({ key: 'mixed-1', dueAt: 100, recipient: 'boom@m11a.test' });
  const okOne = await enqueue({ key: 'mixed-2', dueAt: 200, recipient: 'fine1@m11a.test' });
  const okTwo = await enqueue({ key: 'mixed-3', dueAt: 300, recipient: 'fine2@m11a.test' });
  setSendMailForTests(async message => {
    if (message.to === 'boom@m11a.test') throw new Error('only this recipient fails');
    sentMessages.push(message);
    return { messageId: `ok-${message.to}` };
  });

  const outcome = await worker.processPendingOutboxMessages({ pool, batchSize: 10 });
  assert.equal(outcome.processed, 3);
  assert.equal(outcome.successes, 2);
  assert.equal(outcome.failures, 1);
  assert.equal((await readRow(failing)).state, 'RETRYING');
  assert.equal((await readRow(okOne)).state, 'DELIVERED');
  assert.equal((await readRow(okTwo)).state, 'DELIVERED');
});

mariaTest('an expired lease is recovered and the message is delivered by the next worker', async () => {
  await setup();
  await cleanupEvents();
  const id = await enqueue({ key: 'stale-claim', dueAt: 10, recipient: 'stale@m11a.test' });

  const startedAt = Date.now();
  const claimed = await claimDueEvent(pool, 'crashed-worker', startedAt);
  assert.equal(claimed.id, id, 'the production claim must lease the row');
  const leased = await readRow(id);
  assert.equal(leased.state, 'DELIVERY_ATTEMPTED');
  assert.equal(leased.lease_owner, 'crashed-worker');

  // The crashed worker never finishes; after the lease expires the row is
  // reclaimable and the next pass delivers it.
  const recovered = await worker.processPendingOutboxMessages({ pool, batchSize: 5, now: startedAt + 10 * 60_000 });
  assert.equal(recovered.processed, 1);
  assert.equal(recovered.successes, 1);
  const row = await readRow(id);
  assert.equal(row.state, 'DELIVERED');
  assert.equal(row.lease_owner, null);
});

mariaTest('unsupported message types are never recorded as delivered', async () => {
  await setup();
  await cleanupEvents();
  const id = await enqueue({ key: 'unsupported', dueAt: 10, templateType: 'unsupported_template_type', recipient: 'weird@m11a.test' });

  const outcome = await worker.processPendingOutboxMessages({ pool, batchSize: 5 });
  assert.equal(outcome.processed, 1);
  assert.equal(outcome.successes, 0);
  assert.equal(outcome.failures, 1);
  const row = await readRow(id);
  assert.notEqual(row.state, 'DELIVERED');
  assert.equal(row.state, 'RETRYING');
});

mariaTest('a calendar invitation travels as an iCalendar MIME alternative', async () => {
  await setup();
  await cleanupEvents();
  const calendar = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test@ime365.com\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  await enqueue({
    key: 'calendar',
    dueAt: 10,
    templateType: 'interview-invitation',
    recipient: 'calendar@m11a.test',
    metadata: { calendar, calendarMethod: 'REQUEST', customSubject: 'Interview confirmed' },
  });
  await worker.processPendingOutboxMessages({ pool, batchSize: 5 });
  assert.equal(sentMessages.length, 1);
  const message = sentMessages[0];
  assert.equal(message.subject, 'Interview confirmed');
  assert.ok(Array.isArray(message.alternatives));
  assert.match(message.alternatives[0].contentType, /^text\/calendar; method=REQUEST; charset=UTF-8$/);
  assert.equal(message.alternatives[0].content, calendar);
});

mariaTest('delivery state is durable across database connections', async () => {
  await setup();
  await cleanupEvents();
  const id = await enqueue({ key: 'durable', dueAt: 10, recipient: 'durable@m11a.test' });
  await worker.processPendingOutboxMessages({ pool, batchSize: 5 });

  const mysql = require('mysql2/promise');
  const independent = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  });
  try {
    const [rows] = await independent.query('SELECT state, attempt_count FROM notification_outbox WHERE id = ?', [id]);
    assert.equal(rows[0].state, 'DELIVERED');
    assert.equal(Number(rows[0].attempt_count), 1);
  } finally {
    await independent.end();
  }
});

// ─── Statistics and administrative authorization ───────────────────────────

mariaTest('statistics report persisted state counts only', async () => {
  await setup();
  await cleanupEvents();
  await enqueue({ key: 'stats-pending', dueAt: 10, recipient: 'pending@m11a.test' });
  const delivered = await enqueue({ key: 'stats-delivered', dueAt: 20, recipient: 'stats1@m11a.test' });
  const dead = await enqueue({ key: 'stats-dead', dueAt: 30, recipient: 'stats2@m11a.test' });
  await enqueue({ key: 'stats-still-pending', dueAt: 40, recipient: 'stats3@m11a.test' });
  await worker.processPendingOutboxMessages({ pool, batchSize: 2 });
  await pool.query("UPDATE notification_outbox SET state = 'DEAD_LETTER' WHERE id = ?", [dead]);

  const stats = await worker.getOutboxStats({ pool });
  assert.ok(stats.pending >= 1);
  assert.ok(stats.delivered >= 1);
  assert.ok(stats.deadLetter >= 1);
  assert.equal(stats.total, Object.values(stats.states).reduce((sum, value) => sum + value, 0));
  const serialized = JSON.stringify(stats);
  assert.equal(serialized.includes('@m11a.test'), false, 'statistics must not expose recipients');
  assert.equal(serialized.includes('stats1'), false);
  assert.equal((await readRow(delivered)).state, 'DELIVERED');

  const response = await request(app).get('/api/admin/system/outbox/stats').set(bearer('admin'));
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(response.body.pending >= 1);
  assert.ok(response.body.delivered >= 1);
  assert.ok(response.body.deadLetter >= 1);
  assert.equal(JSON.stringify(response.body).includes('@m11a.test'), false);
});

mariaTest('outbox administration requires administrator authority', async () => {
  await setup();
  await cleanupEvents();

  const anonymousStats = await request(app).get('/api/admin/system/outbox/stats');
  assert.equal(anonymousStats.status, 401);
  const userStats = await request(app).get('/api/admin/system/outbox/stats').set(bearer('owner'));
  assert.equal(userStats.status, 403);
  assert.equal(userStats.body?.error?.code, 'FORBIDDEN');
  const auditorStats = await request(app).get('/api/admin/system/outbox/stats').set(bearer('auditor'));
  assert.equal(auditorStats.status, 403, 'a read-only auditor must not read operator outbox internals');

  const anonymousProcess = await request(app).post('/api/admin/system/outbox/process').send({ batchSize: 5 });
  assert.equal(anonymousProcess.status, 401);
  const userProcess = await request(app).post('/api/admin/system/outbox/process').set(bearer('owner')).send({ batchSize: 5 });
  assert.equal(userProcess.status, 403);

  await enqueue({ key: 'admin-process-1', dueAt: 10, recipient: 'admin1@m11a.test' });
  await enqueue({ key: 'admin-process-2', dueAt: 20, recipient: 'admin2@m11a.test' });
  const adminProcess = await request(app)
    .post('/api/admin/system/outbox/process')
    .set(bearer('admin'))
    .send({ batchSize: 25 });
  assert.equal(adminProcess.status, 200);
  assert.equal(adminProcess.body.processed, 2);
  assert.equal(adminProcess.body.successes, 2);
  assert.equal(adminProcess.body.failures, 0);
  assert.equal(adminProcess.body.batchSize, 25);

  const invalid = await request(app)
    .post('/api/admin/system/outbox/process')
    .set(bearer('admin'))
    .send({ batchSize: 1000 });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body?.error?.code, 'INVALID_BATCH_SIZE');
});
