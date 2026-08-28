'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ENTITIES, getOwnership } = require('../database/ownership');

function migratedTables() {
  const directory = path.join(__dirname, '..', 'database', 'migrations');
  const names = new Set();
  for (const file of fs.readdirSync(directory).filter(name => /^\d{3,}_[a-z0-9_]+\.sql$/.test(name))) {
    const sql = fs.readFileSync(path.join(directory, file), 'utf8');
    for (const match of sql.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+`?([A-Za-z0-9_]+)/gi)) {
      names.add(match[1]);
    }
  }
  return names;
}

test('every migrated application table has exactly one declared MariaDB domain owner', () => {
  const tables = migratedTables();
  assert.ok(tables.size >= 55, `expected the full schema, found ${tables.size} tables`);

  const missing = [];
  for (const table of tables) {
    try {
      const ownership = getOwnership(table);
      assert.equal(ownership.owner, 'MARIADB', table);
      assert.equal(ownership.table, table, table);
      assert.equal(ownership.writeMode, 'SINGLE_OWNER', table);
      assert.equal(ownership.replication, 'NONE', table);
    } catch (error) {
      missing.push(`${table}: ${error.message}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('ownership declarations do not point at nonexistent or renamed tables', () => {
  const tables = migratedTables();
  tables.add('schema_migrations');
  tables.add('schema_migration_attempts');
  const invalid = Object.values(ENTITIES)
    .filter(entry => entry.table && !tables.has(entry.table))
    .map(entry => `${entry.entity}:${entry.table}`);
  assert.deepEqual(invalid, []);
});

test('non-MariaDB owners are limited to identity and immutable code policy', () => {
  const external = Object.values(ENTITIES).filter(entry => entry.owner !== 'MARIADB');
  assert.deepEqual(external.map(entry => [entry.entity, entry.owner]), [
    ['identity', 'FIREBASE_AUTH'],
    ['permission', 'CODE'],
  ]);
});
