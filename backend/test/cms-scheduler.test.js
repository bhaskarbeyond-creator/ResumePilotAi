'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../index');

function createFakeDb(records) {
  const audits = [];
  const docs = new Map(Object.entries(records).map(([id, data]) => [id, {
    id,
    ref: { id },
    exists: true,
    data: () => data,
  }]));
  for (const document of docs.values()) document.ref._document = document;
  return {
    audits,
    documents: docs,
    collection(name) {
      if (name === 'security_audit_logs') return { doc: () => ({ audit: true }) };
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
        set(_ref, value) { audits.push(value); },
      });
    },
  };
}

test('trusted CMS scheduler atomically publishes only due scheduled revisions and is idempotent', async () => {
  const now = Date.now();
  const db = createFakeDb({
    due: { status: 'scheduled', scheduledAt: new Date(now - 60_000), revision: 2 },
    future: { status: 'scheduled', scheduledAt: new Date(now + 3_600_000), revision: 4 },
  });
  const firstCount = await app.publishDueBlogPosts(db, { actorUid: 'scheduler-test', requestId: 'request-1' });
  assert.equal(firstCount, 1);
  assert.equal(db.documents.get('due').data().status, 'approved');
  assert.equal(db.documents.get('due').data().revision, 3);
  assert.equal(db.documents.get('due').data().scheduledAt, null);
  assert.equal(db.documents.get('future').data().status, 'scheduled');
  assert.equal(db.audits.length, 1);
  assert.equal(db.audits[0].count, 1);

  const secondCount = await app.publishDueBlogPosts(db, { actorUid: 'scheduler-test', requestId: 'request-2' });
  assert.equal(secondCount, 0);
  assert.equal(db.audits.length, 1);
});
