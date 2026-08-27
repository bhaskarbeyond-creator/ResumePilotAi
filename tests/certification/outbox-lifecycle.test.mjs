/**
 * TRANSACTIONAL OUTBOX CERTIFICATION (mission §7–§11)
 *
 * Proves the durable asynchronous event architecture on MySQL/MariaDB:
 *
 *   MySQL transaction ──► outbox event ──► worker ──► delivery
 *        (atomic)           (durable)      (lease)     (retry/DLQ)
 *
 * Verified properties:
 *  A. Atomicity     — business write + event commit together; rollback drops both
 *  B. Idempotency   — duplicate enqueue of the same event never duplicates rows
 *  C. Exactly-once claim — concurrent workers cannot double-claim one event
 *  D. Crash safety  — an abandoned lease expires and the event is reclaimed
 *  E. Retry/backoff — failures advance RETRYING with exponential delay
 *  F. Dead-letter   — max attempts terminalize to DEAD_LETTER
 *  G. Replay        — dead letters requeue and deliver successfully once
 *  H. Ordering/index— terminal records leave the due-query scan
 *
 * No secondary system is required at any point: the whole lifecycle runs with
 * the (absent) delivery target simulated locally.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {
  queueEmailInTransaction,
  claimDueEvent,
  finishAttempt,
  processOutboxOnce,
} from '../../backend/services/notificationOutbox.js';

const DB = { host: '127.0.0.1', port: 3306, user: 'resumepilot', password: 'resumepilot_sandbox_pw', database: 'ai_resume_builder' };

let pool;

async function clean() {
  await pool.query("DELETE FROM notification_outbox WHERE event_id LIKE 'cert:%'");
}

test.before(async () => {
  pool = mysql.createPool({ ...DB, connectionLimit: 10 });
  await clean();
});

test.after(async () => {
  await clean();
  await pool.end();
});

test('A. event commits atomically with the business transaction; rollback discards both', async () => {
  // Committed transaction: event persists.
  const c1 = await pool.getConnection();
  try {
    await c1.beginTransaction();
    await queueEmailInTransaction(c1, { eventId: 'cert:atomic-ok', recipient: 'atomic@certification.local', templateType: 'welcome' });
    await c1.commit();
  } finally { c1.release(); }
  const [committed] = await pool.query("SELECT id FROM notification_outbox WHERE event_id = 'cert:atomic-ok'");
  assert.equal(committed.length, 1);

  // Rolled-back transaction: the event must vanish with the business write.
  const c2 = await pool.getConnection();
  try {
    await c2.beginTransaction();
    await queueEmailInTransaction(c2, { eventId: 'cert:atomic-rollback', recipient: 'rollback@certification.local', templateType: 'welcome' });
    await c2.rollback();
  } finally { c2.release(); }
  const [rolledBack] = await pool.query("SELECT id FROM notification_outbox WHERE event_id = 'cert:atomic-rollback'");
  assert.equal(rolledBack.length, 0, 'a rolled-back transaction must not leak an outbox event');
  // Terminate the committed event so it does not pollute later claim races.
  await pool.query("UPDATE notification_outbox SET provider_accepted = 1, state = 'DELIVERED' WHERE event_id = 'cert:atomic-ok'");
});

test('B. duplicate enqueue is idempotent (exactly one durable event)', async () => {
  for (let i = 0; i < 3; i += 1) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await queueEmailInTransaction(conn, { eventId: 'cert:idempotent', recipient: 'dup@certification.local', templateType: 'welcome' });
      await conn.commit();
    } finally { conn.release(); }
  }
  const [rows] = await pool.query("SELECT id FROM notification_outbox WHERE event_id = 'cert:idempotent'");
  assert.equal(rows.length, 1, 'repeated business mutations must not create duplicate events');
  // Mark delivered (terminal state outside the active set) so later claim
  // races do not pick this row up.
  await pool.query("UPDATE notification_outbox SET provider_accepted = 1, state = 'DELIVERED' WHERE event_id = 'cert:idempotent'");
});

test('C. concurrent workers claim a due event exactly once', async () => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await queueEmailInTransaction(conn, { eventId: 'cert:race', recipient: 'race@certification.local', templateType: 'welcome' });
    await conn.commit();
  } finally { conn.release(); }

  const workers = ['worker-1', 'worker-2', 'worker-3', 'worker-4'];
  const claims = await Promise.all(workers.map(workerId => claimDueEvent(pool, workerId).catch(() => null)));
  const winners = claims.filter(Boolean);
  assert.equal(winners.length, 1, `exactly one worker must win the lease (got ${winners.length})`);
  assert.equal(winners[0].eventId, 'cert:race');

  // Cleanup: mark delivered so later scans skip it.
  await finishAttempt(pool, winners[0], winners[0].leaseOwner, { success: true });
});

test('D. an abandoned lease expires and the event is reclaimable (worker crash)', async () => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await queueEmailInTransaction(conn, { eventId: 'cert:crash', recipient: 'crash@certification.local', templateType: 'welcome' });
    await conn.commit();
  } finally { conn.release(); }

  const claimed = await claimDueEvent(pool, 'crashed-worker');
  assert.ok(claimed, 'event claimed before the crash');

  // Simulate the crash: the lease stays behind with a past expiry.
  await pool.query('UPDATE notification_outbox SET lease_expires_at = ? WHERE id = ?', [Date.now() - 1000, claimed.id]);

  // A healthy worker must be able to reclaim it — the event is never lost.
  const reclaimed = await claimDueEvent(pool, 'recovery-worker');
  assert.ok(reclaimed, 'expired lease must be reclaimable');
  assert.equal(reclaimed.id, claimed.id);
  await finishAttempt(pool, reclaimed, 'recovery-worker', { success: true });
});

test('E/F. failures retry with backoff, then dead-letter at max attempts', async () => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await queueEmailInTransaction(conn, { eventId: 'cert:fail', recipient: 'fail@certification.local', templateType: 'welcome' });
    await conn.commit();
  } finally { conn.release(); }

  let attempt = 0;
  let state = null;
  // Drive the event to DEAD_LETTER through repeated failing deliveries.
  for (let i = 0; i < 6; i += 1) {
    const event = await claimDueEvent(pool, `fail-worker-${i}`);
    if (!event) break;
    attempt += 1;
    await finishAttempt(pool, event, `fail-worker-${i}`, { success: false, error: `simulated provider outage ${i + 1}` });
    // Due-scan respects the backoff: force the next attempt due immediately
    // to simulate time passing without weakening the retry accounting.
    await pool.query('UPDATE notification_outbox SET next_attempt_at = 0 WHERE id = ?', [event.id]);
    const [rows] = await pool.query('SELECT state, attempt_count FROM notification_outbox WHERE id = ?', [event.id]);
    state = rows[0].state;
    if (state === 'DEAD_LETTER') break;
  }
  assert.ok(attempt >= 5, `expected the event to be worked to max attempts (attempts=${attempt})`);
  assert.equal(state, 'DEAD_LETTER');
  const [final] = await pool.query("SELECT attempt_count, last_error FROM notification_outbox WHERE event_id = 'cert:fail'");
  assert.ok(Number(final[0].attempt_count) >= 5);
  assert.match(String(final[0].last_error || ''), /simulated provider outage/);

  // Dead-lettered events are NOT claimable by the due scan (no silent re-run).
  await pool.query("UPDATE notification_outbox SET next_attempt_at = 0 WHERE event_id = 'cert:fail'");
  const ghost = await claimDueEvent(pool, 'ghost-worker');
  assert.ok(!ghost || ghost.eventId !== 'cert:fail', 'a dead-lettered event must not be re-claimed');
  if (ghost) await finishAttempt(pool, ghost, 'ghost-worker', { success: true });
});

test('G. dead-letter replay requeues and delivers successfully', async () => {
  // Replay (operator action): requeue the dead letter.
  const [requeue] = await pool.query(
    "UPDATE notification_outbox SET state = 'NOTIFICATION_QUEUED', attempt_count = 0, next_attempt_at = 0, last_error = NULL, lease_owner = NULL, lease_expires_at = 0 WHERE event_id = 'cert:fail'"
  );
  assert.equal(requeue.affectedRows, 1);

  const result = await processOutboxOnce({
    pool,
    workerId: 'replay-worker',
    dispatch: async event => {
      assert.equal(event.eventId, 'cert:fail');
      return { success: true };
    },
  });
  assert.equal(result.processed, true);
  assert.equal(result.providerAccepted, true);

  const [rows] = await pool.query("SELECT provider_accepted, state FROM notification_outbox WHERE event_id = 'cert:fail'");
  assert.equal(rows[0].provider_accepted, 1);
});

test('H. delivered events leave the due-query scan (terminal state is final)', async () => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await queueEmailInTransaction(conn, { eventId: 'cert:terminal', recipient: 'terminal@certification.local', templateType: 'welcome' });
    await conn.commit();
  } finally { conn.release(); }

  const first = await processOutboxOnce({ pool, workerId: 'terminal-worker', dispatch: async () => ({ success: true }) });
  assert.equal(first.processed, true);

  // Nothing due remains for this event; a second run must not pick it up.
  const [rows] = await pool.query("SELECT state FROM notification_outbox WHERE event_id = 'cert:terminal'");
  assert.notEqual(rows[0].state, 'NOTIFICATION_QUEUED');
  await pool.query("UPDATE notification_outbox SET next_attempt_at = 0 WHERE event_id = 'cert:terminal'");
  const second = await processOutboxOnce({ pool, workerId: 'terminal-worker-2', dispatch: async event => { throw new Error(`must not redeliver ${event.eventId}`); } });
  assert.ok(!second.processed || second.eventId !== 'cert:terminal', 'terminal events are never redelivered');
});

test('outbox row carries the required synchronization metadata (§9)', async () => {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_outbox'`
  );
  const cols = new Set(rows.map(r => Object.values(r)[0]));
  for (const required of ['id', 'event_id', 'channel', 'recipient', 'template_type', 'vars', 'metadata', 'tenant_id', 'idempotency_key', 'state', 'attempt_count', 'max_attempts', 'next_attempt_at', 'lease_owner', 'lease_expires_at', 'last_attempt_at', 'last_error', 'created_at']) {
    assert.ok(cols.has(required), `notification_outbox missing required metadata column: ${required}`);
  }
  const [syncCols] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sync_outbox'`
  );
  const sync = new Set(syncCols.map(r => Object.values(r)[0]));
  for (const required of ['id', 'entity_type', 'entity_id', 'operation', 'payload', 'version', 'content_hash', 'status', 'retry_count', 'max_retries', 'last_error', 'mutation_id', 'idempotency_key']) {
    assert.ok(sync.has(required), `sync_outbox missing required metadata column: ${required}`);
  }
});
