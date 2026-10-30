'use strict';

/**
 * Executes the complete verified test suite (unit contracts, cryptographic SP,
 * SSRF guards, Mandate 12 MariaDB persistence, and Mandate 14 SAML MariaDB persistence).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

process.env.NODE_ENV = 'test';
process.env.RUN_MARIADB_INTEGRATION = 'true';
process.env.MARIADB_TEST_ALLOW_RESET = 'true';
process.env.SESSION_REVOCATION_IN_TEST = 'true';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '3306';
process.env.DB_USER = process.env.DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
process.env.DB_NAME = process.env.DB_NAME || 'airesume_test';

const repoRoot = path.resolve(__dirname, '../..');
const unitDir = path.join(repoRoot, 'developer-implemented/TESTS/unit');

const unitFiles = fs.readdirSync(unitDir)
  .filter(f => f.endsWith('.test.mjs'))
  .map(f => path.join(unitDir, f));

const explicitFiles = [
  path.join(repoRoot, 'backend/test/saml-sp.test.js'),
  path.join(repoRoot, 'backend/test/saml-metadata-fetch.test.js'),
  path.join(repoRoot, 'backend/test/mandate12-database-integration.test.js'),
  path.join(repoRoot, 'backend/test/mandate14-saml-database-integration.test.js'),
  path.join(repoRoot, 'backend/test/voice-interview-integration.test.js'),
  path.join(repoRoot, 'backend/test/storage-telemetry.test.js'),
  path.join(repoRoot, 'backend/test/tenant-branding-integration.test.js'),
  path.join(repoRoot, 'backend/test/tenant-custom-domains-integration.test.js'),
  path.join(repoRoot, 'backend/test/interview-scorecard-notification-integration.test.js'),
];

const allFiles = [...unitFiles, ...explicitFiles];

console.log(`Executing ${allFiles.length} test files with live MariaDB integration (${process.env.DB_NAME})...`);

const result = spawnSync(process.execPath, ['--test', '--test-force-exit', ...allFiles], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status || 0);
