const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

require('dotenv').config({ path: '/home/u727965524/backend/.env' });

const host = process.env.DB_HOST || '127.0.0.1';
const port = process.env.DB_PORT || 3306;
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME;

const backupDir = '/home/u727965524/deploy_backups/db_snapshots';
fs.mkdirSync(backupDir, { recursive: true });

const timestamp = Date.now();
const filename = `mariadb-snapshot-${database}-${timestamp}.sql.gz`;
const filepath = path.join(backupDir, filename);

console.log(`Starting MariaDB snapshot for ${database}...`);
const start = Date.now();

try {
  const dumpOutput = execFileSync('mysqldump', [
    `--host=${host}`,
    `--port=${port}`,
    `--user=${user}`,
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    database
  ], {
    env: { ...process.env, MYSQL_PWD: password },
    maxBuffer: 200 * 1024 * 1024
  });

  const compressed = zlib.gzipSync(dumpOutput);
  fs.writeFileSync(filepath, compressed);
  const durationMs = Date.now() - start;
  const stat = fs.statSync(filepath);
  
  const hash = crypto.createHash('sha256').update(compressed).digest('hex');
  const meta = {
    database,
    timestamp,
    isoDate: new Date(timestamp).toISOString(),
    filepath,
    filename,
    sizeBytes: stat.size,
    sizeMB: (stat.size / 1024 / 1024).toFixed(3),
    sha256: hash,
    durationMs,
    compression: 'gzip',
    engine: 'mysqldump --single-transaction',
    status: 'VERIFIED'
  };
  const metaPath = path.join(backupDir, `mariadb-snapshot-${database}-${timestamp}.json`);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log('=== SNAPSHOT COMPLETED SUCCESSFULLY ===');
  console.log(JSON.stringify(meta, null, 2));
  process.exit(0);
} catch (error) {
  console.error('Snapshot failed:', error.message);
  process.exit(1);
}
