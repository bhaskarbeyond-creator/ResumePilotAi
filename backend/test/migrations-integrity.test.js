'use strict';

/**
 * Migration integrity (tier "migration").
 *
 * ## Why this is a test and not a checklist
 *
 * A migration is the only change in this repository that can destroy data, and it is the
 * one change no test executed until now: `TEST-EVIDENCE.md` correctly recorded that the
 * migration tier did not exist. Without a database, what *can* be verified is the part
 * that has caused real outages elsewhere: a migration with no rollback, a rollback that
 * drops more than its migration created, and a statement that is not safe to re-run.
 *
 * Everything here is static analysis of the SQL. That is stated plainly rather than
 * implied, because "the migration tier exists" would otherwise over-claim.
 *
 * Run: NODE_ENV=test node --test test/migrations-integrity.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS = path.join(__dirname, '..', 'database', 'migrations');

/** @returns {string[]} forward migration filenames, ordered */
function forwardMigrations() {
  return fs.readdirSync(MIGRATIONS).filter(name => name.endsWith('.sql') && !name.endsWith('.down.sql')).sort();
}

/** @param {string} name */
function read(name) {
  return fs.readFileSync(path.join(MIGRATIONS, name), 'utf8');
}

test('every forward migration that creates or drops a table has a rollback', () => {
  const forwards = forwardMigrations();
  const downs = new Set(fs.readdirSync(MIGRATIONS).filter(name => name.endsWith('.down.sql')));
  const destructive = forwards.filter((name) => /CREATE TABLE|DROP TABLE|ALTER TABLE/i.test(read(name)));
  assert.ok(forwards.length >= 28, `expected the full history, found ${forwards.length}`);

  // `001_baseline.sql` is exempt and named rather than silently skipped: its inverse is
  // "drop the schema", which is a deployment operation (DEPLOYMENT-RUNBOOK §3 rollback
  // level 3), not something to ship as a script any operator can run by accident. Every
  // migration after the baseline must have its own rollback.
  const baseline = new Set(['001_baseline.sql']);
  const missing = destructive
    .filter((name) => !baseline.has(name))
    .filter((name) => !downs.has(name.replace(/\.sql$/, '.down.sql')));
  assert.deepStrictEqual(missing, [],
    'a schema change without a rollback cannot be reversed during an incident; add the .down.sql or justify it in the file header');
});

test('every rollback names only objects its forward migration created', () => {
  for (const name of forwardMigrations()) {
    const downPath = path.join(MIGRATIONS, name.replace(/\.sql$/, '.down.sql'));
    if (!fs.existsSync(downPath)) continue;
    const forward = read(name);
    const down = fs.readFileSync(downPath, 'utf8');
    const dropped = [...down.matchAll(/DROP TABLE IF EXISTS\s+([a-z0-9_]+)/gi)].map(match => match[1]);
    for (const table of dropped) {
      // `config_change_log` is the documented exception: the 029 rollback deliberately
      // keeps it, because it is the evidence of who changed what.
      if (name === '029_config_overrides.sql' && table === 'config_change_log') continue;
      assert.ok(
        new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i').test(forward),
        `${name}: rollback drops "${table}", which its forward migration did not create`,
      );
    }
  }
});

test('029 creates the override store and the change log with the columns the service writes', () => {
  const sql = read('029_config_overrides.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS config_overrides/i);
  for (const column of ['config_key', 'value', 'revision', 'updated_by', 'updated_by_email']) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `config_overrides is missing ${column}`);
  }
  assert.match(sql, /CREATE TABLE IF NOT EXISTS config_change_log/i);
  for (const column of ['value_before', 'value_after', 'revision_before', 'revision_after', 'actor_uid', 'actor_email', 'actor_role', 'reason', 'request_id']) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `config_change_log is missing ${column}: INV-6 needs before/after, actor, time and scope`);
  }
  assert.match(sql, /PRIMARY KEY/, 'config_overrides must be keyed by the configuration key');
});

test('the 029 rollback refuses to erase the evidence it is rolling back', () => {
  const down = read('029_config_overrides.down.sql');
  assert.match(down, /DROP TABLE IF EXISTS config_overrides/);
  const activeDrop = down.split('\n').filter(line => /DROP TABLE/i.test(line) && !line.trim().startsWith('--'));
  assert.deepStrictEqual(activeDrop.map(line => line.trim()), ['DROP TABLE IF EXISTS config_overrides;'],
    'a rollback that also dropped config_change_log would erase the reason for the rollback');
});

test('every migration is idempotent: no bare CREATE TABLE or CREATE INDEX', () => {
  for (const name of forwardMigrations()) {
    const sql = read(name);
    const bareTables = [...sql.matchAll(/CREATE TABLE(?! IF NOT EXISTS)/gi)];
    assert.strictEqual(bareTables.length, 0, `${name}: use CREATE TABLE IF NOT EXISTS so a re-run is safe`);
    const bareIndexes = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX(?! IF NOT EXISTS)/gi)];
    assert.strictEqual(bareIndexes.length, 0, `${name}: use CREATE INDEX IF NOT EXISTS so a re-run is safe`);
  }
});
