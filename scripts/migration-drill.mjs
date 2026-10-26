#!/usr/bin/env node
/**
 * Migration drill — apply every migration forward, then roll it back, against a real MariaDB.
 *
 * `backend/test/migrations-integrity.test.js` proves statically that every schema-changing
 * migration has a rollback and that the rollback names only what the forward created. That is
 * necessary and not sufficient: a rollback can reference the right objects and still fail on a
 * foreign key, an index name that MariaDB rewrote, or a `CREATE INDEX IF NOT EXISTS` that is
 * only valid on a recent server. This script is the dynamic half.
 *
 * ## Protocol, per migration
 *
 *   1. snapshot the schema (`SHOW TABLES` + `SHOW CREATE TABLE` for each, checksummed);
 *   2. apply the forward file, twice — the second application must succeed *and* leave the
 *      snapshot unchanged, which is what "idempotent" means for a file full of
 *      `CREATE TABLE IF NOT EXISTS`;
 *   3. apply the `.down.sql`, twice, for the same reason;
 *   4. compare the post-rollback schema to the pre-forward snapshot. A migration that leaves
 *      a column or index behind has broken reversibility even though every statement
 *      "succeeded".
 *
 * Migrations with a documented exemption (`001_baseline.sql` has no rollback by design — see
 * `DECISION-LOG.md` and `migrations-integrity.test.js`) are reported, not skipped silently.
 *
 * ## Requirements
 *
 * A **disposable** database. The script refuses to touch one whose name does not end in
 * `_test`, `_drill`, or `_ci`, because step 4 destroys data as a side effect of testing.
 *
 * Usage:
 *   DB_HOST=127.0.0.1 DB_NAME=airesume_drill DB_USER=root node scripts/migration-drill.mjs
 *   node scripts/migration-drill.mjs --only 028_admin_rbac.sql --json
 */

import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

const require = createRequire(new URL('../backend/', import.meta.url));
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'database', 'migrations');

/** Files that intentionally have no reverse. Each entry states why, in one line. */
const EXEMPT = new Map([
  ['001_baseline.sql', 'the baseline creates the schema; rolling it back is only meaningful as DROP DATABASE'],
]);

const { values: options } = parseArgs({
  options: {
    only: { type: 'string' },
    json: { type: 'boolean', default: false },
    'keep-open': { type: 'boolean', default: false },
  },
});

const SAFE_DB_SUFFIXES = ['_test', '_drill', '_ci', '_scratch'];

export function assertDisposable(dbName) {
  if (!SAFE_DB_SUFFIXES.some((suffix) => String(dbName || '').endsWith(suffix))) {
    throw new Error(
      `refusing to run against "${dbName}": the drill destroys data. Use a database whose name ends in ${SAFE_DB_SUFFIXES.join(', ')}.`,
    );
  }
}

