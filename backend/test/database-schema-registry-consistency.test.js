'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ENTITIES, ALIASES, getOwnership } = require('../database/ownership');

function discoverMigrationTables() {
  const directory = path.join(__dirname, '..', 'database', 'migrations');
  const tableToMigration = new Map();
  const files = fs.readdirSync(directory).filter(f => /^\d{3,}_[a-z0-9_]+\.sql$/.test(f) && !f.endsWith('.down.sql'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(directory, file), 'utf8');
    for (const match of content.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+`?([A-Za-z0-9_]+)/gi)) {
      const tableName = match[1].toLowerCase();
      if (!tableToMigration.has(tableName)) {
        tableToMigration.set(tableName, file);
      }
    }
  }
  return tableToMigration;
}

test('Schema Registry Consistency: Every table created in migrations has a registered ownership entity', () => {
  const tableToMigration = discoverMigrationTables();
  assert.ok(tableToMigration.size >= 55, `Expected full migration schema, found ${tableToMigration.size} tables`);

  const unmapped = [];
  for (const [table, migration] of tableToMigration.entries()) {
    try {
      const ownership = getOwnership(table);
      assert.ok(ownership, `Ownership object must exist for table ${table}`);
      assert.equal(ownership.owner, 'MARIADB', `Table ${table} in ${migration} must be owned by MARIADB`);
      assert.equal(ownership.table, table, `Table ${table} in ${migration} must match declared table`);
    } catch (err) {
      unmapped.push({ table, migration, error: err.message });
    }
  }

  assert.deepEqual(unmapped, [], `Found unmapped tables from migrations: ${JSON.stringify(unmapped, null, 2)}`);
});

test('Schema Registry Consistency: Every ALIAS resolves to a valid ENTITIES key', () => {
  const invalidAliases = [];
  for (const [alias, targetKey] of Object.entries(ALIASES)) {
    if (!ENTITIES[targetKey]) {
      invalidAliases.push({ alias, targetKey });
    }
  }
  assert.deepEqual(invalidAliases, [], `Aliases pointing to nonexistent entities: ${JSON.stringify(invalidAliases)}`);
});

test('Schema Registry Consistency: Invariant properties on all registered MariaDB entities', () => {
  const violations = [];
  for (const [key, entity] of Object.entries(ENTITIES)) {
    if (entity.owner === 'MARIADB') {
      if (!entity.table) {
        violations.push({ key, error: 'MARIADB owner must define a non-null table' });
      }
      if (!['SINGLE_OWNER', 'APPEND_ONLY'].includes(entity.writeMode)) {
        violations.push({ key, writeMode: entity.writeMode, error: 'Unexpected writeMode' });
      }
      if (entity.replication !== 'NONE') {
        violations.push({ key, replication: entity.replication, error: 'Expected replication NONE' });
      }
    }
  }
  assert.deepEqual(violations, [], `Entity invariant violations: ${JSON.stringify(violations)}`);
});
