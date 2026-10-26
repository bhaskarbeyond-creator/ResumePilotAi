'use strict';

/**
 * Query-plan regression suite (tier "performance").
 *
 * ## What a query-plan regression gate guards
 *
 * A query that is fast on a 100-row development table becomes an outage on a
 * 10M-row production table the first time someone adds a `WHERE` clause no index
 * serves, or wraps an indexed column in a function. This suite pins the *access
 * path* of every hot query in the control plane: the columns it filters on must
 * be served by an index the migration chain actually declares, and an unbounded
 * recency scan must get its order from an index rather than a filesort of the
 * whole table.
 *
 * Two layers, and the boundary between them is stated rather than implied:
 *
 *   1. **Static index coverage (always runs).** The registry below names the top
 *      queries by traffic (`mariadb-query-budget.test.js` proved the round-trip
 *      counts; this proves the plans). For each entry the test parses every
 *      migration for the table's index definitions and asserts a leftmost-prefix
 *      match on the filter columns. It also asserts the query text still exists
 *      at its recorded source location, so the registry cannot silently rot.
 *   2. **EXPLAIN on MariaDB (opt-in, `RUN_MARIADB_INTEGRATION=true`).** Against a
 *      disposable schema each registered statement is EXPLAINed and must resolve
 *      to an index access (`type` != `ALL`, `key` present). This part needs a
 *      real engine and runs in the database-backed CI job and the migration gate.
 *
 * A registry entry with `boundedScan: true` is a deliberate, documented exception:
 * a leading-wildcard `LIKE '%…%'` that no btree can serve, accepted because it is
 * an operator-initiated search bounded by `LIMIT`. The test asserts the bound is
 * part of the recorded statement — an unbounded scan would fail even for these.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'database', 'migrations');

/* ── migration index parser ─────────────────────────────────────────── */

/** @returns {string[]} forward migration filenames, ordered */
function forwardMigrations() {
  return fs.readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.sql') && !name.endsWith('.down.sql'))
    .sort();
}

/**
 * Collect every index declaration in the migration chain, including
 * column-level `PRIMARY KEY` (e.g. `token_hash VARCHAR(64) NOT NULL PRIMARY KEY`).
 * @returns {Map<string, Array<{ name: string, columns: string[] }>>}
 */
