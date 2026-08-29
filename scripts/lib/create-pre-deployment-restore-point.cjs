const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

// Try multiple candidate paths for .env
const envPaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', 'backend', '.env'),
  '/home/u727965524/backend/.env'
];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}

const host = process.env.DB_HOST || '127.0.0.1';
const port = process.env.DB_PORT || 3306;
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME;

const backupDir = '/home/u727965524/deploy_backups/db_snapshots';
fs.mkdirSync(backupDir, { recursive: true });

const timestamp = Date.now();
const filename = `mariadb-snapshot-${database}-pre-9396780-${timestamp}.sql.gz`;
const filepath = path.join(backupDir, filename);

console.log(`Starting MariaDB pre-deployment snapshot for ${database}...`);
const start = Date.now();

try {
  const mysqldumpBin = fs.existsSync('/usr/bin/mysqldump') ? '/usr/bin/mysqldump' : 'mysqldump';
  const dumpOutput = execFileSync(mysqldumpBin, [
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
    label: 'pre-9396780 production restore point',
    targetSha: '9396780f8f43daa1f526a2835d80663748fd15e0',
    currentProductionSha: 'f51e055ed25f3d83b24a1f5eb475d2efb77aeb7b',
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
    status: 'CREATED'
  };
  const metaPath = path.join(backupDir, filename.replace('.sql.gz', '.json'));
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log('=== PRE-DEPLOYMENT RESTORE POINT CREATED ===');
  console.log(JSON.stringify(meta, null, 2));

  // Now independently verify the snapshot integrity and schema contents
  console.log('\nVerifying snapshot integrity & table contents...');
  const verifyStart = Date.now();
  const decompressed = zlib.gunzipSync(compressed).toString('utf8');
  const lines = decompressed.split('\n');

  const createTableMatches = decompressed.match(/CREATE TABLE `([^`]+)`/g) || [];
  const tables = createTableMatches.map(m => m.match(/CREATE TABLE `([^`]+)`/)[1]);
  
  const insertMatches = decompressed.match(/INSERT INTO `([^`]+)`/g) || [];
  const insertedTables = [...new Set(insertMatches.map(m => m.match(/INSERT INTO `([^`]+)`/)[1]))];

  const migrationRegex = /INSERT INTO `?schema_migrations`?[^;]+;/gi;
  const migrationMatches = decompressed.match(migrationRegex) || [];
  let migrationCount = 0;
  if (migrationMatches.length > 0) {
    for (const match of migrationMatches) {
      // Each row in mysqldump is enclosed in parentheses: ('001_baseline', ...), ('002_...', ...)
      // Let's count tuples
      const tuples = match.match(/\([^)]+\)/g) || [];
      migrationCount += tuples.length;
    }
  } else {
    // Check if INSERT has column names or line breaks
    const linesWithMigs = lines.filter(l => l.includes('schema_migrations') && l.includes('INSERT'));
    for (const l of linesWithMigs) {
      const tuples = l.match(/\([^)]+\)/g) || [];
      migrationCount += tuples.length;
    }
  }

  const verifyDurationMs = Date.now() - verifyStart;
  const verification = {
    totalLines: lines.length,
    tableCount: tables.length,
    insertedTablesCount: insertedTables.length,
    migrationCount,
    all14MigrationsPresent: migrationCount === 14,
    all76TablesPresent: tables.length === 76,
    verifyDurationMs,
    status: (tables.length === 76 && migrationCount === 14) ? 'VERIFIED_OK' : 'VERIFICATION_FAILED'
  };

  console.log('=== RESTORE POINT VERIFICATION RESULT ===');
  console.log(JSON.stringify(verification, null, 2));

  if (verification.status !== 'VERIFIED_OK') {
    console.error('FATAL: Restore point verification failed!');
    process.exit(1);
  }

  process.exit(0);
} catch (error) {
  console.error('Snapshot failed:', error.message);
  process.exit(1);
}
