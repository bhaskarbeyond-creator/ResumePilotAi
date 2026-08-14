const test = require('node:test');
const assert = require('node:assert/strict');
const { createExportRenderToken, consumeExportRenderToken, discardExportRenderToken, _tokens } = require('../security/exportTokens');

test('private export render tokens are opaque, one-time, expiring, and contain no data in the URL token', () => {
  _tokens.clear();
  const data = { firstname: 'Asha', email: 'private@example.com', template: 'Cv1' };
  const token = createExportRenderToken(data, { now: 1000, ttlMs: 500 });
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(token, /Asha|private|Cv1/);
  assert.deepEqual(consumeExportRenderToken(token, { now: 1200 }), data);
  assert.equal(consumeExportRenderToken(token, { now: 1201 }), null);
});

test('expired, malformed, and explicitly discarded render tokens fail closed', () => {
  _tokens.clear();
  const expired = createExportRenderToken({ secret: true }, { now: 1000, ttlMs: 10 });
  assert.equal(consumeExportRenderToken(expired, { now: 1011 }), null);
  assert.equal(consumeExportRenderToken('../metadata'), null);
  const discarded = createExportRenderToken({ secret: true });
  discardExportRenderToken(discarded);
  assert.equal(consumeExportRenderToken(discarded), null);
});
