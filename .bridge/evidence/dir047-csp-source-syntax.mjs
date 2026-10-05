/**
 * DIR-047 — Regression guard for the CSP quoting defect.
 *
 * The policy previously rendered every host-source single-quoted
 * ('https://*.googleapis.com'), which is an INVALID source per CSP L2/L3: Chromium
 * discards it, silently collapsing connect-src to 'self' and breaking Firebase
 * auth/network-request-failed. Proven in .bridge/evidence/dir047-csp-quote-probe.mjs.
 *
 * This asserts the corrected shape on BOTH layers that emit a policy (the ESM
 * canonical module and the CommonJS Express projection) and on all three generated
 * Apache configs, so the defect cannot silently return in either copy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

const policyModule = await import(pathToFileURL(path.join(root, 'scripts/security-headers-policy.mjs')).href);
const { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } = policyModule;

/** Tokens that legitimately carry single quotes: keywords, nonce-*, sha*. */
const isQuotedKeyword = token => /^'(?:self|none|unsafe-inline|unsafe-eval|unsafe-hashes|wasm-unsafe-eval|strict-dynamic|report-sample|nonce-|sha256-|sha384-|sha512-)[']/.test(token);

const quotedHostSources = csp =>
  csp
    .split(';')
    .flatMap(directive => directive.trim().split(/\s+/))
    .filter(token => token.startsWith("'") && token.includes('://'))
    .filter(token => !isQuotedKeyword(token));

const layers = [
  ['canonical policy module (scripts/security-headers-policy.mjs)', CONTENT_SECURITY_POLICY],
  [
    'Express projection (backend/security/headers.js)',
    require(path.join(root, 'backend/security/headers.js')).canonicalContentSecurityPolicy(),
  ],
];

for (const target of ['.htaccess', 'public/.htaccess', 'dist/.htaccess']) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) continue;
  const match = fs.readFileSync(absolute, 'utf8').match(/Content-Security-Policy "([^"]+)/);
  assert.ok(match, `${target} must carry a Content-Security-Policy header`);
  layers.push([`${target}`, match[1]]);
}

let checked = 0;
for (const [name, csp] of layers) {
  const offenders = quotedHostSources(csp);
  assert.deepEqual(
    offenders,
    [],
    `${name}: host-sources must not be single-quoted (invalid source, discarded by Chromium): ${offenders.join(', ')}`
  );
  checked += 1;
}

// The fix must be a real fix, not a deletion: every integration the product depends
// on has to still be present as a VALID unquoted host-source.
const connectSrc = CONTENT_SECURITY_POLICY.split('; ').find(d => d.startsWith('connect-src'));
for (const origin of [
  'https://api.stripe.com', 'https://*.googleapis.com', 'https://*.firebaseio.com',
  'wss://*.firebaseio.com', 'https://www.paypal.com', 'https://maps.googleapis.com',
]) {
  assert.ok(
    connectSrc.split(/\s+/).includes(origin),
    `connect-src must carry ${origin} as a bare host-source token`
  );
}
// Firebase auth is the specific outage this defect caused.
assert.ok(connectSrc.includes('https://*.googleapis.com'), 'identitytoolkit.googleapis.com must be reachable');

// Keywords must still be quoted (removing quoting must not weaken keyword semantics).
assert.ok(connectSrc.includes("'self'"), "'self' must remain quoted");

// The two emitting layers must still agree byte-for-byte (DIR-040 invariant).
const stripNonces = value => value.replace(/'nonce-[^']+'\s*/g, '');
assert.equal(
  stripNonces(require(path.join(root, 'backend/security/headers.js')).canonicalContentSecurityPolicy()),
  CONTENT_SECURITY_POLICY,
  'Express and canonical layers must emit an identical policy'
);

// SECURITY_HEADERS must embed the same corrected policy.
assert.ok(SECURITY_HEADERS.some(([n, v]) => n === 'Content-Security-Policy' && v === CONTENT_SECURITY_POLICY));

console.log(`csp-source-syntax: PASS — ${checked} layers carry zero quoted host-sources; Firebase/Stripe/PayPal/maps origins preserved and valid.`);