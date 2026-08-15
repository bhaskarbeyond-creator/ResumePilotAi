const test = require('node:test');
const assert = require('node:assert/strict');
const { createExportRenderToken, consumeExportRenderToken, discardExportRenderToken } = require('../security/exportTokens');

function fakeDb() {
  const documents = new Map();
  const reference = path => ({ path, async create(value) { if (documents.has(path)) throw new Error('exists'); documents.set(path, value); }, async delete() { documents.delete(path); } });
  return {
    documents,
    collection: name => ({ doc: id => reference(`${name}/${id}`) }),
    runTransaction: callback => callback({
      async get(ref) { return { exists: documents.has(ref.path), data: () => documents.get(ref.path) }; },
      delete(ref) { documents.delete(ref.path); },
    }),
  };
}

test('private export render tokens are opaque, durable, one-time, expiring, and contain no URL data', async () => {
  const db = fakeDb();
  const data = { firstname: 'Asha', email: 'private@example.com', template: 'Cv1' };
  const token = await createExportRenderToken(db, data, { now: 1000, ttlMs: 500 });
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(token, /Asha|private|Cv1/);
  assert.equal([...db.documents.keys()][0].startsWith('export_render_tokens/'), true);
  assert.deepEqual(await consumeExportRenderToken(db, token, { now: 1200 }), data);
  assert.equal(await consumeExportRenderToken(db, token, { now: 1201 }), null);
});

test('expired, malformed, and explicitly discarded render tokens fail closed', async () => {
  const db = fakeDb();
  const expired = await createExportRenderToken(db, { secret: true }, { now: 1000, ttlMs: 10 });
  assert.equal(await consumeExportRenderToken(db, expired, { now: 1011 }), null);
  assert.equal(await consumeExportRenderToken(db, '../metadata'), null);
  const discarded = await createExportRenderToken(db, { secret: true });
  await discardExportRenderToken(db, discarded);
  assert.equal(await consumeExportRenderToken(db, discarded), null);
});
