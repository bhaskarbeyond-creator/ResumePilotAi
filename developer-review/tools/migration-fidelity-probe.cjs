#!/usr/bin/env node
/**
 * AUDIT-ONLY migration fidelity probe (developer-review/tools/).
 *
 * Records, file by file, what the checked-in MariaDB migrations do when they
 * are applied to the only SQL engine obtainable in this sandbox (MySQL 5.7.29
 * from the npm package `mysql-server-5.7-lin-x64`). It exists to produce
 * *evidence for the blocker*, not to prove anything about MariaDB correctness:
 * the repository's own gate (backend/test/mariadb-migration-gate.test.js)
 * explicitly forbids substituting MySQL for target-database evidence.
 *
 * Output: developer-review/Evidence/artifacts/migration-fidelity.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('/home/user/ResumePilotAi/backend/node_modules/mysql2/promise');
const {
  discoverMigrations,
  splitSqlStatements,
} = require('/home/user/ResumePilotAi/backend/database/migrationRunner');

const OUT = path.resolve(__dirname, '../Evidence/artifacts/migration-fidelity.json');
const DB_NAME = 'resumepilot_migration_probe_test';

(async () => {
  const root = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'root' });
  const [versionRows] = await root.query('SELECT VERSION() v, @@version_comment c, @@sql_mode m');
  await root.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  await root.query(`CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'root', database: DB_NAME, multipleStatements: false });

  const migrations = discoverMigrations();
  const results = [];
  for (const migration of migrations) {
    const statements = splitSqlStatements(migration.content);
    let ok = 0;
    let failure = null;
    for (const statement of statements) {
      try {
        await conn.query(statement);
        ok += 1;
      } catch (error) {
        failure = {
          code: error.code || null,
          errno: error.errno || null,
          message: String(error.message).slice(0, 300),
          statement: String(statement).replace(/\s+/g, ' ').slice(0, 300),
        };
        break;
      }
    }
    results.push({
      version: migration.version,
      name: migration.name,
      file: migration.file,
      statements: statements.length,
      statementsApplied: ok,
      applied: failure === null,
      failure,
    });
    if (failure) break; // the app's runner also stops at the first failing migration
  }

  const [tables] = await conn.query(
    'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?', [DB_NAME]
  );
  const applied = results.filter(r => r.applied).length;
  const payload = {
    generatedAt: new Date().toISOString(),
    engine: {
      server: versionRows[0].v,
      comment: versionRows[0].c,
      sqlMode: versionRows[0].m,
      targetEnginePerRepository: 'MariaDB 11.4 (backend/test/mariadb-migration-gate.test.js asserts this)',
      substitutionDeclared: true,
      substitutionNote:
        'MySQL 5.7.29 stands in only because no MariaDB artifact is obtainable in this sandbox. ' +
        'Per the repository gate, this is NOT target-database evidence.',
    },
    database: DB_NAME,
    migrationsDiscovered: migrations.length,
    migrationsApplied: applied,
    tablesCreatedBeforeFirstFailure: tables[0].n,
    firstFailure: results.find(r => !r.applied) || null,
    results,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));

  console.log(`engine            : ${payload.engine.server} (${payload.engine.comment})`);
  console.log(`migrations found  : ${migrations.length}`);
  console.log(`migrations applied: ${applied}`);
  console.log(`tables created    : ${tables[0].n}`);
  if (payload.firstFailure) {
    const f = payload.firstFailure;
    console.log(`first failure     : ${f.file} -> ${f.failure.code} ${f.failure.message}`);
    console.log(`  offending SQL   : ${f.failure.statement}`);
  }

  await conn.end();
  await root.query(`DROP DATABASE \`${DB_NAME}\``);
  await root.end();
})().catch(error => {
  console.error('PROBE ERROR', error.message);
  process.exit(1);
});
