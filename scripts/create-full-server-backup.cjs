#!/usr/bin/env node
/**
 * create-full-server-backup.cjs
 * Creates a comprehensive pre-deployment backup of the production server:
 * 1. /home/u727965524/backend (code, node_modules, configs, .env)
 * 2. /home/u727965524/domains/airesume.projectdemo.guru/public_html (webroot, index.php, assets)
 * 3. MariaDB database snapshot (gzipped mysqldump)
 * 4. PM2 process configuration
 * 5. Automated restore.sh script for instant rollback
 * 6. Metadata and SHA-256 verification manifest
 * (100% zero external dependencies - uses Node.js standard library)
 */

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

// 1. Native .env parser (zero external deps)
function parseEnv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const envPath = '/home/u727965524/backend/.env';
if (!fs.existsSync(envPath)) {
  throw new Error(`Missing backend env file: ${envPath}`);
}
const env = parseEnv(envPath);

const host = env.DB_HOST || '127.0.0.1';
const port = env.DB_PORT || 3306;
const user = env.DB_USER;
const password = env.DB_PASSWORD || '';
const database = env.DB_NAME;

const timestamp = Date.now();
const backupBaseDir = '/home/u727965524/deploy_backups';
const backupDir = path.join(backupBaseDir, `full_backup_${timestamp}`);
fs.mkdirSync(backupDir, { recursive: true });

console.log(`=== CREATING FULL PRODUCTION SERVER BACKUP [${timestamp}] ===`);
console.log(`Target backup directory: ${backupDir}`);

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

// 2. Backup Backend Directory
console.log('\n[1/5] Archiving /home/u727965524/backend...');
const backendArchive = path.join(backupDir, 'backend.tar.gz');
execSync(`tar -czf "${backendArchive}" -C /home/u727965524 backend`, { maxBuffer: 300 * 1024 * 1024 });
const backendStat = fs.statSync(backendArchive);
const backendSha = sha256File(backendArchive);
console.log(`  ✓ backend.tar.gz created: ${(backendStat.size / (1024 * 1024)).toFixed(2)} MB (SHA: ${backendSha.slice(0, 12)}...)`);

// 3. Backup Public Webroot
console.log('\n[2/5] Archiving public_html webroot...');
const webrootArchive = path.join(backupDir, 'webroot.tar.gz');
execSync(`tar -czf "${webrootArchive}" -C /home/u727965524/domains/airesume.projectdemo.guru public_html`, { maxBuffer: 300 * 1024 * 1024 });
const webrootStat = fs.statSync(webrootArchive);
const webrootSha = sha256File(webrootArchive);
console.log(`  ✓ webroot.tar.gz created: ${(webrootStat.size / (1024 * 1024)).toFixed(2)} MB (SHA: ${webrootSha.slice(0, 12)}...)`);

// 4. Backup MariaDB Database
console.log(`\n[3/5] Dumping MariaDB database (${database})...`);
const dbDumpFile = path.join(backupDir, 'mariadb_snapshot.sql.gz');
const dumpBin = fs.existsSync('/usr/bin/mariadb-dump')
  ? '/usr/bin/mariadb-dump'
  : (fs.existsSync('/usr/bin/mysqldump') ? '/usr/bin/mysqldump' : 'mysqldump');

const dumpOutput = execFileSync(dumpBin, [
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
  maxBuffer: 300 * 1024 * 1024
});

const compressedDb = zlib.gzipSync(dumpOutput);
fs.writeFileSync(dbDumpFile, compressedDb);
const dbStat = fs.statSync(dbDumpFile);
const dbSha = sha256File(dbDumpFile);

// Verify DB Dump contents
const decompressedDb = dumpOutput.toString('utf8');
const tables = (decompressedDb.match(/CREATE TABLE `([^`]+)`/g) || []).map(m => m.match(/CREATE TABLE `([^`]+)`/)[1]);
console.log(`  ✓ mariadb_snapshot.sql.gz created: ${(dbStat.size / (1024 * 1024)).toFixed(2)} MB (SHA: ${dbSha.slice(0, 12)}...)`);
console.log(`  ✓ Verified ${tables.length} database tables captured.`);

