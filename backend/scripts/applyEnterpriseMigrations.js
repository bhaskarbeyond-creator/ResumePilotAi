'use strict';

/**
 * Explicit, operator-invoked migration runner. It is never imported by the API.
 * Requires TENANT_DATABASE_URL and a migration-role credential supplied by the
 * deployment secret manager. Role bootstrap remains DBA-only.
 */
const { Client } = require('pg');
const { tenantDatabaseUrl } = require('../enterprise/tenantDataPlane');
const { applyMigrations, migrationNames } = require('../enterprise/sqlMigrations');

async function main() {
  const connectionString = tenantDatabaseUrl(process.env);
  const client = new Client({ connectionString, application_name: 'resumepilot-enterprise-migrator' });
  await client.connect();
  try {
    await client.query('BEGIN');
    await applyMigrations(client, migrationNames);
    for (const name of migrationNames) console.info(`[enterprise migration] applied ${name}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('[enterprise migration] failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, migrationNames };
