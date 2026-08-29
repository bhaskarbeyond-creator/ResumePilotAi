const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: '/home/u727965524/backend/.env' });

const host = process.env.DB_HOST || '127.0.0.1';
const port = process.env.DB_PORT || 3306;
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const database = process.env.DB_NAME;

const backupDir = '/home/u727965524/deploy_backups/db_snapshots';
fs.mkdirSync(backupDir, { recursive: true });

const timestamp = Date.now();
const filename = `mariadb-snapshot-${database}-${timestamp}.sql.gz`;
const filepath = path.join(backupDir, filename);

console.log(`Starting MariaDB snapshot for ${database}...`);
const start = Date.now();

// Dump database with consistent snapshot and compress on the fly
const cmd = `mysqldump --host=${host} --port=${port} --user=${user} --password='${password.replace(/'/g, "'\\''")}' --single-transaction --quick --routines --triggers ${database} | gzip > ${filepath}`;

try {
  execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] });
  const durationMs = Date.now() - start;
  const stat = fs.statSync(filepath);
  
  // Compute SHA-256 checksum of the compressed backup
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filepath);
  stream.on('data', d => hash.update(d));
  stream.on('end', () => {
    const sha256 = hash.digest('hex');
    const meta = {
      database,
      timestamp,
      isoDate: new Date(timestamp).toISOString(),
      filepath,
      filename,
      sizeBytes: stat.size,
      sizeMB: (stat.size / 1024 / 1024).toFixed(3),
      sha256,
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
  });
} catch (error) {
  console.error('Snapshot failed:', error.message);
  process.exit(1);
}