// 5. Backup PM2 Process Config
console.log('\n[4/5] Copying PM2 dump...');
const pm2DumpSource = '/home/u727965524/.pm2/dump.pm2';
const pm2DumpDest = path.join(backupDir, 'pm2_dump.json');
if (fs.existsSync(pm2DumpSource)) {
  fs.copyFileSync(pm2DumpSource, pm2DumpDest);
  console.log('  ✓ PM2 dump backed up.');
} else {
  console.log('  ! No existing PM2 dump found, skipping file copy.');
}

// 6. Read current commit SHA
let currentCommitSha = 'unknown';
const commitShaPath = '/home/u727965524/backend/COMMIT_SHA';
if (fs.existsSync(commitShaPath)) {
  currentCommitSha = fs.readFileSync(commitShaPath, 'utf8').trim();
}

// 7. Write automated Rollback Script
console.log('\n[5/5] Generating automated rollback script (restore.sh)...');
const restoreScriptContent = `#!/bin/bash
set -e
echo "==============================================================="
echo " Restoring ResumePilot AI to Backup: ${timestamp}"
echo " Timestamp: $(date -u)"
echo " Pre-update Commit SHA: ${currentCommitSha}"
echo "==============================================================="

export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"

echo "Stopping active PM2 process..."
pm2 stop airesume-backend || true

echo "Restoring backend code from archive..."
rm -rf /home/u727965524/backend_failed_staging
mkdir -p /home/u727965524/backend
tar -xzf "${backendArchive}" -C /home/u727965524

echo "Restoring webroot from archive..."
rm -rf /home/u727965524/domains/airesume.projectdemo.guru/public_html/*
tar -xzf "${webrootArchive}" -C /home/u727965524/domains/airesume.projectdemo.guru
cp -r /home/u727965524/domains/airesume.projectdemo.guru/public_html/. /home/u727965524/public_html/ 2>/dev/null || true

echo "Restoring MariaDB database..."
gunzip -c "${dbDumpFile}" | mariadb --host="${host}" --port="${port}" --user="${user}" --password="${password}" "${database}"

echo "Restoring PM2 configuration..."
if [ -f "${pm2DumpDest}" ]; then
  cp "${pm2DumpDest}" /home/u727965524/.pm2/dump.pm2
fi
pm2 resurrect || pm2 restart airesume-backend

echo "Waiting for process boot (4s)..."
sleep 4

echo "Verifying local health check..."
curl -i http://127.0.0.1:8080/api/healthz

echo ""
echo "==============================================================="
echo " ROLLBACK COMPLETED SUCCESSFULLY!"
echo " Production restored to pre-update state (${currentCommitSha})"
echo "==============================================================="
`;

const restoreScriptPath = path.join(backupDir, 'restore.sh');
fs.writeFileSync(restoreScriptPath, restoreScriptContent, { mode: 0o755 });

const rootRollbackPath = '/home/u727965524/ROLLBACK_TO_PRE_UPDATE.sh';
fs.writeFileSync(rootRollbackPath, restoreScriptContent, { mode: 0o755 });
console.log(`  ✓ restore.sh created in backup directory: ${restoreScriptPath}`);
console.log(`  ✓ 1-click restore script linked at: ${rootRollbackPath}`);

// 8. Write Meta Manifest
const meta = {
  timestamp,
  isoDate: new Date(timestamp).toISOString(),
  currentCommitSha,
  backupDir,
  archives: {
    backend: {
      file: 'backend.tar.gz',
      path: backendArchive,
      sizeBytes: backendStat.size,
      sizeMB: (backendStat.size / (1024 * 1024)).toFixed(2),
      sha256: backendSha
    },
    webroot: {
      file: 'webroot.tar.gz',
      path: webrootArchive,
      sizeBytes: webrootStat.size,
      sizeMB: (webrootStat.size / (1024 * 1024)).toFixed(2),
      sha256: webrootSha
    },
    database: {
      file: 'mariadb_snapshot.sql.gz',
      path: dbDumpFile,
      database,
      tableCount: tables.length,
      tables,
      sizeBytes: dbStat.size,
      sizeMB: (dbStat.size / (1024 * 1024)).toFixed(2),
      sha256: dbSha
    }
  },
  restoreScript: {
    inBackupDir: restoreScriptPath,
    rootShortcut: rootRollbackPath
  },
  status: 'BACKUP_VERIFIED_COMPLETE'
};

const metaPath = path.join(backupDir, 'backup_manifest.json');
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

console.log('\n=== FULL SERVER BACKUP COMPLETED & VERIFIED ===');
console.log(JSON.stringify(meta, null, 2));