function collectIndexes() {
  /** @type {Map<string, Array<{ name: string, columns: string[] }>>} */
  const byTable = new Map();
  const remember = (table, name, columns) => {
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table).push({ name, columns: columns.map(column => column.trim().replace(/[`]/g, '').toLowerCase()) });
  };
  const splitColumns = (raw) => raw
    .replace(/\b(?:ASC|DESC)\b/gi, '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  for (const file of forwardMigrations()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');

    for (const tableBlock of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*ENGINE/gi)) {
      const [, table, body] = tableBlock;

      // Table-level index declarations.
      for (const decl of body.matchAll(/(?:^|,)\s*(?:UNIQUE\s+)?(?:INDEX|KEY)\s+([a-z0-9_]+)\s*\(([^)]+)\)/gi)) {
        remember(table, decl[1], splitColumns(decl[2]));
      }
      for (const decl of body.matchAll(/(?:^|,)\s*PRIMARY KEY\s*\(([^)]+)\)/gi)) {
        remember(table, 'PRIMARY', splitColumns(decl[1]));
      }
      // Column-level PRIMARY KEY (`col TYPE … PRIMARY KEY`).
      for (const decl of body.matchAll(/(?:^|,)\s*`?([a-z0-9_]+)`?\s+[A-Z][A-Z0-9_]*(?:\([^)]*\))?[^,\n]*?\bPRIMARY\s+KEY\b/gi)) {
        remember(table, 'PRIMARY', [decl[1]]);
      }
    }

    for (const decl of sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?([a-z0-9_]+)\s+ON\s+([a-z0-9_]+)\s*\(([^)]+)\)/gi)) {
      remember(decl[2], decl[1], splitColumns(decl[3]));
    }
  }
  return byTable;
}

/** @param {string} file @param {string} snippet */
function assertSourceStillContains(file, snippet) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.ok(
    source.includes(snippet),
    `the registry entry "${snippet.slice(0, 70)}…" no longer exists in ${file}; ` +
    'update test/query-plan-regression.test.js to the new statement so its plan stays pinned',
  );
}

/* ── the hot-query registry ─────────────────────────────────────────── */

/**
 * Top queries by control-plane traffic.
 *   `filter`   — columns the WHERE clause compares; an index must lead with them.
 *   `orderBy`  — the sort column. When `filter` is empty (an unbounded scan) the
 *                index must lead with this column so the engine orders via the
 *                index instead of a full-table filesort. When `filter` is
 *                non-empty the result is LIMIT-bounded and a residual sort is
 *                an accepted plan.
 */
const HOT_QUERIES = [
  {
    name: 'outbox recency sample (notification)',
    file: 'routes/platform.js',
    snippet: 'FROM notification_outbox ORDER BY created_at DESC LIMIT ?',
    table: 'notification_outbox',
    filter: [],
    orderBy: 'created_at',
  },
  {
    name: 'outbox recency sample (enterprise)',
    file: 'routes/platform.js',
    snippet: 'FROM enterprise_outbox ORDER BY created_at DESC LIMIT ?',
    table: 'enterprise_outbox',
    filter: [],
    orderBy: 'created_at',
  },
  {
    name: 'notification due scan (lease reclaim)',
    file: 'database/migrations/001_baseline.sql',
    snippet: 'idx_notification_due (state, next_attempt_at)',
    table: 'notification_outbox',
    filter: ['state', 'next_attempt_at'],
  },
  {
    name: 'admin directory batch profiles',
    file: 'repositories/MySQLRepository.js',
    snippet: 'SELECT * FROM users WHERE id IN (',
    table: 'users',
    filter: ['id'],
  },
  {
    name: 'identity lookup by email',
    file: 'repositories/MySQLRepository.js',
    snippet: 'FROM users WHERE email = ? LIMIT 1',
    table: 'users',
    filter: ['email'],
  },
  {
    name: 'admin audit trail by actor',
    file: 'repositories/MySQLRepository.js',
    snippet: 'SELECT * FROM admin_audit_logs WHERE 1=1',
    table: 'admin_audit_logs',
    filter: ['actor_uid'],
    orderBy: 'created_at',
  },
  {
    name: 'admin audit recency window',
    file: 'routes/platform.js',
    snippet: 'FROM admin_audit_logs ORDER BY created_at DESC LIMIT 8',
    table: 'admin_audit_logs',
    filter: [],
    orderBy: 'created_at',
  },
  {
    name: 'security events recency window',
    file: 'routes/platform.js',
    snippet: 'FROM security_audit_logs ORDER BY created_at DESC LIMIT ?',
    table: 'security_audit_logs',
    filter: [],
    orderBy: 'created_at',
  },
  {
    name: 'support ticket inbox by user',
    file: 'services/supportTickets.js',
    snippet: 'FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100',
    table: 'support_tickets',
    filter: ['user_id'],
    orderBy: 'updated_at',
  },
  {
    name: 'support queue by status',
    file: 'services/supportTickets.js',
    snippet: 'FROM support_tickets ${where} ORDER BY updated_at DESC LIMIT 200',
    table: 'support_tickets',
    filter: ['status'],
    orderBy: 'updated_at',
  },
  {
    name: 'conversation thread page',
    file: 'database/migrations/001_baseline.sql',
    snippet: 'idx_conv_messages_conv_ts (conversation_id, timestamp)',
    table: 'conversation_messages',
    filter: ['conversation_id'],
    orderBy: 'timestamp',
  },
  {
    name: 'password reset token lookup',
    file: 'database/authTokens.js',
    snippet: 'FROM password_reset_tokens WHERE token_hash = ?',
    table: 'password_reset_tokens',
    filter: ['token_hash'],
  },
  {
    name: 'operator directory search',
    file: 'routes/platform.js',
    snippet: "FROM support_tickets WHERE subject LIKE ? ESCAPE '\\\\\\\\' OR id = ? OR user_id = ? LIMIT 10",
    table: 'support_tickets',
    // A leading-wildcard LIKE cannot use a btree; this is a bounded operator
    // search (LIMIT 10), not a per-request hot path. The bound is the contract.
    filter: [],
    boundedScan: true,
  },
];

const indexesByTable = collectIndexes();

/* ── static layer (always runs) ─────────────────────────────────────── */

test('query-plan registry: every hot query still exists where it is recorded', () => {
  assert.ok(HOT_QUERIES.length >= 10, 'the registry must cover the top queries, not a sample');
  for (const entry of HOT_QUERIES) {
    assertSourceStillContains(entry.file, entry.snippet);
    if (entry.boundedScan) {
      assert.match(entry.snippet, /LIMIT\s+\d+/i, 'a bounded-scan exception must carry its bound in the recorded statement');
    }
  }
});

test('query-plan registry: the migrations declare indexes for every hot table', () => {
  for (const entry of HOT_QUERIES) {
    assert.ok(
      (indexesByTable.get(entry.table) || []).length > 0,
      `${entry.table} has no index declaration in the migration chain (query: ${entry.name})`,
    );
  }
});

test('query-plan registry: every filter path is served by a leftmost index prefix', () => {
  for (const entry of HOT_QUERIES.filter(candidate => !candidate.boundedScan && candidate.filter.length > 0)) {
    const indexes = indexesByTable.get(entry.table) || [];
    const covered = indexes.some(index => entry.filter.every((column, position) => {
      const lead = index.columns[position];
      return lead !== undefined && lead === column.toLowerCase();
    }));
    assert.ok(
      covered,
      `no index on ${entry.table} leads with (${entry.filter.join(', ')}) — ` +
      `query "${entry.name}" would degrade to a full scan; ` +
      `existing: ${indexes.map(index => `${index.name}(${index.columns.join(',')})`).join(' ') || 'none'}`,
    );
  }
});

test('query-plan registry: an unbounded recency scan is ordered by an index, not a filesort', () => {
  for (const entry of HOT_QUERIES.filter(candidate => !candidate.boundedScan && candidate.filter.length === 0 && candidate.orderBy)) {
    const indexes = indexesByTable.get(entry.table) || [];
    const covered = indexes.some(index => index.columns[0] === entry.orderBy.toLowerCase());
    assert.ok(
      covered,
      `${entry.table}: "${entry.name}" sorts by ${entry.orderBy} with no filter, ` +
      'so an index must lead with that column or every scan filesorts the whole table; ' +
      `existing: ${indexes.map(index => `${index.name}(${index.columns.join(',')})`).join(' ') || 'none'}`,
    );
  }
});

test('query-plan registry: filter+sort pairs land on a composite prefix where one is declared', () => {
  // Where the migration chain declares a composite (filter, sort) index, the
  // plan can be satisfied from the index alone; assert the registry agrees with
  // it so a future rewrite to a different column cannot silently lose the pair.
  const pairs = [
    { table: 'support_tickets', filter: 'user_id', sort: 'updated_at' },
    { table: 'support_tickets', filter: 'status', sort: 'updated_at' },
    { table: 'conversation_messages', filter: 'conversation_id', sort: 'timestamp' },
    { table: 'notification_outbox', filter: 'state', sort: 'next_attempt_at' },
  ];
  for (const pair of pairs) {
    const indexes = indexesByTable.get(pair.table) || [];
    const covered = indexes.some(index => index.columns[0] === pair.filter && index.columns[1] === pair.sort);
    assert.ok(
      covered,
      `${pair.table}: no composite (${pair.filter}, ${pair.sort}) index remains in the migrations`,
    );
  }
});

test('identity lookup is indexable: the email predicate is not wrapped in a function', () => {
  // `WHERE LOWER(email) = ?` hides `idx_user_email`, and under the table's
  // `utf8mb4_unicode_ci` collation it is also unnecessary: equality is already
  // case-insensitive. The lookup must compare the bare column.
  const source = fs.readFileSync(path.join(ROOT, 'repositories', 'MySQLRepository.js'), 'utf8');
  assert.ok(
    source.includes('FROM users WHERE email = ? LIMIT 1'),
    'the identity lookup must filter on the bare email column so idx_user_email serves it',
  );
  assert.ok(
    !/FROM users WHERE LOWER\(email\)/i.test(source),
    'a function-wrapped column hides the index and is redundant under a _ci collation',
  );

  // The equivalence rests on a case-insensitive collation; pin the premise so a
  // future collation change cannot silently make the bare-column lookup wrong.
  const baseline = fs.readFileSync(path.join(MIGRATIONS, '001_baseline.sql'), 'utf8');
  const usersBlock = baseline.match(/CREATE TABLE IF NOT EXISTS users[\s\S]*?ENGINE[^;]*;/i);
  assert.ok(usersBlock, 'the users table must exist in 001_baseline.sql');
  assert.match(
    usersBlock[0],
    /COLLATE=utf8mb4_(?:unicode|general)_ci/i,
    'the users table must use a case-insensitive collation for the bare email lookup to stay equivalent',
  );
});

/* ── EXPLAIN layer (needs a disposable MariaDB) ─────────────────────── */

const ENABLED = process.env.RUN_MARIADB_INTEGRATION === 'true';

test('query-plan EXPLAIN: no hot query resolves to a full table scan', {
  skip: ENABLED ? false : 'set RUN_MARIADB_INTEGRATION=true against a disposable MariaDB 11.4 database',
}, async (t) => {
  assert.ok(process.env.DB_HOST, 'DB_HOST is required');
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  });
  try {
    for (const entry of HOT_QUERIES.filter(candidate => !candidate.boundedScan)) {
      await t.test(entry.name, async () => {
        const predicates = entry.filter.map(column => `${column} = ?`).join(' AND ');
        const order = entry.orderBy ? ` ORDER BY ${entry.orderBy} DESC` : '';
        const sql = `SELECT * FROM ${entry.table}${predicates ? ` WHERE ${predicates}` : ''}${order} LIMIT 5`;
        const [rows] = await connection.query(`EXPLAIN ${sql}`, entry.filter.map(() => 1));
        const plan = rows[0] || {};
        assert.notEqual(
          String(plan.type || '').toLowerCase(),
          'all',
          `${entry.name}: EXPLAIN resolved to a full table scan — ${JSON.stringify(plan)}`,
        );
        assert.ok(plan.key, `${entry.name}: EXPLAIN chose no index — ${JSON.stringify(plan)}`);
      });
    }
  } finally {
    await connection.end();
  }
});
