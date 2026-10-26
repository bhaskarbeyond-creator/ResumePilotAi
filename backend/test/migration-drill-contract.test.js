'use strict';

/**
 * The migration drill has to be safe to run and correct at splitting SQL — otherwise the
 * dynamic evidence it produces means nothing.
 *
 * `scripts/migration-drill.mjs` applies every migration forwards and backwards against a real
 * database. Two things about it are testable without one, and both have a failure mode that
 * would be invisible until the drill ran in an environment where the damage had already
 * happened:
 *
 *   1. **The disposable-database guard.** The drill drops tables. If the guard were wrong, a
 *      `DB_NAME=resumes` typo would run a rollback against production.
 *   2. **The statement splitter.** It must handle comments, `DELIMITER $$` blocks (triggers,
 *      procedures) and trailing semicolons; a splitter that emits a half statement would turn
 *      a valid migration into a syntax error blamed on the migration.
 *
 * The rest of the drill needs MariaDB and is exercised by `scripts/migration-drill.mjs` on a
 * disposable database (`DEPLOYMENT-RUNBOOK.md §5`).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'migration-drill.mjs');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations');

let helpers;

test.before(async () => {
  helpers = await import(pathToFileURL(SCRIPT).href);
});

test('migration drill: refuses a database that is not obviously disposable', () => {
  for (const name of ['resumes', 'resumepilot', 'production', '', undefined, 'airesume']) {
    assert.throws(() => helpers.assertDisposable(name), /refusing to run/, `should refuse "${name}"`);
  }
});

test('migration drill: accepts the suffixes CI and a drill database actually use', () => {
  for (const name of ['airesume_test', 'airesume_drill', 'resumes_ci', 'scratch_scratch']) {
    assert.doesNotThrow(() => helpers.assertDisposable(name), `should accept "${name}"`);
  }
});

test('migration drill: the splitter drops comments and blank lines', () => {
  const statements = helpers.splitStatements(`
-- a line comment
/* a block comment
   spanning lines */
CREATE TABLE a (id INT);
CREATE TABLE b (id INT);
`);
  assert.deepEqual(statements, ['CREATE TABLE a (id INT)', 'CREATE TABLE b (id INT)']);
});

test('migration drill: the splitter honours a DELIMITER block', () => {
  const statements = helpers.splitStatements(`
DELIMITER $$
CREATE TRIGGER t BEFORE INSERT ON a FOR EACH ROW
BEGIN
  SET NEW.id = 1;
END$$
DELIMITER ;
CREATE TABLE c (id INT);
`);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /^CREATE TRIGGER/);
  assert.match(statements[0], /END$/);
  assert.equal(statements[1], 'CREATE TABLE c (id INT)');
});

test('migration drill: every forward migration is either reversible or explicitly exempt', () => {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql') && !name.endsWith('.down.sql'));
  const exemptSource = fs.readFileSync(SCRIPT, 'utf8');
  const missing = files.filter((file) => {
    if (fs.existsSync(path.join(MIGRATIONS_DIR, file.replace(/\.sql$/, '.down.sql')))) return false;
    // The exemption must be declared in the drill itself, with a one-line reason.
    return !exemptSource.includes(`['${file}',`);
  });
  assert.deepEqual(missing, [], `migrations with no rollback and no declared exemption: ${missing.join(', ')}`);
});

test('migration drill: every migration file splits into at least one statement', () => {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql'));
  const empty = files.filter((file) => helpers.splitStatements(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')).length === 0);
  assert.deepEqual(empty, [], `files that produced no executable statement: ${empty.join(', ')}`);
});
