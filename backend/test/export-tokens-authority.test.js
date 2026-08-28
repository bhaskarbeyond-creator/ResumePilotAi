'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function loadExportTokens(pool) {
  const mysqlPath = require.resolve('../database/mysql');
  const tokenPath = require.resolve('../security/exportTokens');
  const original = require.cache[mysqlPath];
  delete require.cache[tokenPath];
  require.cache[mysqlPath] = { id: mysqlPath, filename: mysqlPath, loaded: true, exports: { getPool: () => pool }, children: [], paths: [] };
  const api = require('../security/exportTokens');
  return {
    api,
    restore() {
      delete require.cache[tokenPath];
      if (original) require.cache[mysqlPath] = original; else delete require.cache[mysqlPath];
    },
  };
}

async function withKey(run) {
  const previous = process.env.ENTERPRISE_ENCRYPTION_KEY;
  process.env.ENTERPRISE_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  try { return await run(); }
  finally {
    if (previous === undefined) delete process.env.ENTERPRISE_ENCRYPTION_KEY;
    else process.env.ENTERPRISE_ENCRYPTION_KEY = previous;
  }
}

test('export bearer creation has no memory fallback and persists only an encrypted payload', async () => withKey(async () => {
  let inserted;
  const pool = { query: async (sql, params) => { assert.match(sql, /INSERT INTO export_render_tokens/); inserted = params; return [{ affectedRows: 1 }, []]; } };
  const loaded = loadExportTokens(pool);
  try {
    const token = await loaded.api.createExportRenderToken({ firstname: 'Asha', email: 'private@example.com' }, { now: 1_000, ttlMs: 5_000 });
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(inserted[0], loaded.api.hash(token));
    assert.doesNotMatch(inserted[1], /Asha|private@example/);
    assert.equal(JSON.parse(inserted[1]).__enterpriseEncrypted, true);
    assert.equal(inserted[2], 6_000);
  } finally { loaded.restore(); }
}));

test('export bearer redemption locks and deletes MariaDB row before returning decrypted PII', async () => withKey(async () => {
  let stored;
  const creationPool = { query: async (_sql, params) => { stored = params; return [{ affectedRows: 1 }, []]; } };
  let loaded = loadExportTokens(creationPool);
  const token = await loaded.api.createExportRenderToken({ firstname: 'Asha', template: 'Cv1' }, { now: 1_000, ttlMs: 5_000 });
  loaded.restore();

  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async query(sql) {
      calls.push(sql);
      if (/SELECT payload/.test(sql)) return [[{ payload: stored[1], expires_at: stored[2] }], []];
      if (/DELETE FROM export_render_tokens/.test(sql)) return [{ affectedRows: 1 }, []];
      throw new Error(`unexpected query ${sql}`);
    },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
  };
  loaded = loadExportTokens({ getConnection: async () => connection });
  try {
    assert.deepEqual(await loaded.api.consumeExportRenderToken(token, { now: 2_000 }), { firstname: 'Asha', template: 'Cv1' });
    assert.ok(calls.findIndex(item => String(item).startsWith('DELETE')) < calls.indexOf('commit'));
  } finally { loaded.restore(); }
}));

test('authoritative export-token store outages fail closed for create, consume and discard', async () => withKey(async () => {
  const storeError = Object.assign(new Error('database offline'), { code: 'ECONNREFUSED' });
  let loaded = loadExportTokens({
    query: async () => { throw storeError; },
    getConnection: async () => { throw storeError; },
  });
  try {
    await assert.rejects(() => loaded.api.createExportRenderToken({ x: 1 }), error => error?.code === 'EXPORT_TOKEN_STORE_UNAVAILABLE');
    const syntacticallyValidToken = crypto.randomBytes(32).toString('base64url');
    await assert.rejects(() => loaded.api.consumeExportRenderToken(syntacticallyValidToken), /database offline/);
    await assert.rejects(() => loaded.api.discardExportRenderToken(syntacticallyValidToken), /database offline/);
  } finally { loaded.restore(); }
}));
