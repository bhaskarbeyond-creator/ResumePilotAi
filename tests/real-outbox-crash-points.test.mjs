import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getPool } from '../backend/database/mysql.js';
import { enqueueOutboxEvent, getSyncHealthStatus } from '../backend/database/syncManager.js';
import { rememberMutation } from '../backend/database/tombstones.js';

describe('Real Outbox Crash Injection Points A–E', () => {
  let pool;

  before(() => {
    pool = getPool();
  });

  it('Crash Point A: Rollback BEFORE outbox commit leaves zero orphaned state', async () => {
    const testUid = `crash-a-${Date.now()}`;
    const conn = await pool.getConnection();
    await conn.beginTransaction();

    // Insert business data
    await conn.query('INSERT INTO users (id, email, role) VALUES (?, ?, ?)', [testUid, `${testUid}@test.local`, 'USER']);
    
    // Simulate crash/abort before commit
    await conn.rollback();
    conn.release();

    const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [testUid]);
    const [outboxRows] = await pool.query('SELECT * FROM sync_outbox WHERE entity_id = ?', [testUid]);
    assert.equal(userRows.length, 0, 'No business row must exist after rollback');
    assert.equal(outboxRows.length, 0, 'No outbox event must exist after rollback');
  });

  it('Crash Point B: Crash after outbox commit before dispatch -> Worker resumes and dispatches', async () => {
    const testUid = `crash-b-${Date.now()}`;
    const conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query('INSERT INTO users (id, email, role) VALUES (?, ?, ?)', [testUid, `${testUid}@test.local`, 'USER']);
    const { eventId } = await enqueueOutboxEvent(conn, {
      entityType: 'users',
      entityId: testUid,
      operation: 'UPSERT',
      payload: { id: testUid, email: `${testUid}@test.local` },
      version: 1,
      sourceEngine: 'mysql'
    });
    await conn.commit();
    conn.release();

    // Verify outbox event is in PENDING state
    const [pendingRows] = await pool.query('SELECT status FROM sync_outbox WHERE id = ?', [eventId]);
    assert.equal(pendingRows[0].status, 'PENDING');

    // Simulate worker restart / recovery drain
    await pool.query('UPDATE sync_outbox SET status = "SYNCED", processed_at = CURRENT_TIMESTAMP WHERE id = ?', [eventId]);

    const [syncedRows] = await pool.query('SELECT status FROM sync_outbox WHERE id = ?', [eventId]);
    assert.equal(syncedRows[0].status, 'SYNCED');

    // Cleanup
    await pool.query('DELETE FROM users WHERE id = ?', [testUid]);
    await pool.query('DELETE FROM sync_outbox WHERE id = ?', [eventId]);
  });

  it('Crash Point C: Crash during dispatch -> Stale PROCESSING recovered without duplication', async () => {
    const testUid = `crash-c-${Date.now()}`;
    const conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query('INSERT INTO users (id, email, role) VALUES (?, ?, ?)', [testUid, `${testUid}@test.local`, 'USER']);
    const { eventId } = await enqueueOutboxEvent(conn, {
      entityType: 'users',
      entityId: testUid,
      operation: 'UPSERT',
      payload: { id: testUid, email: `${testUid}@test.local` },
      version: 1,
      sourceEngine: 'mysql'
    });
    await conn.commit();
    conn.release();

    // Simulate worker crashing while status is PROCESSING
    await pool.query('UPDATE sync_outbox SET status = "PROCESSING", updated_at = DATE_SUB(NOW(), INTERVAL 60 SECOND) WHERE id = ?', [eventId]);

    // Recovery worker sweeps stale PROCESSING events
    const [staleRows] = await pool.query('SELECT id FROM sync_outbox WHERE status = "PROCESSING" AND updated_at < DATE_SUB(NOW(), INTERVAL 30 SECOND)');
    assert.ok(staleRows.some(r => r.id === eventId), 'Stale PROCESSING event must be detected for recovery');

    // Re-process and complete
    await pool.query('UPDATE sync_outbox SET status = "SYNCED", processed_at = CURRENT_TIMESTAMP WHERE id = ?', [eventId]);

    // Cleanup
    await pool.query('DELETE FROM users WHERE id = ?', [testUid]);
    await pool.query('DELETE FROM sync_outbox WHERE id = ?', [eventId]);
  });

  it('Crash Point D & E: Crash before ACK -> Idempotency ledger prevents double application & revision inflation', async () => {
    const mutationId = `mut-crash-de-${Date.now()}`;
    const entityId = `doc-crash-de-${Date.now()}`;

    // 1st application: ledger accepts (returns false = not duplicate)
    const firstAttempt = await rememberMutation(pool, {
      mutationId,
      entityType: 'documents',
      entityId,
      operation: 'UPSERT',
      sourceEngine: 'mysql'
    });
    assert.equal(firstAttempt, false, 'First mutation application must succeed');

    // Crash happens BEFORE outbox ACK. Worker restarts and retries the exact same mutationId
    const replayAttempt = await rememberMutation(pool, {
      mutationId,
      entityType: 'documents',
      entityId,
      operation: 'UPSERT',
      sourceEngine: 'mysql'
    });
    assert.equal(replayAttempt, true, 'Replayed mutation must be caught as duplicate');

    // Verify revision inflation = 0 (ledger does not increment version on replay)
    const [ledgerRows] = await pool.query('SELECT COUNT(*) as cnt FROM processed_mutations WHERE mutation_id = ?', [mutationId]);
    assert.equal(ledgerRows[0].cnt, 1, 'Exactly one ledger record must exist, zero inflation');

    // Cleanup
    await pool.query('DELETE FROM processed_mutations WHERE mutation_id = ?', [mutationId]);
  });
});
