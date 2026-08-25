import { execSync } from 'child_process';
import fs from 'fs';

const code = `
const { getPool } = require('./database/mysql');

async function applyWorkerSchema() {
    const pool = getPool();
    const sql = \`
        CREATE TABLE IF NOT EXISTS sync_worker_state (
            worker_id VARCHAR(64) NOT NULL PRIMARY KEY,
            worker_pid INT NOT NULL,
            worker_status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
            last_heartbeat_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            last_sync_started_at TIMESTAMP NULL,
            last_sync_completed_at TIMESTAMP NULL,
            last_successful_event_at TIMESTAMP NULL,
            last_failed_event_at TIMESTAMP NULL,
            consecutive_failures INT NOT NULL DEFAULT 0,
            total_events_processed BIGINT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    \`;
    await pool.query(sql);
    console.log('sync_worker_state table successfully provisioned in MariaDB.');

    // Seed default record if missing
    await pool.query(\`
        INSERT INTO sync_worker_state (worker_id, worker_pid, worker_status, last_heartbeat_at)
        VALUES ('primary_sync_worker', 0, 'INITIALIZING', NOW())
        ON DUPLICATE KEY UPDATE worker_id=worker_id;
    \`);

    const [rows] = await pool.query('SHOW TABLES');
    console.log('TOTAL_TABLES_NOW:', rows.length);
    process.exit(0);
}

applyWorkerSchema().catch(err => {
    console.error('Schema update error:', err);
    process.exit(1);
});
`;

fs.writeFileSync('scripts/remote_apply_worker_schema.js', code);
execSync('scp -o BatchMode=yes scripts/remote_apply_worker_schema.js airesume:~/backend/remote_apply_worker_schema.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_apply_worker_schema.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_apply_worker_schema.js"');
fs.unlinkSync('scripts/remote_apply_worker_schema.js');
