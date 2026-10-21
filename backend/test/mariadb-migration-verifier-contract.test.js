'use strict';

/**
 * Contract guard for `scripts/verify-mariadb-migrations.mjs`.
 *
 * The verifier is the only gate that proves the checked-in migration chain
 * applies, rolls back, and fails closed. It runs only in CI against a real
 * MariaDB 11.4 container, so a stale expectation inside it can go unnoticed
 * locally and fail every run on every branch.
 *
 * That is exactly what happened: the verifier hard-coded "the chain must reach
 * version 017" while the repository had already grown to 026, so the quality
 * gate failed on `main` for every commit. These assertions keep the check
 * self-maintaining and prove the chain it inspects is contiguous.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { discoverMigrations } = require('../database/migrationRunner');

const SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'verify-mariadb-migrations.mjs');
const SCRIPT = fs.readFileSync(SCRIPT_PATH, 'utf8');

test('the verifier derives the expected head from the migration directory', () => {
  assert.match(
    SCRIPT,
    /const headVersion = discovered\[discovered\.length - 1\]\.version;/,
    'the verifier must read the head version from discoverMigrations()'
  );
  assert.match(SCRIPT, /const discovered = discoverMigrations\(\);/, 'the verifier must discover migrations from source');
  assert.match(SCRIPT, /const skipped = discovered\.filter/, 'the verifier must prove every discovered migration applied');
});

test('the verifier never hard-codes a migration version as the expected head', () => {
  assert.doesNotMatch(
    SCRIPT,
    /latestMigrationVersion\s*!==\s*'\d+'/,
    'a hard-coded head comparison goes stale the moment a migration is added'
  );
  assert.doesNotMatch(
    SCRIPT,
    /did not reach version \d+/, 
    'the failure message must report the discovered head, not a literal version'
  );
});

test('the migration chain is contiguous so "head" is meaningful', () => {
  const migrations = discoverMigrations();
  assert.ok(migrations.length > 0, 'at least one migration must exist');
  const versions = migrations.map(migration => Number(migration.version));
  assert.ok(versions.every((value, index) => Number.isInteger(value) && (index === 0 || value === versions[index - 1] + 1)),
    `migration versions must be contiguous from ${migrations[0].version}, received ${migrations.map(m => m.version).join(',')}`);
  assert.equal(migrations[0].version, '001', 'the chain must start at the baseline migration');
});
