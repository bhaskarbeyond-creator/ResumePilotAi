import { execSync } from 'child_process';
import fs from 'fs';

const remoteCode = `
const { getPool } = require('./backend/database/mysql');

async function applySchema() {
  const pool = getPool();
  console.log('Applying sync_outbox, sync_conflicts, and database_engine_state to MySQL...');

  await pool.query(\`
    CREATE TABLE IF NOT EXISTS sync_outbox (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        entity_type VARCHAR(64) NOT NULL,
        entity_id VARCHAR(128) NOT NULL,
        operation VARCHAR(32) NOT NULL,
        payload JSON,
        version INT NOT NULL DEFAULT 1,
        source_engine VARCHAR(32) NOT NULL DEFAULT 'mysql',
        content_hash VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        retry_count INT NOT NULL DEFAULT 0,
        max_retries INT NOT NULL DEFAULT 5,
        last_error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_outbox_status_time (status, created_at),
        INDEX idx_outbox_entity (entity_type, entity_id),
        INDEX idx_outbox_hash (content_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  \`);

  await pool.query(\`
    CREATE TABLE IF NOT EXISTS sync_conflicts (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        entity_type VARCHAR(64) NOT NULL,
        entity_id VARCHAR(128) NOT NULL,
        mysql_version INT,
        firestore_version INT,
        mysql_hash VARCHAR(64),
        firestore_hash VARCHAR(64),
        mysql_payload JSON,
        firestore_payload JSON,
        resolution VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        resolved_by VARCHAR(128),
        resolved_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_conflict_entity (entity_type, entity_id),
        INDEX idx_conflict_status (resolution)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  \`);

  await pool.query(\`
    CREATE TABLE IF NOT EXISTS database_engine_state (
        id VARCHAR(32) NOT NULL PRIMARY KEY,
        active_engine VARCHAR(32) NOT NULL DEFAULT 'mysql',
        standby_engine VARCHAR(32) NOT NULL DEFAULT 'firestore',
        sync_mode VARCHAR(32) NOT NULL DEFAULT 'ACTIVE_PASSIVE',
        last_switched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_switched_by VARCHAR(128),
        switch_in_progress BOOLEAN DEFAULT FALSE,
        switch_lock_expires_at BIGINT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  \`);

  await pool.query(\`
    INSERT INTO database_engine_state (id, active_engine, standby_engine, sync_mode, last_switched_by)
    VALUES ('active_engine', 'mysql', 'firestore', 'ACTIVE_PASSIVE', 'system')
    ON DUPLICATE KEY UPDATE active_engine=VALUES(active_engine);
  \`);

  console.log('✓ All sync tables created & verified successfully');
  process.exit(0);
}

applySchema().catch(err => {
  console.error('Schema application error:', err);
  process.exit(1);
});
`;

fs.writeFileSync('scripts/remote_schema.js', remoteCode);
execSync('scp -o BatchMode=yes scripts/remote_schema.js airesume:~/remote_schema.js');
const output = execSync('ssh -o BatchMode=yes airesume "/opt/alt/alt-nodejs20/root/usr/bin/node ~/remote_schema.js"').toString();
console.log(output);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/remote_schema.js"');
fs.unlinkSync('scripts/remote_schema.js');
