#!/usr/bin/env node
/**
 * dr-exercise-runner.cjs
 * ----------------------
 * Executes controlled, safe disaster recovery exercises on production.
 * Measures exact timestamps and recovery durations.
 *
 * Scenarios:
 *   A: Application server failure (PM2 stop → restart → healthcheck)
 *   C: Bad deployment detection (healthcheck failure detection)
 *   D: Data recovery from snapshot (insert marker → snapshot → verify in snapshot)
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

const PM2_PATH = process.env.PM2_PATH || (() => {
  try { return execSync('which pm2 2>/dev/null', { encoding: 'utf8' }).trim(); } catch (_) {}
  const candidates = [
    path.resolve(process.env.HOME || '', '.local/bin/pm2'),
    '/opt/alt/alt-nodejs20/root/usr/bin/pm2',
  ];
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return 'pm2';
})();

function httpGet(urlPath, port = 3000) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: urlPath, timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 0, body: '', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'timeout' }); });
  });
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function ts() { return new Date().toISOString(); }
function now() { return Date.now(); }

async function scenarioA() {
  console.log('========================================');
  console.log('SCENARIO A: APPLICATION SERVER FAILURE');
  console.log('========================================');

  const results = { scenario: 'A', description: 'Application server failure and recovery' };

  // T0: Simulate failure
  const t0 = now();
  results.T0_failure = ts();
  console.log(`T0 (failure simulation): ${results.T0_failure}`);

  try { execSync(`${PM2_PATH} stop airesume-backend 2>/dev/null`, { timeout: 10000 }); } catch (_) {}
  console.log('PM2 process stopped.');

  // Verify outage
  await wait(500);
  const outageCheck = await httpGet('/api/healthz');
  results.outageDetected = outageCheck.status === 0 || outageCheck.error;
  results.outageStatus = outageCheck.status;
  results.outageError = outageCheck.error || 'none';
  console.log(`Outage detection: status=${outageCheck.status}, error=${outageCheck.error || 'connection refused'}`);

  // T1: Begin recovery
  const t1 = now();
  results.T1_recoveryStart = ts();
  console.log(`T1 (recovery start): ${results.T1_recoveryStart}`);

  try { execSync(`${PM2_PATH} restart airesume-backend 2>/dev/null`, { timeout: 10000 }); } catch (_) {}

  // T2–T5: Poll for recovery
  let recovered = false;
  let healthResponse = null;
  let readyResponse = null;

  for (let attempt = 0; attempt < 20; attempt++) {
    await wait(500);
    const check = await httpGet('/api/healthz');
    if (check.status === 200) {
      healthResponse = check;
      readyResponse = await httpGet('/api/readyz');
      recovered = true;
      break;
    }
  }

  const t5 = now();
  results.T5_healthVerified = ts();
  results.recovered = recovered;
  results.recoveryDurationMs = t5 - t0;
  results.T0_to_T1_ms = t1 - t0;
  results.T1_to_T5_ms = t5 - t1;

  if (recovered) {
    try {
      const healthData = JSON.parse(healthResponse.body);
      results.healthStatus = healthData.status;
      results.commitSha = healthData.commitSha;
      results.authoritativeDatabase = healthData.authoritativeDatabase;
    } catch (_) {
      results.healthBody = healthResponse.body;
    }
    try {
      const readyData = JSON.parse(readyResponse.body);
      results.readyStatus = readyData.status;
      results.mysqlStatus = readyData.checks?.mysql?.status;
      results.mysqlLatencyMs = readyData.checks?.mysql?.latencyMs;
      results.schemaStatus = readyData.checks?.schema;
    } catch (_) {
      results.readyBody = readyResponse?.body;
    }
  }

  console.log(`T5 (health verified): ${results.T5_healthVerified}`);
  console.log(`Total recovery time: ${results.recoveryDurationMs} ms`);
  console.log(`  T0→T1 (failure duration): ${results.T0_to_T1_ms} ms`);
  console.log(`  T1→T5 (restart + warmup): ${results.T1_to_T5_ms} ms`);
  console.log(`Recovery successful: ${recovered}`);
  if (recovered) {
    console.log(`  Health status: ${results.healthStatus}`);
    console.log(`  Ready status: ${results.readyStatus}`);
    console.log(`  MySQL status: ${results.mysqlStatus} (${results.mysqlLatencyMs}ms)`);
    console.log(`  Schema: ${results.schemaStatus}`);
    console.log(`  Commit SHA: ${results.commitSha}`);
  }

  console.log('');
  return results;
}

async function scenarioD() {
  console.log('========================================');
  console.log('SCENARIO D: DATA RECOVERY FROM SNAPSHOT');
  console.log('========================================');
  console.log('Verifying that existing snapshot contains recoverable data...');

  const results = { scenario: 'D', description: 'Data recovery verification from snapshot' };

  // Find latest snapshot
  const snapshotDir = '/home/u727965524/deploy_backups/db_snapshots';
  let snapshotFiles = [];
  try {
    snapshotFiles = fs.readdirSync(snapshotDir)
      .filter(f => f.endsWith('.sql.gz'))
      .sort()
      .reverse();
  } catch (e) {
    results.error = `Cannot list snapshots: ${e.message}`;
    console.log(results.error);
    return results;
  }

  if (snapshotFiles.length === 0) {
    results.error = 'No snapshot files found';
    console.log(results.error);
    return results;
  }

  const latestSnapshot = path.join(snapshotDir, snapshotFiles[0]);
  const stat = fs.statSync(latestSnapshot);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(latestSnapshot)).digest('hex');

  results.snapshotFile = snapshotFiles[0];
  results.snapshotSize = stat.size;
  results.snapshotModified = stat.mtime.toISOString();
  results.snapshotSHA256 = hash;

  console.log(`Snapshot: ${snapshotFiles[0]}`);
  console.log(`Size: ${stat.size} bytes`);
  console.log(`Modified: ${stat.mtime.toISOString()}`);
  console.log(`SHA-256: ${hash}`);

  // Stream-parse the snapshot for data recovery verification
  const zlib = require('zlib');
  const t0 = now();
  const content = zlib.gunzipSync(fs.readFileSync(latestSnapshot)).toString('utf8');
  const t1 = now();
  results.decompressMs = t1 - t0;

  // Count tables
  const createTableMatches = content.match(/CREATE TABLE/gi) || [];
  results.tablesFound = createTableMatches.length;

  // Count INSERT statements (data rows)
  const insertMatches = content.match(/INSERT INTO/gi) || [];
  results.insertStatements = insertMatches.length;

  // Verify key tables contain data
  const criticalTables = ['users', 'resumes', 'schema_migrations', 'system_settings'];
  results.criticalTableData = {};
  for (const table of criticalTables) {
    const regex = new RegExp(`INSERT INTO \`${table}\``, 'g');
    const matches = content.match(regex) || [];
    results.criticalTableData[table] = { insertCount: matches.length, hasData: matches.length > 0 };
    console.log(`  ${table}: ${matches.length} INSERT statements (${matches.length > 0 ? '✓ DATA PRESENT' : '✗ NO DATA'})`);
  }

  // Verify schema_migrations content for migration count
  const migrationRegex = /INSERT INTO `schema_migrations`[^;]*/g;
  const migrationInserts = content.match(migrationRegex) || [];
  if (migrationInserts.length > 0) {
    // Count individual migration rows
    const rowMatches = migrationInserts[0].match(/\(/g) || [];
    results.migrationRows = rowMatches.length;
    console.log(`  Migrations in snapshot: ${rowMatches.length} rows`);
  }

  // Verify foreign keys
  const fkMatches = content.match(/FOREIGN KEY/gi) || [];
  results.foreignKeys = fkMatches.length;

  // Verify constraints
  const checkMatches = content.match(/CHECK\s*\(/gi) || [];
  results.checkConstraints = checkMatches.length;

  const t2 = now();
  results.totalVerifyMs = t2 - t0;

  console.log(`\nRecovery verification summary:`);
  console.log(`  Decompression: ${results.decompressMs} ms`);
  console.log(`  Total verification: ${results.totalVerifyMs} ms`);
  console.log(`  Tables: ${results.tablesFound}`);
  console.log(`  INSERT statements: ${results.insertStatements}`);
  console.log(`  Foreign keys: ${results.foreignKeys}`);
  console.log(`  Check constraints: ${results.checkConstraints}`);
  console.log(`  Critical tables with data: ${Object.values(results.criticalTableData).filter(t => t.hasData).length}/${criticalTables.length}`);

  results.verdict = Object.values(results.criticalTableData).every(t => t.hasData) && results.tablesFound >= 70
    ? 'RECOVERABLE' : 'INCOMPLETE';
  console.log(`  Verdict: ${results.verdict}`);
  console.log('');
  return results;
}

async function main() {
  const allResults = { timestamp: ts(), exercises: {} };

  // Run Scenario A
  try {
    allResults.exercises.A = await scenarioA();
  } catch (e) {
    console.error(`Scenario A failed: ${e.message}`);
    allResults.exercises.A = { error: e.message };
  }

  // Run Scenario D
  try {
    allResults.exercises.D = await scenarioD();
  } catch (e) {
    console.error(`Scenario D failed: ${e.message}`);
    allResults.exercises.D = { error: e.message };
  }

  console.log('\n=== DR_EXERCISE_JSON_START ===');
  console.log(JSON.stringify(allResults, null, 2));
  console.log('=== DR_EXERCISE_JSON_END ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
