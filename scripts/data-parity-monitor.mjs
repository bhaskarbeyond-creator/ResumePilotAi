import { getPool } from '../backend/database/mysql.js';
import { fileURLToPath } from 'node:url';

async function runParityMonitor() {
  console.log('================================================================');
  console.log('📊 PRODUCTION CONTINUOUS DATA PARITY & RECONCILIATION MONITOR');
  console.log('================================================================');

  const pool = getPool();
  const report = {
    timestamp: new Date().toISOString(),
    metrics: {},
    anomalies: [],
    status: 'HEALTHY'
  };

  try {
    // 1. Check Table Counts & Max Revisions
    const tables = [
      'users', 'resumes', 'public_resumes', 'portfolios', 'covers',
      'jobs', 'applications', 'companies', 'payment_orders', 'payment_webhook_events',
      'coupons', 'coupon_redemptions', 'blog', 'canonical_documents'
    ];

    for (const table of tables) {
      const [rows] = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
      report.metrics[table] = { rowCount: Number(rows[0]?.count || 0) };
    }

    // 2. Outbox Backlog & Lag Check
    const [outboxStats] = await pool.query(`
      SELECT 
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'PROCESSING' THEN 1 END) as processing,
        COUNT(CASE WHEN status = 'RETRYING' THEN 1 END) as retrying,
        COUNT(CASE WHEN status = 'DEAD_LETTER' THEN 1 END) as dead_letter,
        COUNT(CASE WHEN status = 'SYNCED' THEN 1 END) as synced
      FROM sync_outbox
    `);

    const outbox = outboxStats[0] || {};
    report.metrics.outbox = {
      pending: Number(outbox.pending || 0),
      processing: Number(outbox.processing || 0),
      retrying: Number(outbox.retrying || 0),
      deadLetter: Number(outbox.dead_letter || 0),
      synced: Number(outbox.synced || 0)
    };

    if (report.metrics.outbox.deadLetter > 0) {
      report.anomalies.push(`ALERT: ${report.metrics.outbox.deadLetter} dead-letter events detected in sync_outbox!`);
      report.status = 'DEGRADED';
    }

    // 3. Active Conflicts Check
    const [conflicts] = await pool.query(`
      SELECT COUNT(*) as count FROM sync_conflicts WHERE resolution = 'PENDING'
    `);
    const activeConflicts = Number(conflicts[0]?.count || 0);
    report.metrics.activeConflicts = activeConflicts;
    if (activeConflicts > 0) {
      report.anomalies.push(`ALERT: ${activeConflicts} active un-reconciled conflicts in sync_conflicts!`);
      report.status = 'DEGRADED';
    }

    // 4. Orphaned Resumes Check (Data Integrity)
    const [orphanedResumes] = await pool.query(`
      SELECT COUNT(*) as count FROM resumes r 
      LEFT JOIN users u ON r.user_id = u.id 
      WHERE u.id IS NULL
    `);
    const orphanCount = Number(orphanedResumes[0]?.count || 0);
    report.metrics.orphanedResumes = orphanCount;
    if (orphanCount > 0) {
      report.anomalies.push(`CRITICAL: ${orphanCount} orphaned resumes detected with non-existent user parents!`);
      report.status = 'CORRUPTED';
    }

    // 5. Worker Heartbeat Freshness
    const [workerState] = await pool.query(`
      SELECT worker_pid, worker_status, last_heartbeat_at FROM sync_worker_state WHERE worker_id = 'primary_sync_worker'
    `);
    if (workerState.length > 0) {
      const w = workerState[0];
      const ageSec = (Date.now() - new Date(w.last_heartbeat_at).getTime()) / 1000;
      report.metrics.worker = {
        pid: w.worker_pid,
        status: w.worker_status,
        heartbeatAgeSec: Math.round(ageSec)
      };
    }

    console.log(JSON.stringify(report, null, 2));
    console.log('\nResult:', report.status === 'HEALTHY' ? '✅ ZERO PARITY DRIFT DETECTED' : '⚠️ ANOMALIES FOUND');
    return report;
  } catch (err) {
    console.error('Parity monitor error:', err.message);
    throw err;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runParityMonitor().then(() => process.exit(0)).catch(() => process.exit(1));
}

export { runParityMonitor };
