'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadNotifier(pool) {
  const mysqlPath = require.resolve('../database/mysql');
  const notifierPath = require.resolve('../services/emailNotifier');
  const original = require.cache[mysqlPath];
  delete require.cache[notifierPath];
  require.cache[mysqlPath] = { id: mysqlPath, filename: mysqlPath, loaded: true, exports: { getPool: () => pool }, children: [], paths: [] };
  const notifier = require('../services/emailNotifier');
  return {
    notifier,
    restore() {
      delete require.cache[notifierPath];
      if (original) require.cache[mysqlPath] = original; else delete require.cache[mysqlPath];
    },
  };
}

function poolHarness({ fail = false } = {}) {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async query(sql, params) {
      calls.push({ sql, params });
      if (fail) throw new Error('queue unavailable');
      return [{ affectedRows: 1 }, []];
    },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
  };
  return { calls, pool: { getConnection: async () => connection } };
}

test('internal notifier durably queues and never claims provider delivery', async () => {
  const harness = poolHarness();
  const loaded = loadNotifier(harness.pool);
  try {
    const result = await loaded.notifier.notifyPasswordChanged({ userEmail: 'user@example.com', userName: 'User' });
    assert.equal(result.success, true);
    assert.equal(result.deliveryState, 'NOTIFICATION_QUEUED');
    assert.equal(result.providerAccepted, false);
    assert.match(result.notificationId, /^[a-f0-9]{64}$/);
    const insert = harness.calls.find(call => call?.sql && /INSERT INTO notification_outbox/.test(call.sql));
    assert.ok(insert);
    assert.equal(insert.params[2], 'user@example.com');
    assert.equal(insert.params[3], 'password_changed_confirm');
  } finally { loaded.restore(); }
});

test('notification enqueue failure is surfaced instead of falling back to synchronous SMTP', async () => {
  const loaded = loadNotifier(poolHarness({ fail: true }).pool);
  try {
    await assert.rejects(
      () => loaded.notifier.notifyPasswordChanged({ userEmail: 'user@example.com', userName: 'User' }),
      /queue unavailable/
    );
    const source = fs.readFileSync(require.resolve('../services/emailNotifier'), 'utf8');
    assert.match(source, /queueEmail\(getPool\(\)/);
    assert.doesNotMatch(source, /dispatchNotification|\.sendMail\s*\(|\.sendEmail\s*\(/);
  } finally { loaded.restore(); }
});
