'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function loadTokenStore(pool) {
  const mysqlPath = require.resolve('../database/mysql');
  const tokenPath = require.resolve('../database/authTokens');
  const originalMysql = require.cache[mysqlPath];
  delete require.cache[tokenPath];
  require.cache[mysqlPath] = {
    id: mysqlPath,
    filename: mysqlPath,
    loaded: true,
    exports: { getPool: () => pool },
    children: [],
    paths: [],
  };
  const store = require('../database/authTokens');
  return {
    store,
    restore() {
      delete require.cache[tokenPath];
      if (originalMysql) require.cache[mysqlPath] = originalMysql;
      else delete require.cache[mysqlPath];
    },
  };
}

function withEncryptionKey(run) {
  const prior = {
    key: process.env.ENTERPRISE_ENCRYPTION_KEY,
    version: process.env.ENTERPRISE_ENCRYPTION_KEY_VERSION,
    provider: process.env.ENTERPRISE_ENCRYPTION_PROVIDER,
  };
  process.env.ENTERPRISE_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.ENTERPRISE_ENCRYPTION_KEY_VERSION = 'v92';
  process.env.ENTERPRISE_ENCRYPTION_PROVIDER = 'server-key';
  return Promise.resolve().then(run).finally(() => {
    if (prior.key === undefined) delete process.env.ENTERPRISE_ENCRYPTION_KEY; else process.env.ENTERPRISE_ENCRYPTION_KEY = prior.key;
    if (prior.version === undefined) delete process.env.ENTERPRISE_ENCRYPTION_KEY_VERSION; else process.env.ENTERPRISE_ENCRYPTION_KEY_VERSION = prior.version;
    if (prior.provider === undefined) delete process.env.ENTERPRISE_ENCRYPTION_PROVIDER; else process.env.ENTERPRISE_ENCRYPTION_PROVIDER = prior.provider;
  });
}

function fakePool({ failOutbox = false } = {}) {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push({ type: 'begin' }); },
    async query(sql, params = []) {
      calls.push({ type: 'query', sql, params });
      if (failOutbox && /INSERT INTO notification_outbox/.test(sql)) throw new Error('simulated outbox failure');
      return [{ affectedRows: 1 }, []];
    },
    async commit() { calls.push({ type: 'commit' }); },
    async rollback() { calls.push({ type: 'rollback' }); },
    release() { calls.push({ type: 'release' }); },
  };
  return { calls, pool: { getConnection: async () => connection } };
}

test('password reset token and encrypted notification commit in one MariaDB transaction', async () => withEncryptionKey(async () => {
  const { calls, pool } = fakePool();
  const loaded = loadTokenStore(pool);
  try {
    const resetLink = 'https://example.test/login#mode=resetPassword&token=raw-reset-bearer';
    await loaded.store.createPasswordResetToken({
      tokenHash: 'a'.repeat(64), uid: 'user_1', email: 'user@example.com', expiresAt: Date.now() + 60_000,
      notification: { vars: { user_name: 'User', reset_link: resetLink } },
    });
    const tokenInsert = calls.findIndex(call => call.type === 'query' && /INSERT INTO password_reset_tokens/.test(call.sql));
    const outboxInsert = calls.findIndex(call => call.type === 'query' && /INSERT INTO notification_outbox/.test(call.sql));
    const commit = calls.findIndex(call => call.type === 'commit');
    assert.ok(tokenInsert > 0 && outboxInsert > tokenInsert && commit > outboxInsert);
    assert.equal(calls.some(call => call.type === 'rollback'), false);
    const persistedOutbox = calls[outboxInsert].params[4];
    assert.doesNotMatch(persistedOutbox, /raw-reset-bearer/);
    assert.equal(JSON.parse(persistedOutbox).__enterpriseEncrypted, true);
  } finally {
    loaded.restore();
  }
}));

test('email verification token rolls back when its notification cannot enqueue', async () => withEncryptionKey(async () => {
  const { calls, pool } = fakePool({ failOutbox: true });
  const loaded = loadTokenStore(pool);
  try {
    await assert.rejects(
      () => loaded.store.createEmailVerificationToken({
        tokenHash: 'b'.repeat(64), uid: 'user_2', email: 'user@example.com', expiresAt: Date.now() + 60_000,
        notification: { vars: { user_name: 'User', verification_link: 'https://example.test/secret' } },
      }),
      /simulated outbox failure/
    );
    assert.ok(calls.some(call => call.type === 'query' && /INSERT INTO email_verification_tokens/.test(call.sql)));
    assert.ok(calls.some(call => call.type === 'rollback'), 'business mutation must roll back with outbox failure');
    assert.equal(calls.some(call => call.type === 'commit'), false);
  } finally {
    loaded.restore();
  }
}));

test('sensitive token creation cannot commit when encryption is unavailable', async () => {
  const priorKey = process.env.ENTERPRISE_ENCRYPTION_KEY;
  const priorKeys = process.env.ENTERPRISE_ENCRYPTION_KEYS;
  delete process.env.ENTERPRISE_ENCRYPTION_KEY;
  delete process.env.ENTERPRISE_ENCRYPTION_KEYS;
  const { calls, pool } = fakePool();
  const loaded = loadTokenStore(pool);
  try {
    await assert.rejects(
      () => loaded.store.createPasswordResetToken({
        tokenHash: 'c'.repeat(64), uid: 'user_3', email: 'user@example.com', expiresAt: Date.now() + 60_000,
        notification: { vars: { reset_link: 'https://example.test/secret' } },
      }),
      error => error?.code === 'OUTBOX_ENCRYPTION_UNAVAILABLE'
    );
    assert.ok(calls.some(call => call.type === 'rollback'));
    assert.equal(calls.some(call => call.type === 'commit'), false);
  } finally {
    loaded.restore();
    if (priorKey === undefined) delete process.env.ENTERPRISE_ENCRYPTION_KEY; else process.env.ENTERPRISE_ENCRYPTION_KEY = priorKey;
    if (priorKeys === undefined) delete process.env.ENTERPRISE_ENCRYPTION_KEYS; else process.env.ENTERPRISE_ENCRYPTION_KEYS = priorKeys;
  }
});
