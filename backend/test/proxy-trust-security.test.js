'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const proxyaddr = require('proxy-addr');

test('GHSA-jqcg-44mw-7w3h: IPv4-mapped short IPv6 prefix must not trust arbitrary IPv4 clients', () => {
  const badPrefix = proxyaddr.compile('::ffff:10.0.0.0/8');
  assert.equal(badPrefix('203.0.113.9'), false);
  const properMapped = proxyaddr.compile('::ffff:10.0.0.0/104');
  assert.equal(properMapped('10.1.2.3'), true);
  assert.equal(properMapped('203.0.113.9'), false);
});

test('untrusted peer cannot spoof client IP through X-Forwarded-For', () => {
  const req = { connection: { remoteAddress: '203.0.113.9' }, headers: { 'x-forwarded-for': '10.0.0.7' } };
  assert.equal(proxyaddr(req, proxyaddr.compile('::ffff:10.0.0.0/8')), '203.0.113.9');
});
