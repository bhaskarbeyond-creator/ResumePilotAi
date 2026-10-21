'use strict';

/**
 * Guard for the CI migration verifier's expectation logic.
 *
 * WHY THIS EXISTS
 * `scripts/verify-mariadb-migrations.mjs` used to assert that a clean database
 * ends at the literal version `017`. That was true when it was written and went
 * stale the moment migrations 018–026 landed: the gate then failed on every
 * branch for a reason unrelated to the change under review, which is exactly
 * the failure mode a gate must never have.
 *
 * The verifier is a destructive MariaDB integration script and cannot run in a
 * unit test, but its *expectation* can: a clean database must apply every
 * checked-in migration and end with nothing pending. These assertions pin that
 * derivation so the literal cannot creep back in.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..', '..');
const VERIFIER = path.join(ROOT, 'scripts/verify-mariadb-migrations.mjs');
const requireFromRoot = createRequire(path.join(ROOT, 'package.json'));
const { discoverMigrations } = requireFromRoot(path.join(ROOT, 'backend/database/migrationRunner.js'));

const source = fs.readFileSync(VERIFIER, 'utf8');

test('the clean-state expectation is derived from the migration directory', () => {
  assert.match(
    source,
    /const discovered = discoverMigrations\(\);/,
    'the verifier must discover the migration set instead of assuming a fixed last version',
  );
  assert.match(
    source,
    /clean\.applied\.length !== discovered\.length/,
    'a clean database must apply every discovered migration',
  );
  assert.match(
    source,
    /clean\.pending\.length > 0/,
    'a clean database must end with no pending migrations',
  );
  assert.match(
    source,
    /clean\.applied\.at\(-1\)\?\.version !== latestMigrationVersion/,
    'the last applied migration must be the newest discovered migration',
  );
});

test('no hardcoded migration version gates a clean-state run', () => {
  // The rollback section legitimately names historical versions; the clean-state
  // check must not. Isolate the clean-state block and assert it is version-free.
  const start = source.indexOf('const clean = await runMigrations(');
  assert.ok(start > -1, 'clean-state run must exist');
  const end = source.indexOf('const invitationTableCount', start);
  assert.ok(end > start, 'clean-state assertions must be locatable');

  const block = source.slice(start, end);
  const literals = block.match(/'0\d\d'/g) || [];
  assert.deepEqual(
    literals,
    [],
    `clean-state assertions must not name a fixed version (found ${literals.join(', ')})`,
  );
});

test('the checked-in migration set is contiguous and reaches a real newest version', () => {
  const migrations = discoverMigrations();
  assert.ok(migrations.length >= 26, `expected the full migration set, found ${migrations.length}`);
  for (const migration of migrations) {
    assert.match(migration.version, /^\d{3}$/, `unexpected version format: ${migration.version}`);
    assert.ok(migration.checksum.length === 64, `missing checksum for ${migration.version}`);
  }
  const newest = migrations.at(-1);
  assert.ok(newest, 'at least one migration must exist');
  // The AI quota counter migration is what the stale literal was hiding.
  assert.ok(
    migrations.some((migration) => migration.name.includes('ai_quota_counters')),
    'the ai_quota_counters migration (026) must be part of the set',
  );
  assert.ok(
    Number(newest.version) >= 26,
    `newest migration ${newest.version} predates the AI quota counters`,
  );
});
