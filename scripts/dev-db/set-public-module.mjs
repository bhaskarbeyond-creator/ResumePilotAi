#!/usr/bin/env node
/**
 * TEST-ENVIRONMENT CONFIGURATION ONLY. Turns one public_config module flag on or
 * off in a local sandbox or test database, the same `system_settings` row the
 * admin settings screen writes. The candidate E2E suite uses it to exercise both
 * real server states of a module gate (e.g. 403 PORTFOLIO_MODULE_DISABLED, and
 * the enabled module) without any test-only code path in the backend.
 *
 *   node scripts/dev-db/set-public-module.mjs --module enablePortfolioModule --value true
 *   node scripts/dev-db/set-public-module.mjs --module enablePortfolioModule --get
 *
 * Connection: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (as for the backend;
 * see scripts/dev-db/README.md). It refuses to run unless the host is loopback and
 * the database name contains "sandbox", "test" or "acceptance". It changes only
 * the one requested key and does not write an admin audit record, so it must never
 * be pointed at a real deployment.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const backendRequire = createRequire(path.join(repoRoot, 'backend', 'package.json'));
const mysql = backendRequire('mysql2/promise');

const ALLOWED_MODULES = new Set(['enablePortfolioModule', 'enableMessagesModule', 'enableJobTrackerModule']);
const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
};

const moduleKey = arg('module');
const get = process.argv.includes('--get');
const rawValue = arg('value');
if (!ALLOWED_MODULES.has(moduleKey) || (!get && !['true', 'false'].includes(rawValue))) {
  console.error(`usage: --module <${[...ALLOWED_MODULES].join('|')}> (--value true|false | --get)`);
  process.exit(2);
}

const host = process.env.DB_HOST || '127.0.0.1';
const database = process.env.DB_NAME || '';
if (!['127.0.0.1', 'localhost', '::1'].includes(host) || !/(sandbox|test|acceptance)/i.test(database)) {
  console.error(`refusing: host "${host}" / database "${database}" is not a local sandbox or test database`);
  process.exit(3);
}

const connection = await mysql.createConnection({
  host,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database,
});
try {
  const [rows] = await connection.query("SELECT data FROM system_settings WHERE category = 'public_config' LIMIT 1");
  if (!rows.length) throw new Error('public_config is not seeded in this database (run the backend once so migrations apply)');
  const config = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  const before = config?.modules?.[moduleKey];
  if (get) {
    console.log(JSON.stringify({ database, module: moduleKey, value: before ?? null }));
  } else {
    const value = rawValue === 'true';
    config.modules = { ...(config.modules || {}), [moduleKey]: value };
    await connection.query("UPDATE system_settings SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE category = 'public_config'", [JSON.stringify(config)]);
    console.log(JSON.stringify({ database, module: moduleKey, before: before ?? null, after: value }));
  }
} finally {
  await connection.end();
}
