#!/usr/bin/env node
/**
 * Query-plan drill — `EXPLAIN` every hot query against a real database.
 *
 * `backend/test/query-plan-regression.test.js` proves the *schema* can serve each hot query.
 * This script proves the *server* does: it runs `EXPLAIN FORMAT=JSON` on the same statements
 * and reports the access type, the rows examined and whether a filesort or temporary table is
 * involved. A plan that scans a table the size of `admin_audit_logs` is the failure this drill
 * is looking for, and it cannot be detected without data.
 *
 * This is deliberately not part of the unit gate — it needs a database with realistic row
 * counts, which a CI runner does not have by default. Run it against a staging replica, or
 * after seeding the disposable database in the `e2e` job.
 *
 * Usage:
 *   node scripts/query-plan-drill.mjs                      # uses DB_* env vars
 *   node scripts/query-plan-drill.mjs --json               # machine-readable output
 *   node scripts/query-plan-drill.mjs --fail-on-scan       # exit 1 if any plan is a full scan
 *
 * Environment: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (same variables the backend
 * uses). Read-only: every statement is a SELECT, and the script refuses to run anything else.
 */

import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const require = createRequire(new URL('../backend/', import.meta.url));
const mysql = require('mysql2/promise');

const { values: options } = parseArgs({
  options: {
    json: { type: 'boolean', default: false },
    'fail-on-scan': { type: 'boolean', default: false },
  },
});

/**
 * The same registry the unit gate uses, expressed as executable statements. Kept beside the
 * test rather than imported from it so a reviewer can read both and see they agree; the test
 * asserts the schema, this asserts the plan.
 */
const QUERIES = [
  {
    id: 'rbac-role-permissions',
    sql: 'SELECT p.resource, p.action FROM admin_role_permissions p WHERE p.role_id = ?',
    params: [1],
    budget: { maxRowsExamined: 500, allowFilesort: true },
  },
  {
    id: 'rbac-user-grants',
    sql: 'SELECT ur.uid, r.name FROM admin_user_roles ur JOIN admin_roles r ON r.id = ur.role_id WHERE ur.uid = ?',
    params: ['drill-uid'],
    budget: { maxRowsExamined: 500, allowFilesort: true },
  },
  {
    id: 'rbac-role-by-name',
    sql: 'SELECT id FROM admin_roles WHERE name = ?',
    params: ['ADMIN'],
    budget: { maxRowsExamined: 50, allowFilesort: true },
  },
  {
    id: 'config-override-key',
    sql: 'SELECT value, revision FROM config_overrides WHERE config_key = ?',
    params: ['security.rateLimit.global'],
    budget: { maxRowsExamined: 50, allowFilesort: true },
  },
  {
    id: 'config-change-history',
    sql: 'SELECT id, config_key, created_at FROM config_change_log WHERE config_key = ? ORDER BY created_at DESC LIMIT 20',
    params: ['security.rateLimit.global'],
    budget: { maxRowsExamined: 500, allowFilesort: false },
  },
  {
    id: 'admin-audit-trail',
    sql: 'SELECT id, action, created_at FROM admin_audit_logs ORDER BY created_at DESC LIMIT 50',
    params: [],
    budget: { maxRowsExamined: 500, allowFilesort: false },
  },
  {
    id: 'audit-by-actor',
    sql: 'SELECT id, action FROM admin_audit_logs WHERE actor_uid = ? ORDER BY created_at DESC LIMIT 50',
    params: ['drill-uid'],
    budget: { maxRowsExamined: 2000, allowFilesort: false },
  },
  {
    id: 'ai-quota-usage',
    sql: 'SELECT count FROM ai_usage WHERE day_key = ? AND uid = ? LIMIT 1',
    params: ['2026-01-01', 'drill-uid'],
    budget: { maxRowsExamined: 100, allowFilesort: true },
  },
];

/** Reject anything that is not a single SELECT, so the drill can run against staging. */
function assertReadOnly(sql) {
  const normalised = sql.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!normalised.startsWith('SELECT ')) throw new Error(`refusing to explain a non-SELECT: ${sql}`);
  for (const forbidden of ['INSERT ', 'UPDATE ', 'DELETE ', 'DROP ', 'ALTER ', 'TRUNCATE ']) {
    if (normalised.includes(forbidden)) throw new Error(`refusing to explain a statement containing ${forbidden.trim()}`);
  }
}

/** Walk MariaDB's JSON plan and pick out the fields that decide whether this is a scan. */
function summarise(plan) {
  const tables = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.table && node.table.table_name) {
      tables.push({
        table: node.table.table_name,
        accessType: node.table.access_type ?? null,
        rowsExamined: Number(node.table.rows_examined_per_scan ?? node.table.rows ?? 0),
        key: node.table.key ?? null,
        possibleKeys: node.table.possible_keys ?? null,
        usingFilesort: node.table.using_filesort === true,
        usingTemporaryTable: node.table.using_temporary_table === true,
      });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(plan);
  return tables;
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'resumes',
  });

  const results = [];
  let scans = 0;
  try {
    for (const query of QUERIES) {
      assertReadOnly(query.sql);
      const [rows] = await connection.query(`EXPLAIN FORMAT=JSON ${query.sql}`, query.params);
      const plan = typeof rows[0]?.EXPLAIN === 'string' ? JSON.parse(rows[0].EXPLAIN) : rows[0]?.EXPLAIN ?? rows[0];
      const tables = summarise(plan);
      const problems = [];
      for (const table of tables) {
        if (table.accessType === 'ALL') problems.push(`${table.table}: full table scan`);
        if (table.rowsExamined > query.budget.maxRowsExamined) {
          problems.push(`${table.table}: examined ${table.rowsExamined} rows, budget ${query.budget.maxRowsExamined}`);
        }
        if (!query.budget.allowFilesort && table.usingFilesort) problems.push(`${table.table}: filesort`);
        if (!query.budget.allowFilesort && table.usingTemporaryTable) problems.push(`${table.table}: temporary table`);
      }
      if (problems.length > 0) scans += 1;
      results.push({ id: query.id, sql: query.sql, tables, problems, ok: problems.length === 0 });
    }
  } finally {
    await connection.end();
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)}\n`);
  } else {
    for (const result of results) {
      const plan = result.tables
        .map((table) => `${table.table}[${table.accessType ?? '?'} key=${table.key ?? 'none'} rows=${table.rowsExamined}]`)
        .join(' → ');
      process.stdout.write(`${result.ok ? 'PASS' : 'FAIL'}  ${result.id.padEnd(24)} ${plan}\n`);
      for (const problem of result.problems) process.stdout.write(`      ${problem}\n`);
    }
    process.stdout.write(`\n${results.length - scans}/${results.length} plans inside budget\n`);
  }

  if (options['fail-on-scan'] && scans > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`query-plan drill failed: ${error.message}\n`);
  process.exitCode = 1;
});
