import { getPool } from '../backend/database/mysql.js';

const workerId = process.env.WORKER_ID || `worker-${process.pid}`;
const pool = getPool();

process.on('message', async (msg) => {
  if (msg.action === 'ACQUIRE_LEASE') {
    const { targetGeneration, leaseDurationMs } = msg;
    const now = Date.now();
    const expiresAt = now + (leaseDurationMs || 5000);

    try {
      const [res] = await pool.query(
        `INSERT INTO database_authority (id, generation, write_engine, mode, lease_owner, lease_expires_at)
         VALUES ('primary_authority', ?, 'mysql', 'NORMAL', ?, ?)
         ON DUPLICATE KEY UPDATE 
           generation = IF(lease_expires_at < ? OR generation < ?, VALUES(generation), generation),
           lease_owner = IF(lease_expires_at < ? OR generation < ?, VALUES(lease_owner), lease_owner),
           lease_expires_at = IF(lease_expires_at < ? OR generation < ?, VALUES(lease_expires_at), lease_expires_at)`,
        [targetGeneration, workerId, expiresAt, now, targetGeneration, now, targetGeneration, now, targetGeneration]
      );

      // Check if we actually hold the lease
      const [rows] = await pool.query('SELECT generation, lease_owner, lease_expires_at FROM database_authority WHERE id = "primary_authority"');
      const won = rows[0]?.lease_owner === workerId && Number(rows[0]?.generation) === targetGeneration;
      
      process.send({
        type: 'LEASE_RESULT',
        workerId,
        pid: process.pid,
        won,
        currentOwner: rows[0]?.lease_owner,
        generation: Number(rows[0]?.generation),
        expiresAt: rows[0]?.lease_expires_at
      });
    } catch (err) {
      process.send({
        type: 'LEASE_RESULT',
        workerId,
        pid: process.pid,
        won: false,
        error: err.message
      });
    }
  }

  if (msg.action === 'ATTEMPT_WRITE') {
    const { claimGeneration, entityId, payload } = msg;
    try {
      // Fenced write: check generation monotonicity
      const [authRows] = await pool.query('SELECT generation, lease_owner, lease_expires_at FROM database_authority WHERE id = "primary_authority"');
      const activeGen = Number(authRows[0]?.generation || 0);
      const activeOwner = authRows[0]?.lease_owner;

      if (claimGeneration < activeGen || activeOwner !== workerId) {
        process.send({
          type: 'WRITE_RESULT',
          workerId,
          pid: process.pid,
          success: false,
          rejectedReason: 'FENCING_TOKEN_STALE',
          claimGeneration,
          activeGen,
          activeOwner
        });
        return;
      }

      await pool.query(
        'INSERT INTO canonical_documents (entity_type, entity_id, revision, payload) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload), revision = VALUES(revision)',
        ['fencing_test', entityId, claimGeneration, JSON.stringify(payload)]
      );

      process.send({
        type: 'WRITE_RESULT',
        workerId,
        pid: process.pid,
        success: true,
        entityId
      });
    } catch (err) {
      process.send({
        type: 'WRITE_RESULT',
        workerId,
        pid: process.pid,
        success: false,
        error: err.message
      });
    }
  }
});
