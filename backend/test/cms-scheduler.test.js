'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../index');

function _createFakeDb(records) {
  const audits = [];
  const notifications = [];
  const docs = new Map(Object.entries(records).map(([id, data]) => [id, {
    id,
    ref: { id },
    exists: true,
    data: () => data,
  }]));
  for (const document of docs.values()) document.ref._document = document;
  return {
    audits,
    notifications,
    documents: docs,
    collection(name) {
      if (name === 'security_audit_logs') return { doc: () => ({ audit: true }) };
      if (name === 'notifications') return { doc: uid => ({ collection: () => ({ doc: id => ({ notification: true, uid, id }) }) }) };
      const query = {
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        get: async () => ({ docs: [...docs.values()].filter(doc => doc.data().status === 'scheduled') }),
      };
      return query;
    },
    async runTransaction(callback) {
      return callback({
        get: async ref => ref._document,
        update(ref, changes) { Object.assign(ref._document.data(), changes); },
        set(ref, value) { (ref.audit ? audits : notifications).push(value); },
      });
    },
  };
}

test('trusted CMS scheduler atomically publishes only due scheduled revisions and is idempotent', async () => {
  // The scheduler is repository-mediated: it reads and writes the MySQL blog
  // table (blog status='scheduled' → 'approved'), with MySQL transactions.
  const { getPool } = require('../database/mysql');
  const pool = getPool();
  const now = Date.now();
  await pool.query("DELETE FROM blog WHERE id IN ('due','future','notdue')");
  await pool.query("INSERT INTO blog (id, title, slug, status, scheduled_at, revision) VALUES ('due','Due Post','due-post','scheduled', FROM_UNIXTIME(?), 2)", [Math.floor((now - 60_000) / 1000)]);
  await pool.query("INSERT INTO blog (id, title, slug, status, scheduled_at, revision) VALUES ('future','Future Post','future-post','scheduled', FROM_UNIXTIME(?), 4)", [Math.floor((now + 3_600_000) / 1000)]);
  await pool.query("INSERT INTO blog (id, title, slug, status, scheduled_at, revision) VALUES ('notdue','Draft Post','notdue-post','draft', NULL, 1)");

  const firstCount = await app.publishDueBlogPosts(null, { actorUid: 'scheduler-test', requestId: 'request-1' });
  assert.equal(firstCount, 1);
  const [dueRows] = await pool.query("SELECT status, revision, scheduled_at FROM blog WHERE id = 'due'");
  assert.equal(dueRows[0].status, 'approved');
  assert.equal(Number(dueRows[0].revision), 3);
  assert.equal(dueRows[0].scheduled_at, null);
  const [futureRows] = await pool.query("SELECT status FROM blog WHERE id = 'future'");
  assert.equal(futureRows[0].status, 'scheduled');
  const [notdueRows] = await pool.query("SELECT status FROM blog WHERE id = 'notdue'");
  assert.equal(notdueRows[0].status, 'draft');

  // Idempotency: a second run publishes nothing new.
  const secondCount = await app.publishDueBlogPosts(null, { actorUid: 'scheduler-test', requestId: 'request-2' });
  assert.equal(secondCount, 0);
  const [dueRows2] = await pool.query("SELECT revision FROM blog WHERE id = 'due'");
  assert.equal(Number(dueRows2[0].revision), 3);
});