/** Split a migration file into statements, tolerating `DELIMITER` blocks and comments. */
export function splitStatements(sql) {
  const withoutBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  const statements = [];
  let current = '';
  let delimiter = ';';
  for (const rawLine of withoutBlockComments.split('\n')) {
    const line = rawLine.trim();
    if (/^--/.test(line) || line === '') continue;
    const delimiterMatch = /^DELIMITER\s+(\S+)$/i.exec(line);
    if (delimiterMatch) {
      if (current.trim()) statements.push(current.trim());
      current = '';
      delimiter = delimiterMatch[1];
      continue;
    }
    current += `${rawLine}\n`;
    if (current.trimEnd().endsWith(delimiter)) {
      const statement = current.trimEnd().slice(0, -delimiter.length).trim();
      if (statement) statements.push(statement);
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function schemaSnapshot(connection) {
  const [tables] = await connection.query(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  const parts = [];
  for (const { name } of tables) {
    const [[row]] = await connection.query(`SHOW CREATE TABLE \`${name}\``);
    const ddl = row['Create Table'] ?? row['Create View'] ?? '';
    // Normalise auto-increment counters: they differ after every insert and carry no schema
    // meaning. Everything else (columns, keys, engine, collation) is compared verbatim.
    const normalised = String(ddl).replace(/ AUTO_INCREMENT=\d+/g, '');
    parts.push(`${name}:${normalised}`);
  }
  return {
    tables: tables.map((row) => row.name),
    checksum: createHash('sha256').update(parts.join('\n')).digest('hex'),
  };
}

async function applyFile(connection, filePath, label) {
  const statements = splitStatements(readFileSync(filePath, 'utf8'));
  for (const statement of statements) {
    try {
      await connection.query(statement);
    } catch (error) {
      throw Object.assign(new Error(`${label}: ${error.code || 'ERROR'} — ${error.message}\n  in: ${statement.slice(0, 200)}`), {
        code: error.code,
      });
    }
  }
  return statements.length;
}

async function main() {
  const dbName = process.env.DB_NAME || '';
  assertDisposable(dbName);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: dbName,
    multipleStatements: false,
  });

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql') && !name.endsWith('.down.sql'))
    .sort();
  const selected = options.only ? files.filter((name) => name === options.only) : files;
  if (selected.length === 0) throw new Error(`no migration matched ${options.only ?? '(all)'}`);

  const results = [];
  try {
    for (const file of selected) {
      const forwardPath = join(MIGRATIONS_DIR, file);
      const downPath = forwardPath.replace(/\.sql$/, '.down.sql');
      const hasRollback = readdirSync(MIGRATIONS_DIR).includes(downPath.split('/').pop());
      const before = await schemaSnapshot(connection);
      const result = { file, hasRollback, steps: [], ok: true };

      try {
        const forwardStatements = await applyFile(connection, forwardPath, `${file} (first application)`);
        result.steps.push(`applied ${forwardStatements} statement(s)`);
        const afterForward = await schemaSnapshot(connection);

        // Idempotency: every migration in this repository is written to be re-runnable.
        await applyFile(connection, forwardPath, `${file} (second application)`);
        const afterSecond = await schemaSnapshot(connection);
        if (afterSecond.checksum !== afterForward.checksum) {
          result.ok = false;
          result.steps.push('NOT IDEMPOTENT: the second application changed the schema');
        } else {
          result.steps.push('second application left the schema unchanged');
        }

        if (!hasRollback) {
          result.steps.push(EXEMPT.has(file) ? `no rollback: ${EXEMPT.get(file)}` : 'NO ROLLBACK FILE');
          if (!EXEMPT.has(file)) result.ok = false;
        } else {
          await applyFile(connection, downPath, `${file} (rollback)`);
          await applyFile(connection, downPath, `${file} (rollback, second application)`);
          const afterRollback = await schemaSnapshot(connection);
          const reversible = EXEMPT.has(file) ? true : afterRollback.checksum === before.checksum;
          if (reversible) {
            result.steps.push('rollback restored the pre-forward schema');
          } else {
            result.ok = false;
            const gained = afterRollback.tables.filter((table) => !before.tables.includes(table));
            const lost = before.tables.filter((table) => !afterRollback.tables.includes(table));
            result.steps.push(
              `ROLLBACK NOT REVERSIBLE: gained tables [${gained.join(', ')}], lost tables [${lost.join(', ')}], schema checksum differs`,
            );
          }
        }
      } catch (error) {
        result.ok = false;
        result.steps.push(`FAILED: ${error.message}`);
      }

      results.push(result);
    }
  } finally {
    if (!options['keep-open']) await connection.end();
  }

  const failures = results.filter((result) => !result.ok);
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ checkedAt: new Date().toISOString(), database: dbName, results }, null, 2)}\n`);
  } else {
    for (const result of results) {
      process.stdout.write(`${result.ok ? 'PASS' : 'FAIL'}  ${result.file}\n`);
      for (const step of result.steps) process.stdout.write(`      ${step}\n`);
    }
    process.stdout.write(`\n${results.length - failures.length}/${results.length} migrations forward-and-back clean\n`);
  }
  if (failures.length > 0) process.exitCode = 1;
}

// Only run when invoked directly: the contract test imports the pure helpers above and must
// not open a database connection as a side effect of the import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`migration drill failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
