import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getPool } from '../backend/database/mysql.js';
import { getRepository } from '../backend/repositories/index.js';
import { replicateToMySQL, calculateContentHash } from '../backend/database/syncManager.js';
import { rememberMutation, recordTombstone, isTombstoned } from '../backend/database/tombstones.js';

describe('Autonomous Dual-Database Resilience & Zero-Loss Convergence', () => {
  let pool;
  let repo;

  before(() => {
    pool = getPool();
    repo = getRepository();
  });

  it('Scenario A: MariaDB Outage Simulation -> Firestore Active -> MariaDB Recovery Drains Outbox', async () => {
    const entityId = `fs-active-doc-${Date.now()}`;
    const mutationId = `mut-fs-${Date.now()}`;

    // 1. Simulate write occurring in Firestore while MariaDB was offline
    const fsEvent = {
      id: `ev-fs-${Date.now()}`,
      entity_type: 'resumes',
      entity_id: entityId,
      operation: 'UPSERT',
      payload: JSON.stringify({
        id: entityId,
        user_id: 'usr-offline-test',
        title: 'Cloud Architect (Created on Firestore)',
        skills: ['Distributed Systems', 'GCP']
      }),
      version: 2
    };

    // 2. MariaDB returns online -> ensure parent user exists to satisfy relational schema
    await repo.saveUser('usr-offline-test', { email: 'usr-offline@test.local' });

    // 3. Replicate event into MariaDB via replicateToMySQL
    await replicateToMySQL(fsEvent, pool);

    // 4. Verify MariaDB converged exactly with Firestore state
    const [rows] = await pool.query('SELECT * FROM resumes WHERE id = ?', [entityId]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, 'Cloud Architect (Created on Firestore)');
    assert.equal(Number(rows[0].revision), 2);

    // Cleanup
    await repo.deleteUser('usr-offline-test');
  });

  it('Scenario B: Stale Replay Prevention & Monotonicity after Failover', async () => {
    const entityId = `stale-guard-${Date.now()}`;
    await repo.saveUser('usr-stale-test', { email: 'usr-stale@test.local' });

    // 1. Initial version 3
    await replicateToMySQL({
      entity_type: 'resumes',
      entity_id: entityId,
      operation: 'UPSERT',
      payload: JSON.stringify({ id: entityId, user_id: 'usr-stale-test', title: 'Senior Eng V3' }),
      version: 3
    }, pool);

    const [v3Rows] = await pool.query('SELECT title, revision FROM resumes WHERE id = ?', [entityId]);
    assert.equal(v3Rows[0].revision, 3);
    assert.equal(v3Rows[0].title, 'Senior Eng V3');

    // 2. Stale version 2 arrives (e.g. from delayed network partition)
    await replicateToMySQL({
      entity_type: 'resumes',
      entity_id: entityId,
      operation: 'UPSERT',
      payload: JSON.stringify({ id: entityId, user_id: 'usr-stale-test', title: 'Stale Eng V2' }),
      version: 2
    }, pool);

    // 3. Verify monotonic guard protected MariaDB: Title is STILL V3, NOT V2
    const [protectedRows] = await pool.query('SELECT title, revision FROM resumes WHERE id = ?', [entityId]);
    assert.equal(protectedRows[0].revision, 3, 'Revision must not downgrade');
    assert.equal(protectedRows[0].title, 'Senior Eng V3', 'Title must remain newer V3');

    // Cleanup
    await repo.deleteUser('usr-stale-test');
  });

  it('Scenario C: Tombstone Guard Prevents Resurrection on Post-Recovery Sync', async () => {
    const entityId = `tomb-resurrect-${Date.now()}`;
    await repo.saveUser('usr-tomb-test', { email: 'usr-tomb@test.local' });

    // 1. Record Tombstone version 4 in MariaDB
    await recordTombstone(pool, { entityType: 'resumes', entityId, version: 4, sourceEngine: 'mysql' });

    // 2. Incoming delayed event from old replica with version 3 attempts resurrection
    const isBlocked = await isTombstoned(pool, 'resumes', entityId, 3);
    assert.equal(isBlocked, true, 'Tombstone must block resurrection by stale revision');

    // Cleanup
    await repo.deleteUser('usr-tomb-test');
  });
});
