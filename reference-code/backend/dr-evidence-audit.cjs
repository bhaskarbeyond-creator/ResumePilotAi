#!/usr/bin/env node
/**
 * dr-evidence-audit.cjs
 * ---------------------
 * Read-only production MariaDB audit for DR/HA evidence hardening.
 * Uses the application's mysql2 driver (no CLI mysql binary required).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ── Load DB credentials ──
const envCandidates = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '..', '..', 'backend', '.env'),
  '/home/u727965524/backend/.env',
];
let envContent = '';
for (const ep of envCandidates) {
  try { envContent = fs.readFileSync(ep, 'utf8'); break; } catch (_) {}
}
if (!envContent) {
  console.error('ERROR: Cannot find backend/.env');
  process.exit(1);
}

function envVal(key) {
  const m = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

// When running on the server from /home/u727965524/backend/, mysql2 is in ./node_modules
let mysql2;
try { mysql2 = require('mysql2/promise'); } catch (_) {
  try { mysql2 = require(path.resolve(__dirname, 'node_modules', 'mysql2', 'promise')); } catch (__) {
    mysql2 = require(path.resolve(__dirname, '..', '..', 'backend', 'node_modules', 'mysql2', 'promise'));
  }
}

async function main() {
  const conn = await mysql2.createConnection({
    host: envVal('DB_HOST') || '127.0.0.1',
    port: parseInt(envVal('DB_PORT') || '3306'),
    user: envVal('DB_USER'),
    password: envVal('DB_PASSWORD'),
    database: envVal('DB_NAME'),
    connectTimeout: 10000,
  });

  const report = {};

  async function q(sql) {
    const [rows] = await conn.query(sql);
    return rows;
  }

  async function qVal(sql) {
    const rows = await q(sql);
    if (rows.length === 0) return null;
    const first = rows[0];
    return first[Object.keys(first)[0]];
  }

  // ── 1. Core Configuration ──
  console.log('=== 1. MariaDB Core Configuration ===');
  const coreVars = [
    'version', 'innodb_buffer_pool_size', 'innodb_buffer_pool_instances',
    'max_connections', 'thread_cache_size', 'thread_pool_size',
    'table_open_cache', 'innodb_log_file_size',
    'innodb_flush_log_at_trx_commit', 'innodb_flush_method',
    'sync_binlog', 'tx_isolation', 'innodb_io_capacity',
    'innodb_io_capacity_max', 'innodb_read_io_threads',
    'innodb_write_io_threads', 'innodb_doublewrite',
    'innodb_checksum_algorithm', 'innodb_file_per_table',
    'innodb_autoinc_lock_mode', 'innodb_lock_wait_timeout',
    'innodb_deadlock_detect',
  ];
  report.coreConfig = {};
  for (const v of coreVars) {
    try {
      const val = await qVal(`SELECT @@${v}`);
      report.coreConfig[v] = String(val);
      console.log(`  ${v}: ${val}`);
    } catch (e) {
      report.coreConfig[v] = `ERROR: ${e.message}`;
      console.log(`  ${v}: ERROR (${e.message})`);
    }
  }

  // ── 2. Binary Logging & PITR ──
  console.log('\n=== 2. Binary Logging & PITR Capability ===');
  const binlogVars = [
    'log_bin', 'log_bin_basename', 'binlog_format',
    'expire_logs_days', 'max_binlog_size', 'server_id',
    'gtid_strict_mode', 'binlog_row_image', 'binlog_checksum',
  ];
  report.binlogConfig = {};
  for (const v of binlogVars) {
    try {
      const val = await qVal(`SELECT @@${v}`);
      report.binlogConfig[v] = String(val);
      console.log(`  ${v}: ${val}`);
    } catch (e) {
      report.binlogConfig[v] = `N/A`;
      console.log(`  ${v}: N/A`);
    }
  }

  // binlog_expire_logs_seconds (may not exist on older MariaDB)
  try {
    const val = await qVal(`SELECT @@binlog_expire_logs_seconds`);
    report.binlogConfig.binlog_expire_logs_seconds = String(val);
    console.log(`  binlog_expire_logs_seconds: ${val}`);
  } catch (_) {
    report.binlogConfig.binlog_expire_logs_seconds = 'N/A (variable does not exist)';
    console.log(`  binlog_expire_logs_seconds: N/A`);
  }

  // Active binary logs
  console.log('\n=== 2b. Active Binary Logs ===');
  try {
    const binlogs = await q('SHOW BINARY LOGS');
    report.binaryLogs = binlogs.map(r => ({ name: r.Log_name, size: r.File_size }));
    binlogs.forEach(r => console.log(`  ${r.Log_name}: ${r.File_size} bytes`));
    console.log(`  Total binary logs: ${binlogs.length}`);
    if (binlogs.length > 0) {
      console.log(`  Oldest: ${binlogs[0].Log_name}`);
      console.log(`  Newest: ${binlogs[binlogs.length - 1].Log_name}`);
      const totalSize = binlogs.reduce((sum, r) => sum + Number(r.File_size), 0);
      console.log(`  Total binlog size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      report.binlogTotalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
    }
  } catch (e) {
    console.log(`  Binary log listing error: ${e.message}`);
    report.binaryLogs = { error: e.message };
  }

  // Current binlog position
  console.log('\n=== 2c. Current Binary Log Position ===');
  try {
    const status = await q('SHOW MASTER STATUS');
    report.masterStatus = status;
    status.forEach(r => {
      console.log(`  File: ${r.File}, Position: ${r.Position}`);
      if (r.Binlog_Do_DB) console.log(`  Binlog_Do_DB: ${r.Binlog_Do_DB}`);
    });
  } catch (e) {
    console.log(`  Master status error: ${e.message}`);
    report.masterStatus = { error: e.message };
  }

  // Binlog events in the latest file (sample to verify content)
  console.log('\n=== 2d. Latest Binlog Events Sample ===');
  try {
    const latestBinlog = report.binaryLogs && report.binaryLogs.length > 0
      ? report.binaryLogs[report.binaryLogs.length - 1].name : null;
    if (latestBinlog) {
      const events = await q(`SHOW BINLOG EVENTS IN '${latestBinlog}' LIMIT 10`);
      report.latestBinlogSample = events.map(r => ({
        pos: r.Pos, event_type: r.Event_type, end_log_pos: r.End_log_pos,
        info: String(r.Info).substring(0, 120)
      }));
      events.forEach(r => {
        console.log(`  Pos=${r.Pos} Type=${r.Event_type} EndPos=${r.End_log_pos} Info=${String(r.Info).substring(0, 80)}`);
      });
    }
  } catch (e) {
    console.log(`  Binlog event sample error: ${e.message}`);
  }

  // ── 3. Connection & Thread Statistics ──
  console.log('\n=== 3. Connection & Thread Statistics ===');
  const statusVars = [
    'Threads_connected', 'Threads_running', 'Threads_created', 'Threads_cached',
    'Max_used_connections', 'Connections', 'Aborted_connects', 'Aborted_clients',
  ];
  report.connectionStats = {};
  for (const v of statusVars) {
    try {
      const rows = await q(`SHOW STATUS LIKE '${v}'`);
      const val = rows.length > 0 ? rows[0].Value : 'N/A';
      report.connectionStats[v] = val;
      console.log(`  ${v}: ${val}`);
    } catch (_) {}
  }

  // ── 4. InnoDB Buffer Pool Statistics ──
  console.log('\n=== 4. InnoDB Buffer Pool Statistics ===');
  const bpVars = [
    'Innodb_buffer_pool_read_requests', 'Innodb_buffer_pool_reads',
    'Innodb_buffer_pool_pages_total', 'Innodb_buffer_pool_pages_data',
    'Innodb_buffer_pool_pages_free', 'Innodb_buffer_pool_pages_dirty',
  ];
  report.bufferPoolStats = {};
  for (const v of bpVars) {
    try {
      const rows = await q(`SHOW STATUS LIKE '${v}'`);
      const val = rows.length > 0 ? rows[0].Value : '0';
      report.bufferPoolStats[v] = val;
      console.log(`  ${v}: ${val}`);
    } catch (_) {}
  }
  const readReqs = parseInt(report.bufferPoolStats.Innodb_buffer_pool_read_requests || '0');
  const diskReads = parseInt(report.bufferPoolStats.Innodb_buffer_pool_reads || '0');
  const hitRatio = readReqs > 0 ? ((readReqs - diskReads) / readReqs * 100).toFixed(4) : 'N/A';
  report.bufferPoolStats.hitRatioPercent = hitRatio;
  console.log(`  Buffer Pool Hit Ratio: ${hitRatio}%`);

  // ── 5. Slow Query ──
  console.log('\n=== 5. Slow Query Configuration ===');
  for (const v of ['slow_query_log', 'long_query_time', 'slow_query_log_file', 'log_queries_not_using_indexes']) {
    try {
      const val = await qVal(`SELECT @@${v}`);
      report[`slow_${v}`] = String(val);
      console.log(`  ${v}: ${val}`);
    } catch (_) {}
  }
  try {
    const rows = await q(`SHOW STATUS LIKE 'Slow_queries'`);
    const val = rows.length > 0 ? rows[0].Value : '0';
    report.slowQueryCount = val;
    console.log(`  Total slow queries: ${val}`);
  } catch (_) {}

  // ── 6. Durability Assessment ──
  console.log('\n=== 6. Durability Assessment ===');
  const fc = report.coreConfig.innodb_flush_log_at_trx_commit;
  const sb = report.coreConfig.sync_binlog;
  const dw = report.coreConfig.innodb_doublewrite;
  let durability = '';
  if (fc === '1' && sb === '1') {
    durability = 'FULL DURABILITY: Every commit flushed to disk + binary log synced. Zero transaction loss on crash.';
  } else if (fc === '1') {
    durability = `InnoDB DURABLE (flush=1, sync_binlog=${sb}): Redo log flushed per commit. Binlog may lose up to ${sb} transactions on crash.`;
  } else if (fc === '2') {
    durability = `OS-BUFFERED (flush=2): Redo log written but OS-flushed. Up to ~1s of transactions lost on OS crash.`;
  } else {
    durability = `RELAXED (flush=${fc}): Up to 1s of committed transactions may be lost on crash.`;
  }
  report.durability = { innodb_flush_log_at_trx_commit: fc, sync_binlog: sb, doublewrite: dw, assessment: durability };
  console.log(`  Assessment: ${durability}`);

  // ── 7. Replication ──
  console.log('\n=== 7. Replication Status ===');
  try {
    const slaveRows = await q('SHOW SLAVE STATUS');
    if (slaveRows.length > 0) {
      report.replication = slaveRows[0];
      console.log(`  Slave IO Running: ${slaveRows[0].Slave_IO_Running}`);
      console.log(`  Slave SQL Running: ${slaveRows[0].Slave_SQL_Running}`);
    } else {
      report.replication = 'NOT CONFIGURED';
      console.log('  No replication configured (standalone primary)');
    }
  } catch (e) {
    report.replication = 'NOT CONFIGURED';
    console.log(`  No replication: ${e.message}`);
  }

  // ── 8. Uptime & Query Volume ──
  console.log('\n=== 8. Server Uptime & Query Volume ===');
  try {
    const uptime = await qVal(`SELECT @@uptime`);
    const questions = (await q(`SHOW STATUS LIKE 'Questions'`))[0]?.Value || '0';
    const comSelect = (await q(`SHOW STATUS LIKE 'Com_select'`))[0]?.Value || '0';
    const comInsert = (await q(`SHOW STATUS LIKE 'Com_insert'`))[0]?.Value || '0';
    const comUpdate = (await q(`SHOW STATUS LIKE 'Com_update'`))[0]?.Value || '0';
    const comDelete = (await q(`SHOW STATUS LIKE 'Com_delete'`))[0]?.Value || '0';
    report.serverUptime = {
      uptimeSeconds: uptime,
      uptimeDays: (uptime / 86400).toFixed(2),
      totalQuestions: questions,
      qps: (parseInt(questions) / parseInt(uptime)).toFixed(2),
      comSelect, comInsert, comUpdate, comDelete,
    };
    console.log(`  Uptime: ${uptime}s (${(uptime / 86400).toFixed(2)} days)`);
    console.log(`  Total Questions: ${questions}`);
    console.log(`  QPS: ${report.serverUptime.qps}`);
    console.log(`  SELECT: ${comSelect}, INSERT: ${comInsert}, UPDATE: ${comUpdate}, DELETE: ${comDelete}`);
  } catch (e) {
    console.log(`  Uptime error: ${e.message}`);
  }

  // ── 9. Database Size ──
  console.log('\n=== 9. Database Size ===');
  try {
    const dbName = envVal('DB_NAME');
    const dbSize = await qVal(`SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) FROM information_schema.TABLES WHERE table_schema = '${dbName}'`);
    report.databaseSizeMB = dbSize;
    console.log(`  Database size: ${dbSize} MB`);
  } catch (e) {
    console.log(`  DB size error: ${e.message}`);
  }

  // ── 10. Top Tables ──
  console.log('\n=== 10. Table Statistics (top 20 by rows) ===');
  try {
    const dbName = envVal('DB_NAME');
    const tables = await q(`SELECT table_name, table_rows, ROUND((data_length + index_length)/1024/1024, 2) AS size_mb, auto_increment FROM information_schema.TABLES WHERE table_schema = '${dbName}' ORDER BY table_rows DESC LIMIT 20`);
    report.topTables = tables;
    tables.forEach(r => {
      console.log(`  ${r.table_name}: ~${r.table_rows} rows, ${r.size_mb} MB`);
    });
  } catch (e) {
    console.log(`  Table stats error: ${e.message}`);
  }

  // ── 11. Migrations ──
  console.log('\n=== 11. Migration Status ===');
  try {
    const migs = await q('SELECT id, name, applied_at FROM schema_migrations ORDER BY id');
    report.migrations = migs;
    migs.forEach(r => console.log(`  ${r.id}: ${r.name} (${r.applied_at})`));
    console.log(`  Total applied: ${migs.length}`);
  } catch (e) {
    console.log(`  Migrations error: ${e.message}`);
  }

  // ── 12. User Privileges ──
  console.log('\n=== 12. Database User Privileges ===');
  try {
    const grants = await q(`SHOW GRANTS FOR CURRENT_USER`);
    report.userGrants = grants.map(r => r[Object.keys(r)[0]]);
    report.userGrants.forEach(g => console.log(`  ${g}`));
  } catch (e) {
    console.log(`  Grants error: ${e.message}`);
  }

  // ── 13. Lock Contention ──
  console.log('\n=== 13. Lock Contention ===');
  try {
    const lockVars = ['Innodb_row_lock_waits', 'Innodb_row_lock_time', 'Innodb_row_lock_time_avg',
      'Innodb_row_lock_current_waits', 'Table_locks_waited', 'Table_locks_immediate'];
    report.lockContention = {};
    for (const v of lockVars) {
      const rows = await q(`SHOW STATUS LIKE '${v}'`);
      const val = rows.length > 0 ? rows[0].Value : '0';
      report.lockContention[v] = val;
      console.log(`  ${v}: ${val}`);
    }
  } catch (e) {
    console.log(`  Lock stats error: ${e.message}`);
  }

  // ── Close ──
  await conn.end();

  // ── Filesystem Checks (shell) ──

  // 14. Backup Inventory
  console.log('\n=== 14. Backup Inventory ===');
  const backupDirs = [
    '/home/u727965524/deploy_backups/db_snapshots',
    '/home/u727965524/deploy_backups',
    '/home/u727965524/backups',
  ];
  report.backupInventory = {};
  for (const dir of backupDirs) {
    try {
      const listing = execSync(`ls -lhtr ${dir}/ 2>/dev/null | tail -25`, { encoding: 'utf8', timeout: 5000 }).trim();
      if (listing) {
        console.log(`  ${dir}:`);
        console.log(`    ${listing.replace(/\n/g, '\n    ')}`);
        report.backupInventory[dir] = listing;
      }
    } catch (_) {}
  }

  // SHA-256 of snapshot files
  console.log('\n=== 14b. Snapshot SHA-256 Verification ===');
  try {
    const snapshotDir = '/home/u727965524/deploy_backups/db_snapshots';
    const files = fs.readdirSync(snapshotDir).filter(f => f.endsWith('.sql.gz')).sort();
    report.snapshotFiles = [];
    for (const f of files) {
      const fullPath = path.join(snapshotDir, f);
      const stat = fs.statSync(fullPath);
      const hash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
      const info = { file: f, size: stat.size, modified: stat.mtime.toISOString(), sha256: hash };
      report.snapshotFiles.push(info);
      console.log(`  ${f}: ${stat.size} bytes, SHA-256=${hash}, modified=${stat.mtime.toISOString()}`);
    }
    console.log(`  Total snapshots: ${files.length}`);
  } catch (e) {
    console.log(`  Snapshot inventory error: ${e.message}`);
  }

  // 15. Disk utilization
  console.log('\n=== 15. Disk Utilization ===');
  try {
    const df = execSync('df -h /home/u727965524 / 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim();
    report.diskUtilization = df;
    console.log(`  ${df.replace(/\n/g, '\n  ')}`);
  } catch (_) {}

  // 16. Crontab
  console.log('\n=== 16. Scheduled Backups (crontab) ===');
  try {
    const crontab = execSync('crontab -l 2>&1', { encoding: 'utf8', timeout: 5000 }).trim();
    report.crontab = crontab;
    console.log(`  ${crontab}`);
  } catch (_) {
    report.crontab = 'NO CRONTAB';
    console.log('  No crontab for this user.');
  }

  // 17. Offsite backup tools
  console.log('\n=== 17. Offsite Backup Tools ===');
  const tools = ['rclone', 'restic', 'aws', 'gsutil', 's3cmd', 'borgbackup', 'borg', 'duplicity'];
  report.offsiteTools = {};
  for (const tool of tools) {
    try {
      const which = execSync(`which ${tool} 2>/dev/null`, { encoding: 'utf8', timeout: 3000 }).trim();
      report.offsiteTools[tool] = which;
      console.log(`  ${tool}: FOUND at ${which}`);
    } catch (_) {
      report.offsiteTools[tool] = 'NOT INSTALLED';
    }
  }

  // 18. Backup permissions
  console.log('\n=== 18. Backup File Security ===');
  try {
    const perms = execSync('ls -la /home/u727965524/deploy_backups/ 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim();
    console.log(`  ${perms.replace(/\n/g, '\n  ')}`);
    report.backupPermissions = perms;
  } catch (_) {}
  try {
    const perms2 = execSync('ls -la /home/u727965524/deploy_backups/db_snapshots/ 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim();
    console.log(`  ${perms2.replace(/\n/g, '\n  ')}`);
  } catch (_) {}

  // Check web accessibility
  try {
    const webBackups = execSync("find /home/u727965524/public_html -name '*.sql*' -o -name '*backup*.gz' 2>/dev/null | head -5", { encoding: 'utf8', timeout: 5000 }).trim();
    if (webBackups) {
      console.log(`  WARNING: Backup files in web root: ${webBackups}`);
      report.backupInWebRoot = webBackups;
    } else {
      console.log('  ✓ No backup files in web root');
      report.backupInWebRoot = 'NONE';
    }
  } catch (_) {
    report.backupInWebRoot = 'CHECK_FAILED';
  }

  // 19. PM2 status
  console.log('\n=== 19. PM2 Application Status ===');
  try {
    const pm2 = execSync('export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH"; pm2 jlist 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    const pm2Data = JSON.parse(pm2);
    report.pm2 = pm2Data.map(p => ({
      name: p.name, status: p.pm2_env?.status, pid: p.pid,
      uptime: p.pm2_env?.pm_uptime, restarts: p.pm2_env?.restart_time,
      memory: p.monit?.memory, cpu: p.monit?.cpu
    }));
    report.pm2.forEach(p => {
      console.log(`  ${p.name}: status=${p.status}, pid=${p.pid}, restarts=${p.restarts}, mem=${Math.round((p.memory||0)/1024/1024)}MB, cpu=${p.cpu}%`);
    });
  } catch (e) {
    console.log(`  PM2 check error: ${e.message}`);
  }

  // ── Final JSON ──
  console.log('\n\n=== FULL_JSON_REPORT_START ===');
  console.log(JSON.stringify(report, null, 2));
  console.log('=== FULL_JSON_REPORT_END ===');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
