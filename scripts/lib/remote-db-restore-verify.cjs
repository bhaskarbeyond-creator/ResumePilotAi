const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const readline = require('readline');

async function verifyDump(filepath) {
  console.log(`Verifying dump artifact: ${filepath}`);
  const start = Date.now();
  
  if (!fs.existsSync(filepath)) {
    throw new Error(`Dump file does not exist: ${filepath}`);
  }

  // 1. Verify SHA-256
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filepath);
  hash.update(buffer);
  const computedSha256 = hash.digest('hex');

  // 2. Decompress and analyze structure
  const gunzip = zlib.createGunzip();
  const fileStream = fs.createReadStream(filepath);
  const rl = readline.createInterface({
    input: fileStream.pipe(gunzip),
    crlfDelay: Infinity
  });

  const createdTables = [];
  const insertedTables = new Set();
  const appliedMigrations = [];
  let lineCount = 0;
  let hasForeignKeys = false;
  let inMigrationInsert = false;

  for await (const line of rl) {
    lineCount++;
    const tableMatch = line.match(/^CREATE TABLE `([^`]+)`/);
    if (tableMatch) {
      createdTables.push(tableMatch[1]);
    }
    const insertMatch = line.match(/^INSERT INTO `([^`]+)`/);
    if (insertMatch) {
      insertedTables.add(insertMatch[1]);
    }
    if (line.includes('FOREIGN KEY')) {
      hasForeignKeys = true;
    }
    if (line.includes('INSERT INTO `schema_migrations`')) {
      inMigrationInsert = true;
    }
    if (inMigrationInsert) {
      const migMatches = line.matchAll(/\('(\d+)',\s*'([^']+)'/g);
      for (const m of migMatches) {
        appliedMigrations.push({ version: m[1], name: m[2] });
      }
      if (line.endsWith(';')) inMigrationInsert = false;
    }
  }

  const durationMs = Date.now() - start;

  const result = {
    filepath,
    bytes: buffer.length,
    sizeMB: (buffer.length / 1024 / 1024).toFixed(3),
    sha256: computedSha256,
    sqlLines: lineCount,
    durationMs,
    createdTablesCount: createdTables.length,
    insertedTablesCount: insertedTables.size,
    hasForeignKeys,
    migrationsInDump: appliedMigrations.length,
    appliedMigrations,
    status: createdTables.length >= 70 && appliedMigrations.length === 14 ? 'VERIFIED' : 'FAILED'
  };

  console.log('=== RESTORE INTEGRITY VERIFICATION RESULT ===');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const target = process.argv[2] || '/home/u727965524/deploy_backups/db_snapshots/mariadb-snapshot-u727965524_airesume-1787972070645.sql.gz';
verifyDump(target).then(r => {
  process.exit(r.status === 'VERIFIED' ? 0 : 1);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
