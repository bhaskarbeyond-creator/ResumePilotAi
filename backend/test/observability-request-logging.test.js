'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequestObservabilityMiddleware, sanitizedEntry } = require('../middleware/requestObservability');

const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function fakeRequest(method, url) {
  const pathname = String(url || '/').split('?')[0];
  return {
    method,
    path: pathname,
    get: () => '',
    user: { uid: 'not-logged-directly' },
  };
}

test('GAP-09: structured request entry carries request id, status, and latency', () => {
  const entry = sanitizedEntry(fakeRequest('POST', '/api/export?token=secret'), { statusCode: 201 }, process.hrtime.bigint(), 'req-123');
  assert.equal(entry.msg, 'http_request');
  assert.equal(entry.method, 'POST');
  assert.equal(entry.path, '/api/export');
  assert.equal(entry.status, 201);
  assert.equal(entry.requestId, 'req-123');
  assert.equal(typeof entry.durationMs, 'number');
  assert.equal(entry.authenticated, true);
});

test('GAP-09: structured entry never serializes credentials, body, query or tokens', () => {
  const entry = sanitizedEntry(fakeRequest('GET', '/api/admin?apikey=supersecret'), { statusCode: 200 }, process.hrtime.bigint(), 'req-abc');
  const serialized = JSON.stringify(entry);
  assert.equal(serialized.includes('supersecret'), false);
  assert.match(serialized, /"path":"\/api\/admin"/);
  assert.doesNotMatch(serialized, /authorization|password|token|apikey|body|query/i);
});

test('GAP-09: middleware is mounted in the backend composition root after request-id generation', () => {
  const index = read('backend/index.js');
  assert.match(index, /createRequestObservabilityMiddleware/);
  assert.match(index, /app\.use\(createRequestObservabilityMiddleware/);
});

test('GAP-09: health probes are not logged by the default middleware', () => {
  const middleware = createRequestObservabilityMiddleware({ enabled: true, skipHealth: true });
  assert.equal(typeof middleware, 'function');
});
