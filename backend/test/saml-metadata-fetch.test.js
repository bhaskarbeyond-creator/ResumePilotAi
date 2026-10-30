'use strict';

/**
 * IdP metadata import — SSRF guard contracts.
 *
 * Fetching an administrator-supplied URL is a classic request-forgery primitive.
 * These tests exercise every refusal rule without touching the network: the
 * resolver and the transport are injected, so the only thing under test is the
 * decision logic.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MetadataFetchError,
  assertSafeUrl,
  fetchIdpMetadata,
  isBlockedAddress,
} = require('../enterprise/samlMetadataFetch');

const METADATA = '<?xml version="1.0"?><md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.test/metadata"/>';

function rejectsWith(promise, code) {
  return assert.rejects(promise, error => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

function resolver(map) {
  return async host => {
    if (!(host in map)) {
      const error = new Error('ENOTFOUND');
      error.code = 'ENOTFOUND';
      throw error;
    }
    return map[host];
  };
}

const publicResolver = resolver({ 'idp.example.test': [{ address: '93.184.216.34', family: 4 }] });

// ---------------------------------------------------------------------------
// Address policy
// ---------------------------------------------------------------------------

test('Address policy: private, loopback, link-local, CGNAT and reserved ranges are refused', () => {
  for (const address of [
    '127.0.0.1', '127.255.255.254', '10.1.2.3', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '255.255.255.255',
    '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', 'fc00::abcd', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:169.254.169.254',
  ]) {
    assert.equal(isBlockedAddress(address), true, `${address} must be blocked`);
  }
});

test('Address policy: public addresses are allowed', () => {
  for (const address of ['93.184.216.34', '8.8.8.8', '203.0.113.10', '2001:4860:4860::8888', '172.32.0.1']) {
    assert.equal(isBlockedAddress(address), false, `${address} must be allowed`);
  }
});

// ---------------------------------------------------------------------------
// URL policy
// ---------------------------------------------------------------------------

test('URL policy: plaintext, credentialed and fragmented URLs are refused', () => {
  assert.throws(() => assertSafeUrl('http://idp.example.test/metadata'), error => error.code === 'SAML_METADATA_URL_INVALID');
  assert.throws(() => assertSafeUrl('https://user:pass@idp.example.test/metadata'), error => error.code === 'SAML_METADATA_URL_INVALID');
  assert.throws(() => assertSafeUrl('https://idp.example.test/metadata#x'), error => error.code === 'SAML_METADATA_URL_INVALID');
  assert.throws(() => assertSafeUrl('file:///etc/passwd'), error => error.code === 'SAML_METADATA_URL_INVALID');
  assert.throws(() => assertSafeUrl('not a url'), error => error.code === 'SAML_METADATA_URL_INVALID');
  assert.equal(assertSafeUrl('https://idp.example.test/metadata').hostname, 'idp.example.test');
});

// ---------------------------------------------------------------------------
// Fetch policy
// ---------------------------------------------------------------------------

test('Fetch: a literal private address is refused before any request is made', async () => {
  let called = false;
  await rejectsWith(fetchIdpMetadata('https://169.254.169.254/latest/meta-data/', {
    lookup: publicResolver,
    transport: async () => { called = true; return { status: 200, body: METADATA }; },
  }), 'SAML_METADATA_URL_BLOCKED');
  assert.equal(called, false);
});

test('Fetch: a hostname that resolves into the private network is refused', async () => {
  let called = false;
  await rejectsWith(fetchIdpMetadata('https://idp.example.test/metadata', {
    lookup: resolver({ 'idp.example.test': [{ address: '10.0.0.7', family: 4 }] }),
    transport: async () => { called = true; return { status: 200, body: METADATA }; },
  }), 'SAML_METADATA_URL_BLOCKED');
  assert.equal(called, false);
});

test('Fetch: one private answer among several is enough to refuse the host', async () => {
  await rejectsWith(fetchIdpMetadata('https://idp.example.test/metadata', {
    lookup: resolver({
      'idp.example.test': [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    }),
    transport: async () => ({ status: 200, body: METADATA }),
  }), 'SAML_METADATA_URL_BLOCKED');
});

test('Fetch: the connection is pinned to the address that was checked', async () => {
  let seen = null;
  const body = await fetchIdpMetadata('https://idp.example.test/metadata', {
    lookup: resolver({ 'idp.example.test': [{ address: '93.184.216.34', family: 4 }] }),
    transport: async request => {
      seen = request;
      return { status: 200, body: METADATA };
    },
  });
  assert.equal(body, METADATA);
  assert.equal(seen.address, '93.184.216.34');
  assert.equal(seen.family, 4);
  assert.equal(seen.url.hostname, 'idp.example.test');
});

test('Fetch: a redirect into the private network is refused', async () => {
  let hops = 0;
  await rejectsWith(fetchIdpMetadata('https://idp.example.test/metadata', {
    lookup: resolver({
      'idp.example.test': [{ address: '93.184.216.34', family: 4 }],
      'metadata.cdn.example.test': [{ address: '192.168.0.5', family: 4 }],
    }),
    transport: async () => {
      hops += 1;
      return { status: 302, location: 'https://metadata.cdn.example.test/live', body: '' };
    },
  }), 'SAML_METADATA_URL_BLOCKED');
  assert.equal(hops, 1, 'the blocked hop must never be requested');
});

test('Fetch: a redirect to plaintext is refused', async () => {
  await rejectsWith(fetchIdpMetadata('https://idp.example.test/metadata', {
    lookup: publicResolver,
    transport: async () => ({ status: 302, location: 'http://idp.example.test/metadata', body: '' }),
  }), 'SAML_METADATA_URL_INVALID');
});

test('Fetch: an endless redirect chain is stopped', async () => {
  await rejectsWith(fetchIdpMetadata('https://idp.example.test/metadata', {
    lookup: publicResolver,
    transport: async () => ({ status: 302, location: 'https://idp.example.test/metadata-again', body: '' }),
  }), 'SAML_METADATA_FETCH_FAILED');
});

test('Fetch: a single redirect to another public host is followed', async () => {
  const bodies = [];
  const body = await fetchIdpMetadata('https://idp.example.test/metadata', {
    lookup: resolver({
      'idp.example.test': [{ address: '93.184.216.34', family: 4 }],
      'login.example.test': [{ address: '93.184.216.35', family: 4 }],
    }),
    transport: async request => {
      bodies.push(request.url.hostname);
      return request.url.hostname === 'idp.example.test'
        ? { status: 301, location: 'https://login.example.test/metadata', body: '' }
        : { status: 200, body: METADATA };
    },
  });
  assert.deepEqual(bodies, ['idp.example.test', 'login.example.test']);
  assert.equal(body, METADATA);
});

test('Fetch: non-200, empty and oversized documents are refused', async () => {
  await rejectsWith(fetchIdpMetadata('https://idp.example.test/metadata', {
    lookup: publicResolver,
    transport: async () => ({ status: 404, body: '' }),
  }), 'SAML_METADATA_FETCH_FAILED');

  await rejectsWith(fetchIdpMetadata('https://idp.example.test/metadata', {
    lookup: publicResolver,
    transport: async () => ({ status: 200, body: '   ' }),
  }), 'SAML_METADATA_FETCH_FAILED');

  await rejectsWith(fetchIdpMetadata('https://idp.example.test/metadata', {
    lookup: publicResolver,
    maxBytes: 32,
    transport: async () => ({ status: 200, body: 'x'.repeat(64) }),
  }), 'SAML_METADATA_TOO_LARGE');
});

test('Fetch: an unresolvable host is reported as such', async () => {
  await rejectsWith(fetchIdpMetadata('https://does-not-resolve.example.test/metadata', {
    lookup: resolver({}),
    transport: async () => ({ status: 200, body: METADATA }),
  }), 'SAML_METADATA_URL_UNRESOLVABLE');
});

test('Fetch: transport failures are surfaced as a bad gateway, never as success', async () => {
  await rejectsWith(fetchIdpMetadata('https://idp.example.test/metadata', {
    lookup: publicResolver,
    transport: async () => {
      throw new MetadataFetchError('SAML_METADATA_FETCH_TIMEOUT', 'metadata download timed out', 504);
    },
  }), 'SAML_METADATA_FETCH_TIMEOUT');
});
