'use strict';

/**
 * PH4-ENGINE-022 — migrations 028/029 on the disposable MariaDB (Ruling 12).
 *
 * EXECUTED-IN-WASM — REAL WINDOW PENDING: everything here runs against the
 * sandbox MariaDB bridge (lite4mariadb embedded), which is a substitute
 * engine. Per the mariadb-migration-gate contract, substitute-engine results
 * are NOT target-database evidence: the same checklist must re-run on native
 * MariaDB >= 11.4 in the real DDL window (scripts/dev-db/migration-dry-run.sh).
 *
 * Covers test-plan part-2 item 1:
 *   - ledger rows 028/029 with sha256 checksums matching the checked-in files
 *   - SHOW CREATE TABLE ai_routing_decisions equals the proposal §4.1 shape
 *   - enterprise_ai_usage.decision_id exists, nullable, indexed
 *   - down round-trip (029.down -> 028.down -> re-up) restores the baseline
 *   - parallel runMigrations under GET_LOCK: the second run is a no-op
 *   - legacy (pre-C, column-explicit) INSERTs keep working post-029
 *
 * Unlike the destructive migration gate, this file touches ONLY its own 028/029
 * objects — it is safe to run inside the shared suite (sequential protocol).
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const ENABLED = process.env.RUN_MARIADB_INTEGRATION === 'true';
if (ENABLED) require('./helpers/disposableMariaDb').loadDisposableMariaDb();
const mariaTest = (name, fn) => test(name, {
  skip: ENABLED ? false : 'NOT VERIFIED: set RUN_MARIADB_INTEGRATION=true against a disposable migrated MariaDB database',
}, fn);

const { getPool } = require('../database/mysql');
const { migrationStatus, runMigrations, splitSqlStatements, sha256 } = require('../database/migrationRunner');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations');
const rid = () => crypto.randomBytes(8).toString('hex');

async function applyDown(version) {
  const file = fs.readdirSync(MIGRATIONS_DIR).find(name => name.startsWith(`${version}_`) && name.endsWith('.down.sql'));
  assert.ok(file, `down file for ${version} must exist`);
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    for (const statement of splitSqlStatements(sql)) await connection.query(statement);
    await connection.query('DELETE FROM schema_migrations WHERE version = ?', [version]);
  } finally {
    connection.release();
  }
}

async function tableExists(connection, table) {
  const [rows] = await connection.query('SHOW TABLES LIKE ?', [table]);
  return rows.length > 0;
}

mariaTest('028/029 are applied by the runner with checksums matching the checked-in files', async () => {
  const pool = getPool();
  const status = await migrationStatus(pool);
  assert.equal(status.mismatches.length, 0, `ledger mismatches: ${JSON.stringify(status.mismatches)}`);
  for (const version of ['028', '029']) {
    const source = status.migrations.find(migration => migration.version === version);
    assert.ok(source, `${version} must be discovered from the migrations directory`);
    const applied = status.applied.find(row => String(row.version) === version);
    assert.ok(applied, `${version} must be applied on the disposable database`);
    assert.equal(applied.checksum, source.checksum, `${version} ledger checksum must equal sha256 of the file`);
    const file = fs.readFileSync(path.join(MIGRATIONS_DIR, source.file), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(source.checksum, sha256(file));
  }
  assert.equal(status.pending.length, 0, 'no migration may be pending on a fully initialized disposable DB');
});

mariaTest('ai_routing_decisions matches the proposal shape: PK, columns, three indexes', async () => {
  const connection = await getPool().getConnection();
  try {
    const [columns] = await connection.query('SHOW COLUMNS FROM ai_routing_decisions');
    const byField = new Map(columns.map(column => [column.Field, column]));
    for (const field of ['decision_id', 'created_at', 'day_key', 'scope', 'tenant_id', 'uid_hash', 'mode', 'requested_model', 'chosen_provider', 'chosen_model', 'exploration', 'quality_evidence', 'observed_latency_ms', 'observation_count', 'outcome', 'status', 'latency_ms', 'prompt_tokens', 'completion_tokens']) {
      assert.ok(byField.has(field), `column ${field} must exist`);
    }
    assert.equal(byField.get('decision_id').Key, 'PRI');
    assert.match(byField.get('decision_id').Type, /char\(36\)/i);
    assert.equal(byField.get('tenant_id').Null, 'YES', 'tenant_id is honestly nullable');
    assert.equal(byField.get('prompt_tokens').Null, 'YES', 'NULL-when-unknown token columns');
    const [indexes] = await connection.query('SHOW INDEX FROM ai_routing_decisions');
    const names = new Set(indexes.map(index => index.Key_name));
    assert.ok(names.has('idx_ard_tenant_day'));
    assert.ok(names.has('idx_ard_uid_day'));
    assert.ok(names.has('idx_ard_created'));
    const [createRows] = await connection.query('SHOW CREATE TABLE ai_routing_decisions');
    const createSql = createRows[0]['Create Table'];
    assert.match(createSql, /ENGINE=InnoDB/);
    assert.match(createSql, /utf8mb4_unicode_ci/);
    assert.doesNotMatch(createSql, /FOREIGN KEY/, 'no FK constraints by design (fail-open ledger)');
  } finally {
    connection.release();
  }
});

mariaTest('enterprise_ai_usage gains the nullable indexed decision_id join column', async () => {
  const connection = await getPool().getConnection();
  try {
    const [columns] = await connection.query("SHOW COLUMNS FROM enterprise_ai_usage LIKE 'decision_id'");
    assert.equal(columns.length, 1);
    assert.equal(columns[0].Null, 'YES', 'the join column must be nullable for legacy rows');
    assert.match(columns[0].Type, /char\(36\)/i);
    const [indexes] = await connection.query("SHOW INDEX FROM enterprise_ai_usage WHERE Key_name = 'idx_ent_ai_usage_decision'");
    assert.ok(indexes.length >= 1);
  } finally {
    connection.release();
  }
});

mariaTest('legacy column-explicit INSERTs keep working post-029; decision_id rides along when present', async () => {
  const connection = await getPool().getConnection();
  const tenantId = `tenant-mig-${rid()}`;
  const legacyId = `legacy-${rid()}`;
  const joinedId = `joined-${rid()}`;
  const decisionId = crypto.randomUUID();
  try {
    // enterprise_ai_usage carries fk_ent_ai_tenant (tenantId -> enterprise_tenants): seed a disposable tenant.
    await connection.query(
      'INSERT INTO enterprise_tenants (id, slug, displayName, isolationTier, lifecycleState) VALUES (?, ?, ?, ?, ?)',
      [tenantId, `slug-${tenantId}`, 'Migration dry-run tenant', 'STANDARD', 'ACTIVE']
    );
    // The exact pre-C shape (mysqlEnterpriseRepository.recordAiUsage column list minus decision_id):
    await connection.query(
      `INSERT INTO enterprise_ai_usage
       (id, tenantId, workspaceId, principalId, dayKey, provider, model, operation,
        eventKey, correlationId, policyVersion, promptTokens, completionTokens,
        totalTokens, costEstimate, costMicros, recordedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = VALUES(id)`,
      [legacyId, tenantId, null, 'principal-1', '2026-10-26', 'groq', 'm1', 'test-op',
        `evt-${legacyId}`, 'corr-1', 1, 10, 20, 30, 0.5, 500000, new Date()]
    );
    const [legacyRows] = await connection.query('SELECT decision_id FROM enterprise_ai_usage WHERE id = ?', [legacyId]);
    assert.equal(legacyRows[0].decision_id, null, 'legacy inserts honestly keep NULL');
    // Post-C shape: the same insert plus the join key.
    await connection.query(
      `INSERT INTO enterprise_ai_usage
       (id, tenantId, workspaceId, principalId, dayKey, provider, model, operation,
        eventKey, correlationId, policyVersion, promptTokens, completionTokens,
        totalTokens, costEstimate, costMicros, recordedAt, decision_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [joinedId, tenantId, null, 'principal-1', '2026-10-26', 'groq', 'm1', 'test-op',
        `evt-${joinedId}`, 'corr-1', 1, 10, 20, 30, 0.5, 500000, new Date(), decisionId]
    );
    // And the ledger row it must join to:
    await connection.query(
      `INSERT INTO ai_routing_decisions
       (decision_id, created_at, day_key, scope, tenant_id, uid_hash, mode, requested_model,
        chosen_provider, chosen_model, exploration, quality_evidence, observed_latency_ms,
        observation_count, outcome, status, latency_ms, prompt_tokens, completion_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [decisionId, new Date(), '2026-10-26', 'tenant', tenantId, null, 'auto', 'm1',
        'groq', 'm1', null, 'unknown', null, 0, 'success', 200, 123, 10, 20]
    );
    const [joined] = await connection.query(
      `SELECT u.id, d.chosen_provider FROM enterprise_ai_usage u
       JOIN ai_routing_decisions d ON d.decision_id = u.decision_id
       WHERE u.id = ?`, [joinedId]);
    assert.equal(joined.length, 1, 'the 022 join works end-to-end at the SQL level');
    assert.equal(joined[0].chosen_provider, 'groq');
  } finally {
    // Tenant delete cascades to its usage rows (ON DELETE CASCADE).
    await connection.query('DELETE FROM enterprise_tenants WHERE id = ?', [tenantId]).catch(() => {});
    await connection.query('DELETE FROM enterprise_ai_usage WHERE id IN (?, ?)', [legacyId, joinedId]).catch(() => {});
    await connection.query('DELETE FROM ai_routing_decisions WHERE decision_id = ?', [decisionId]).catch(() => {});
    connection.release();
  }
});

mariaTest('down round-trip: 029.down -> 028.down -> re-up restores the baseline exactly', async () => {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    // Baseline snapshot of enterprise_ai_usage columns BEFORE the downs.
    const [beforeColumns] = await connection.query('SHOW COLUMNS FROM enterprise_ai_usage');
    const beforeNames = beforeColumns.map(column => column.Field);
    assert.ok(beforeNames.includes('decision_id'));

    await applyDown('029');
    const [afterDown029] = await connection.query('SHOW COLUMNS FROM enterprise_ai_usage');
    assert.ok(!afterDown029.map(column => column.Field).includes('decision_id'), '029.down drops the join column');
    const [downIndex] = await connection.query("SHOW INDEX FROM enterprise_ai_usage WHERE Key_name = 'idx_ent_ai_usage_decision'");
    assert.equal(downIndex.length, 0, '029.down drops the index');

    await applyDown('028');
    assert.equal(await tableExists(connection, 'ai_routing_decisions'), false, '028.down drops the ledger table');

    const statusMid = await migrationStatus(pool);
    assert.deepEqual(statusMid.pending.map(row => row.version), ['028', '029'], 'the ledger now reports exactly 028/029 as pending');

    // Re-up through the real runner.
    const result = await runMigrations(pool, { mode: 'apply', environment: { NODE_ENV: 'test' } });
    assert.deepEqual(result.applied.map(row => row.version), ['028', '029'], 'the runner re-applies both cleanly');
    assert.equal(await tableExists(connection, 'ai_routing_decisions'), true);
    const [afterUp] = await connection.query('SHOW COLUMNS FROM enterprise_ai_usage');
    assert.deepEqual(
      afterUp.map(column => column.Field).sort(),
      beforeNames.sort(),
      'the re-up column set equals the pre-down baseline exactly'
    );
    const statusFinal = await migrationStatus(pool);
    assert.equal(statusFinal.pending.length, 0);
    assert.equal(statusFinal.mismatches.length, 0);
  } finally {
    connection.release();
  }
});

mariaTest('parallel runMigrations under GET_LOCK: the second concurrent run is a clean no-op', async () => {
  const pool = getPool();
  // Both runs see a fully-applied ledger; the assertion is that concurrency
  // never produces double-apply errors or ledger corruption.
  const [first, second] = await Promise.all([
    runMigrations(pool, { mode: 'apply', environment: { NODE_ENV: 'test' } }),
    runMigrations(pool, { mode: 'apply', environment: { NODE_ENV: 'test' } }),
  ]);
  assert.deepEqual(first.applied, []);
  assert.deepEqual(second.applied, []);
  const status = await migrationStatus(pool);
  assert.equal(status.pending.length, 0);
  assert.equal(status.mismatches.length, 0);
  const appliedVersions = status.applied.map(row => String(row.version));
  assert.equal(new Set(appliedVersions).size, appliedVersions.length, 'no duplicate ledger rows');
});
