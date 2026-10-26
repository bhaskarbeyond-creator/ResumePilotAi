'use strict';

/**
 * Migration rollback drill (tier "migration").
 *
 * ## Why a drill and not just static analysis
 *
 * `migrations-integrity.test.js` proves every destructive forward migration has a
 * rollback and that the rollback only names objects its forward created — from
 * the *text*. This suite proves the rollback actually works on an engine:
 *
 *   empty schema → full forward chain → production-like marker rows →
 *   every `.down.sql` in reverse order → schema returns to the documented
 *   residue → full forward chain again → idempotent and the marker rows survive.
 *
 * "Documented residue" is `config_change_log`: migration 029's rollback
 * deliberately retains it (evidence survives its own rollback —
 * `029_config_overrides.down.sql`), and `001_baseline.sql` has no rollback by
 * design (its inverse is deployment-level restore, DEPLOYMENT-RUNBOOK §3).
 * Everything else a migration created must be gone after the drill.
 *
 * Destructive and opt-in like `mariadb-migration-gate.test.js`: it drops every
 * table in the configured database. Only a disposable MariaDB under
 * `NODE_ENV=test` is accepted.
 *
 * Run: RUN_MARIADB_INTEGRATION=true MARIADB_TEST_ALLOW_RESET=true NODE_ENV=test \
 *      node --test test/migration-rollback-drill.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { loadDisposableMariaDb } = require('./helpers/disposableMariaDb');

const ENABLED = process.env.RUN_MARIADB_INTEGRATION === 'true';
const DB = ENABLED ? loadDisposableMariaDb(process.env, { destructive: true }) : null;
const MIGRATIONS = path.join(__dirname, '..', 'database', 'migrations');

/** Forward migrations in order; `001_baseline` is excluded from the drill's
 * rollback phase because it has no rollback by design. */
function forwardChain() {
  return fs.readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.sql') && !name.endsWith('.down.sql'))
    .sort();
}

function downFor(name) {
  const candidate = path.join(MIGRATIONS, name.replace(/\.sql$/, '.down.sql'));
  return fs.existsSync(candidate) ? candidate : null;
}

/**
 * Execute a migration file. Statements are split on semicolons at line ends;
 * migrations in this repo avoid stored procedures and delimiter changes
 * (pinned by migrations-integrity.test.js), so this is sufficient and honest.
 */
async function runSqlFile(connection, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const statements = sql
    .split(/;\s*$/m)
    .map(statement => statement
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .trim())
    .filter(Boolean);
  for (const statement of statements) {
    await connection.query(statement);
  }
}

async function listTables(connection) {
  const [rows] = await connection.query(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ?',
    [DB.database],
  );
  return new Set(rows.map(row => String(row.name || row.TABLE_NAME)));
}

test('migration rollback drill: forward → rollback → forward keeps data and returns to documented residue', {
  skip: ENABLED ? false : 'set RUN_MARIADB_INTEGRATION=true against a disposable MariaDB 11.4 database',
  timeout: 180_000,
}, async () => {
  const connection = await mysql.createConnection({
    host: DB.host,
    port: DB.port,
    user: DB.user,
    password: DB.password,
    database: DB.database,
    multipleStatements: false,
  });
  try {
    // 0. Empty schema.
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    const [tables] = await connection.query(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ?',
      [DB.database],
    );
    for (const row of tables) {
      await connection.query(`DROP TABLE \`${String(row.name || row.TABLE_NAME)}\``);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    // 1. Full forward chain.
    const chain = forwardChain();
    assert.ok(chain.length >= 28, `expected the full history, found ${chain.length} migrations`);
    for (const name of chain) {
      await runSqlFile(connection, path.join(MIGRATIONS, name));
    }
    const afterForward = await listTables(connection);
    for (const required of ['users', 'config_overrides', 'config_change_log', 'admin_roles', 'support_tickets']) {
      assert.ok(afterForward.has(required), `forward chain must create ${required}`);
    }

    // 2. Production-like marker rows in tables the drill expects to survive
    //    (baseline-owned) and in a table the rollback is expected to drop.
    await connection.query(
      "INSERT INTO users (id, email, displayName, role, membership) VALUES ('drill_user', 'drill@example.test', 'Drill', 'ADMIN', 'Basic')",
    );
    await connection.query(
      "INSERT INTO config_change_log (id, config_key, scope, value_before, value_after, revision_before, revision_after, actor_uid) VALUES ('drill_log', 'drill.key', 'platform', '{}', '{}', 0, 1, 'drill_user')",
    );
    await connection.query(
      "INSERT INTO config_overrides (config_key, value, revision, updated_by) VALUES ('drill.key', JSON_QUOTE('v1'), 1, 'drill_user')",
    );

    // 3. Rollback in reverse order, skipping the baseline (no rollback by design).
    for (const name of [...chain].reverse()) {
      if (name === '001_baseline.sql') continue;
      const down = downFor(name);
      assert.ok(down, `${name} must have a rollback for the drill to reverse it`);
      await runSqlFile(connection, down);
    }

    const afterDown = await listTables(connection);
    assert.ok(afterDown.has('users'), 'baseline tables survive the rollback of later migrations');
    assert.ok(afterDown.has('config_change_log'), 'config_change_log is documented residue: it survives its own rollback');
    assert.ok(!afterDown.has('config_overrides'), '029 rollback must drop config_overrides');
    assert.ok(!afterDown.has('admin_roles'), '028 rollback must drop the RBAC tables');
    assert.ok(!afterDown.has('support_tickets'), '015 rollback must drop the support tables');

    // Marker data in baseline-owned tables survived the schema rollback.
    const [survivors] = await connection.query("SELECT id FROM users WHERE id = 'drill_user'");
    assert.equal(survivors.length, 1, 'a rollback of later migrations must not delete baseline rows');

    // 4. Re-apply the forward chain: the system returns to full function and
    //    the pre-rollback marker rows are still there (reversibility).
    for (const name of chain) {
      await runSqlFile(connection, path.join(MIGRATIONS, name));
    }
    const afterReapply = await listTables(connection);
    assert.deepEqual([...afterReapply].sort(), [...afterForward].sort(), 're-apply must restore exactly the forward schema');
    const [logs] = await connection.query("SELECT id FROM config_change_log WHERE id = 'drill_log'");
    assert.equal(logs.length, 1, 'the evidence row written before the rollback survives the full cycle');

    // 5. Idempotency after the drill: re-running the chain is a no-op.
    for (const name of chain) {
      await runSqlFile(connection, path.join(MIGRATIONS, name));
    }
    const afterRepeat = await listTables(connection);
    assert.deepEqual([...afterRepeat].sort(), [...afterForward].sort(), 'a third pass must be a no-op');
  } finally {
    await connection.end();
  }
});
