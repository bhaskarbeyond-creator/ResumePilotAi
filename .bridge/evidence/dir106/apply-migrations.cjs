'use strict';
// DIR-106: apply pending schema migrations (non-production mode) and report status.
// Paths are resolved from the repository root so this script works from anywhere.
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const { getPool } = require(path.join(ROOT, 'backend/database/mysql'));
const { runMigrations, migrationStatus } = require(path.join(ROOT, 'backend/database/migrationRunner'));

(async () => {
  const pool = getPool();
  const before = await migrationStatus(pool);
  console.log('pending before:', before.pending.map(m => m.version).join(', ') || '(none)');

  const result = await runMigrations(pool, { mode: 'apply' });
  console.log('mode:', result.mode);
  console.log('applied:', result.applied.map(m => `${m.version}_${m.name} (${m.executionMs}ms)`).join(', ') || '(none)');
  console.log('pending after:', result.pending.map(m => m.version).join(', ') || '(none)');
  console.log('current:', result.current);
  process.exit(result.current ? 0 : 1);
})().catch(error => {
  console.error('MIGRATION FAILED:', error.code || '', error.message, error.migration || '');
  process.exit(1);
});
