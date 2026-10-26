'use strict';

/**
 * In-memory stand-in for the configuration store (`config_overrides` +
 * `config_change_log`), shared by the service and HTTP tests.
 *
 * It understands exactly the statements `services/configService.js` issues and throws
 * on anything else, so a new query cannot pass untested. `failNext` injects a store
 * failure — the degraded-read paths are behaviour the console depends on during an
 * incident, and untested degraded paths are how "it falls back safely" becomes folklore.
 *
 * @module test-support/inMemoryConfigStore
 */

/**
 * @param {Record<string, {value: unknown, revision?: number}>} [seed]
 */
function createInMemoryConfigStore(seed = {}) {
  const rows = new Map(Object.entries(seed).map(([key, row]) => [key, { value: row.value, revision: row.revision ?? 1 }]));
  const log = [];
  let failNextQuery = null;
  let committed = 0;
  let rolledBack = 0;

  /** @param {unknown} error */
  const maybeFail = () => {
    if (!failNextQuery) return;
    const error = failNextQuery;
    failNextQuery = null;
    throw error;
  };

  const connection = {
    async beginTransaction() {},
    async commit() { committed += 1; },
    async rollback() { rolledBack += 1; },
    release() {},
    async query(sql, params) {
      maybeFail();
      const text = String(sql).replace(/\s+/g, ' ').trim();
      if (text.startsWith('SELECT value, revision FROM config_overrides')) {
        const row = rows.get(params[0]);
        return [row ? [{ value: JSON.stringify(row.value), revision: row.revision }] : []];
      }
      if (text.startsWith('INSERT INTO config_overrides')) {
        rows.set(params[0], { value: JSON.parse(params[1]), revision: Number(params[2]) });
        return [{ affectedRows: 1 }];
      }
      if (text.startsWith('INSERT INTO config_change_log')) {
        log.push({
          id: params[0], key: params[1], scope: params[2],
          before: params[3] === 'null' ? null : JSON.parse(params[3]),
          after: JSON.parse(params[4]),
          revisionBefore: params[5], revisionAfter: params[6],
          actorUid: params[7], actorEmail: params[8], actorRole: params[9],
          reason: params[10], requestId: params[11],
        });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`inMemoryConfigStore: unrecognised connection statement: ${text.slice(0, 80)}`);
    },
  };

  const pool = {
    async query(sql, params) {
      maybeFail();
      const text = String(sql).replace(/\s+/g, ' ').trim();
      if (text.startsWith('SELECT config_key, value, revision FROM config_overrides')) {
        return [[...rows.entries()].map(([config_key, row]) => ({
          config_key, value: JSON.stringify(row.value), revision: row.revision,
        }))];
      }
      if (text.startsWith('SELECT id, config_key, scope, value_before')) {
        const key = params[0];
        return [log.filter(entry => entry.key === key).slice().reverse().map(entry => ({
          id: entry.id, config_key: entry.key, scope: entry.scope,
          value_before: entry.before === null ? null : JSON.stringify(entry.before),
          value_after: JSON.stringify(entry.after),
          revision_before: entry.revisionBefore, revision_after: entry.revisionAfter,
          actor_uid: entry.actorUid, actor_email: entry.actorEmail, actor_role: entry.actorRole,
          reason: entry.reason, created_at: '2026-01-01T00:00:00.000Z',
        }))];
      }
      throw new Error(`inMemoryConfigStore: unrecognised pool statement: ${text.slice(0, 80)}`);
    },
    getConnection: async () => connection,
  };

  return {
    pool, rows, log,
    get committed() { return committed; },
    get rolledBack() { return rolledBack; },
    /** @param {unknown} error */
    failNext(error) { failNextQuery = error; },
  };
}

module.exports = { createInMemoryConfigStore };
