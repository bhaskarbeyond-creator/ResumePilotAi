'use strict';

/**
 * Server-side IdP metadata import.
 *
 * Fetching a URL on behalf of an administrator is a server-side request forgery
 * primitive unless it is constrained, so this module is written as a guard first
 * and a fetcher second:
 *
 *   * https only (no plaintext hop, no embedded credentials, no fragments);
 *   * the hostname is resolved once, every returned address is checked, and the
 *     connection is then PINNED to that checked address — so a DNS-rebinding
 *     answer between the check and the connection cannot redirect the request
 *     into the private network;
 *   * private, loopback, link-local, CGNAT and unique-local ranges are refused
 *     for IPv4 and IPv6, including IPv4-mapped IPv6;
 *   * redirects are followed manually (max 3) and every hop is re-checked;
 *   * the body is capped while streaming, and the whole exchange has a timeout.
 *
 * The transport, resolver and clock are injectable so the rules can be tested
 * offline; production uses `https.request` and `dns.lookup`.
 */

const dns = require('node:dns');
const net = require('node:net');
const https = require('node:https');

const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

class MetadataFetchError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'MetadataFetchError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status) {
  throw new MetadataFetchError(code, message, status);
}

/** True for any address a server must never be asked to fetch on an admin's behalf. */
function isBlockedAddress(address) {
  if (!address) return true;
  let value = String(address).trim().toLowerCase();
  // Normalise IPv4-mapped IPv6 (::ffff:10.0.0.1) to the IPv4 form so one range
  // check covers both spellings.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped) value = mapped[1];

  if (net.isIPv4(value)) {
    const [a, b] = value.split('.').map(Number);
    if (a === 0) return true;                                   // "this network"
    if (a === 10) return true;                                  // private
    if (a === 127) return true;                                 // loopback
    if (a === 169 && b === 254) return true;                    // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;           // private
    if (a === 192 && b === 168) return true;                    // private
    if (a === 100 && b >= 64 && b <= 127) return true;          // CGNAT
    if (a === 192 && b === 0 && value.startsWith('192.0.0.')) return true; // IETF protocol assignments
    if (a >= 224) return true;                                  // multicast + reserved
    return false;
  }

  if (net.isIPv6(value)) {
    if (value === '::' || value === '::1') return true;
    if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true; // link-local
    if (value.startsWith('fc') || value.startsWith('fd')) return true; // unique local
    if (value.startsWith('ff')) return true;                    // multicast
    return false;
  }

  return true;
}

function assertSafeUrl(raw, { allowHttp = false } = {}) {
  let url;
  try {
    url = new URL(String(raw));
  } catch (_error) {
    fail('SAML_METADATA_URL_INVALID', 'metadata URL is not an absolute URL');
  }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    fail('SAML_METADATA_URL_INVALID', 'metadata URL must use https');
  }
  if (url.username || url.password) {
    fail('SAML_METADATA_URL_INVALID', 'metadata URL must not embed credentials');
  }
  if (url.hash) fail('SAML_METADATA_URL_INVALID', 'metadata URL must not carry a fragment');
  if (!url.hostname) fail('SAML_METADATA_URL_INVALID', 'metadata URL has no host');
  return url;
}

/**
 * Resolves the host to the single address that will be connected to, refusing the
 * request when any resolved address is non-public.
 */
async function pinAddress(url, { lookup }) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) {
      fail('SAML_METADATA_URL_BLOCKED', 'metadata URL points at a non-public address');
    }
    return { address: host, family: net.isIPv6(host) ? 6 : 4 };
  }

  let records;
  try {
    records = await lookup(host, { all: true });
  } catch (_error) {
    fail('SAML_METADATA_URL_UNRESOLVABLE', 'metadata host could not be resolved');
  }
  const list = (Array.isArray(records) ? records : [records]).filter(Boolean);
  if (!list.length) fail('SAML_METADATA_URL_UNRESOLVABLE', 'metadata host could not be resolved');
  // Fail closed: one private answer is enough to refuse the whole host.
  for (const record of list) {
    if (isBlockedAddress(record.address)) {
      fail('SAML_METADATA_URL_BLOCKED', 'metadata host resolves to a non-public address');
    }
  }
  const chosen = list[0];
  return { address: chosen.address, family: chosen.family || (net.isIPv6(chosen.address) ? 6 : 4) };
}

