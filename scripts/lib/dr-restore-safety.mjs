#!/usr/bin/env node
/**
 * dr-restore-safety.mjs
 * ---------------------
 * Guard rails that make "restore into an isolated target" enforceable rather
 * than advisory.
 *
 * A restore drill is the single most valuable DR control and the single most
 * dangerous one: the same command that proves you can recover will destroy
 * production if pointed at it. These checks are therefore pure, exhaustive and
 * fail closed — anything not provably safe is refused.
 *
 * Nothing here connects to a database.
 */

'use strict';

/** Hosts considered local-only. A restore drill must never cross a network. */
export const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * Database names that may be destroyed. A name must advertise its own
 * disposability, so a typo cannot silently target `u727965524_airesume`.
 */
const DISPOSABLE_PATTERN = /(?:^|[_-])(?:test|ci|cert|certification|sandbox|scratch|restore|drill|drilltarget|tmp|temp)(?:[_-]|$|\d*$)/i;

/**
 * Databases that must never be restored into, matched exactly.
 *
 * An earlier revision instead rejected any name containing a production-ish
 * substring. That was wrong in a way that mattered: it refused
 * `resumepilot_restore_drill` - a disposable target whose only crime was
 * containing the product name, and the exact name this repository's own
 * documentation recommends. Blocking the genuinely dangerous names by exact
 * match, then requiring an explicit disposability marker, is both safer and
 * usable.
 */
export const DEFAULT_PRODUCTION_DATABASES = Object.freeze([
  'u727965524_airesume', // live production database, confirmed via /api/readyz
  'airesume',
  'ai_resume_builder',   // fallback default in backend/database/mysql.js
  'resumepilot',
]);

/** Production deny-list, extensible by operators via DR_PRODUCTION_DATABASES. */
export function productionDatabaseNames(env = process.env) {
  const configured = String(env?.DR_PRODUCTION_DATABASES || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_PRODUCTION_DATABASES, ...configured]);
}

export function isLoopbackHost(host) {
  const value = String(host ?? '').trim().toLowerCase();
  return LOOPBACK_HOSTS.includes(value);
}

/**
 * A database is disposable only if it is not a known production database AND
 * its name advertises disposability. Unnamed or ambiguous targets are refused.
 */
export function isDisposableDatabaseName(name, { productionNames = productionDatabaseNames() } = {}) {
  const value = String(name ?? '').trim();
  if (!value) return false;
  if (productionNames.has(value.toLowerCase())) return false;
  return DISPOSABLE_PATTERN.test(value);
}

/**
 * Throw unless every condition for a destructive restore into `target` holds.
 *
 * @param {object} target  { host, database, confirm, allowReset }
 * @throws {Error} with a specific, actionable reason
 * @returns {{host: string, database: string}} the validated target
 */
export function assertRestorableTarget(target = {}) {
  const { host, database, confirm, allowReset } = target;

  if (!database || !String(database).trim()) {
    throw new Error('Restore target database name is required');
  }
  const name = String(database).trim();

  if (!isLoopbackHost(host)) {
    throw new Error(
      `Restore drill refused: target host '${String(host)}' is not loopback. `
      + 'A restore drill must never run against a remote database.',
    );
  }

  if (!isDisposableDatabaseName(name, { productionNames: productionDatabaseNames() })) {
    throw new Error(
      `Restore drill refused: '${name}' is not an explicitly disposable database. `
      + 'The name must contain test/ci/cert/sandbox/scratch/restore/drill and must not look like production.',
    );
  }

  if (allowReset !== true) {
    throw new Error(
      'Restore drill refused: MARIADB_TEST_ALLOW_RESET=true is required to authorise dropping and recreating the target.',
    );
  }

  const expected = `RESTORE:${name}`;
  if (confirm !== expected) {
    throw new Error(
      `Restore drill refused: DB_RESTORE_CONFIRM must be exactly '${expected}' to authorise overwriting '${name}'.`,
    );
  }

  return { host, database: name };
}

/**
 * Evaluate a restore drill's reconciliation result.
 *
 * Fails when any critical table is missing or empty, when the migration ledger
 * is absent, or when the restored table count is lower than the backup's.
 * Growth in table count is a warning, not a failure: a newer schema legitimately
 * has more tables than an older backup, and the drill's job is to prove the
 * backup's contents survived.
 */
export function evaluateRestoreReconciliation({
  expectedTables = [],
  restoredTables = [],
  expectedMigrations = null,
  restoredMigrations = null,
  criticalTables = [],
  rowCounts = {},
} = {}) {
  const problems = [];
  const warnings = [];

  const expected = new Set((expectedTables || []).map(String));
  const restored = new Set((restoredTables || []).map(String));

  const missingTables = [...expected].filter((t) => !restored.has(t));
  if (missingTables.length) {
    problems.push(`missing ${missingTables.length} table(s) present in the backup: ${missingTables.slice(0, 10).join(', ')}`);
  }
  if (restored.size < expected.size) {
    problems.push(`restored ${restored.size} tables, backup contained ${expected.size}`);
  } else if (restored.size > expected.size) {
    warnings.push(`restored ${restored.size} tables vs ${expected.size} in the backup (target schema is newer)`);
  }

  if (Number.isFinite(Number(expectedMigrations)) && Number(expectedMigrations) > 0) {
    const restoredM = Number(restoredMigrations);
    if (!Number.isFinite(restoredM) || restoredM <= 0) {
      problems.push('migration ledger is empty after restore');
    } else if (restoredM < Number(expectedMigrations)) {
      problems.push(`restored ${restoredM} migrations, backup contained ${Number(expectedMigrations)}`);
    }
  }

  for (const table of criticalTables || []) {
    const count = Number(rowCounts?.[table]);
    if (!Number.isFinite(count) || count <= 0) {
      problems.push(`critical table '${table}' is missing or empty after restore`);
    }
  }

  return {
    status: problems.length === 0 ? 'PASS' : 'FAIL',
    problems,
    warnings,
    tablesRestored: restored.size,
    tablesExpected: expected.size,
  };
}
