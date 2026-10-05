#!/usr/bin/env node
/**
 * DIR-040 — Verifies the served security headers against the canonical policy.
 *
 * This is the offline half of the header audit: it proves the three Apache
 * configs and the Express middleware all express ONE policy, and that the
 * policy is strict where strictness is possible without breaking integrations.
 * The live half (real response headers from a running server) is
 * tests/e2e/dir-040.spec.js, which crawls the rendered DOM.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SECURITY_HEADERS,
  CONTENT_SECURITY_POLICY,
  HSTS_VALUE,
} from './security-headers-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// --- 1. Every Apache copy carries the identical canonical policy --------------
// dist/ is a gitignored build artifact, so it is verified when present but is
// never a hard failure on a fresh clone (CI would otherwise ENOENT here).
const REQUIRED_TARGETS = ['.htaccess', 'public/.htaccess'];
const OPTIONAL_TARGETS = ['dist/.htaccess'];
for (const target of [...REQUIRED_TARGETS, ...OPTIONAL_TARGETS]) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) {
    check(`${target} exists`, OPTIONAL_TARGETS.includes(target), 'build artifact, not committed');
    continue;
  }
  const source = fs.readFileSync(absolute, 'utf8');
  for (const [header, value] of SECURITY_HEADERS) {
    check(
      `${target} sets ${header}`,
      source.includes(`Header always set ${header} "${value}"`),
      value.length > 90 ? `${value.slice(0, 87)}...` : value
    );
  }
  check(`${target} preserves its mod_rewrite routing`, /RewriteEngine On/.test(source));
}

// --- 2. The policy is actually strict -----------------------------------------
const csp = CONTENT_SECURITY_POLICY;
check('style-src itself carries no unsafe-inline (the A+ blocker)', !/style-src 'self'[^;]*'unsafe-inline'/.test(csp));
check('script-src carries no unsafe-inline or unsafe-eval', !/script-src[^;]*'(unsafe-inline|unsafe-eval)'/.test(csp));
check('inline style needs are expressed via CSP3 style-src-attr/elem', /style-src-attr 'unsafe-inline'/.test(csp) && /style-src-elem 'self' 'unsafe-inline'/.test(csp));
check("default-src 'self'", /default-src 'self'/.test(csp));
check("object-src 'none'", /object-src 'none'/.test(csp));
check("frame-ancestors 'none'", /frame-ancestors 'none'/.test(csp));
check("base-uri 'self'", /base-uri 'self'/.test(csp));
check("form-action 'self'", /form-action 'self'/.test(csp));
check('HSTS carries preload', HSTS_VALUE.includes('preload'));

// --- 3. Legitimate integrations are still reachable ---------------------------
const requiredOrigins = [
  'https://js.stripe.com', 'https://www.paypal.com', 'https://checkout.razorpay.com',
  'https://securegw.paytm.in', 'https://maps.googleapis.com', 'https://*.firebaseio.com',
  'wss://*.firebaseio.com', 'https://app.supademo.com', 'https://fonts.googleapis.com',
  'https://fonts.gstatic.com', 'https://rsms.me', 'https://cloudflareinsights.com',
  'https://apis.google.com', 'https://accounts.google.com',
];
for (const origin of requiredOrigins) {
  check(`CSP permits ${origin}`, csp.includes(origin));
}
check('payment popups survive (Cross-Origin-Opener-Policy relaxed)',
  SECURITY_HEADERS.some(([h, v]) => h === 'Cross-Origin-Opener-Policy' && v === 'same-origin-allow-popups'));

// --- 4. Express must express the same policy ----------------------------------
const expressHeaders = fs.readFileSync(path.join(root, 'backend/security/headers.js'), 'utf8');
check('Express uses the canonical CSP', /canonicalContentSecurityPolicy|SECURITY_HEADERS/.test(expressHeaders));
check('Express emits HSTS with preload', /HSTS_VALUE|preload/.test(expressHeaders));

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} header assertions passed.`);
fs.mkdirSync(path.join(root, '.bridge/evidence/dir040-artifacts'), { recursive: true });
fs.writeFileSync(
  path.join(root, '.bridge/evidence/dir040-artifacts/header-audit.json'),
  JSON.stringify({ total: results.length, passed: results.length - failed.length, results }, null, 2),
  'utf8'
);
process.exit(failed.length ? 1 : 0);