function defaultTransport({ url, address, family, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Accept: 'application/samlmetadata+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
          'User-Agent': 'ResumePilotAi-SAML-SP/1.0',
        },
        // Pin the connection to the address that was checked, which is what makes
        // the DNS check meaningful.
        lookup: (_hostname, _options, callback) => callback(null, address, family),
        timeout: timeoutMs,
      },
      response => {
        const status = Number(response.statusCode) || 0;
        if (status >= 300 && status < 400) {
          response.resume();
          return resolve({ status, location: response.headers.location || null, body: '' });
        }
        if (status !== 200) {
          response.resume();
          return resolve({ status, location: null, body: '' });
        }
        const chunks = [];
        let size = 0;
        response.on('data', chunk => {
          size += chunk.length;
          if (size > DEFAULT_MAX_BYTES) {
            response.destroy();
            reject(new MetadataFetchError('SAML_METADATA_TOO_LARGE', 'metadata document is too large', 413));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolve({ status, location: null, body: Buffer.concat(chunks).toString('utf8') }));
        response.on('error', () => reject(new MetadataFetchError('SAML_METADATA_FETCH_FAILED', 'metadata download failed', 502)));
      },
    );
    request.on('timeout', () => {
      request.destroy();
      reject(new MetadataFetchError('SAML_METADATA_FETCH_TIMEOUT', 'metadata download timed out', 504));
    });
    request.on('error', () => reject(new MetadataFetchError('SAML_METADATA_FETCH_FAILED', 'metadata download failed', 502)));
    request.end();
  });
}

/**
 * Downloads an IdP metadata document under the guards described above.
 * Returns the XML text; parsing and trust decisions are the caller's job.
 */
async function fetchIdpMetadata(rawUrl, {
  transport = defaultTransport,
  lookup = (host, options) => dns.promises.lookup(host, options),
  maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  allowHttp = process.env.SAML_ALLOW_INSECURE_METADATA === 'true',
} = {}) {
  let url = assertSafeUrl(rawUrl, { allowHttp });

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const pinned = await pinAddress(url, { lookup });
    const response = await transport({ url, ...pinned, timeoutMs, maxBytes });

    if (response.status >= 300 && response.status < 400) {
      if (!response.location) fail('SAML_METADATA_FETCH_FAILED', 'metadata redirect had no location', 502);
      if (hop === MAX_REDIRECTS) fail('SAML_METADATA_FETCH_FAILED', 'too many metadata redirects', 502);
      let next;
      try {
        next = new URL(response.location, url);
      } catch (_error) {
        fail('SAML_METADATA_FETCH_FAILED', 'metadata redirect was not a valid URL', 502);
      }
      // Every hop is re-validated and re-pinned; a redirect into the private
      // network is the classic bypass for a one-shot check.
      url = assertSafeUrl(next.toString(), { allowHttp });
      continue;
    }

    if (response.status !== 200) {
      fail('SAML_METADATA_FETCH_FAILED', `metadata endpoint returned HTTP ${response.status}`, 502);
    }
    const body = String(response.body || '');
    if (Buffer.byteLength(body, 'utf8') > maxBytes) {
      fail('SAML_METADATA_TOO_LARGE', 'metadata document is too large', 413);
    }
    if (!body.trim()) fail('SAML_METADATA_FETCH_FAILED', 'metadata endpoint returned an empty document', 502);
    return body;
  }

  fail('SAML_METADATA_FETCH_FAILED', 'too many metadata redirects', 502);
  return null;
}

module.exports = {
  MAX_REDIRECTS,
  DEFAULT_MAX_BYTES,
  DEFAULT_TIMEOUT_MS,
  MetadataFetchError,
  assertSafeUrl,
  fetchIdpMetadata,
  isBlockedAddress,
};
