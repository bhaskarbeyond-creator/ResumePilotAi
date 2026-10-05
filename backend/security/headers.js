'use strict';
/**
 * DIR-040 — Express security headers, driven by the SAME canonical policy that
 * generates the Apache configs (scripts/security-headers-policy.mjs is the
 * source of truth; this module is its runtime projection).
 *
 * Previously this was a bare `helmet()` call, which meant:
 *   - helmet's default CSP (`default-src 'self'; script-src 'self'`) with no
 *     connect-src, no payment origins and no nonce — weaker than the document
 *     policy Apache applied, and silently divergent from it.
 *   - the CSP actually applied to the API layer, which returns JSON, not
 *     documents, so it never protected anything while implying that it did.
 *
 * The nonce is enabled here rather than on the static document on purpose: this
 * is the only surface that renders HTML per request (the Paytm/PhonePe gateway
 * callback pages), so a per-response nonce is both meaningful and achievable.
 * The static index.html is served by Apache and cannot receive a matching nonce.
 */
const crypto = require('crypto');

const HSTS_VALUE = 'max-age=31536000; includeSubDomains; preload';
const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(self)';

/**
 * The transport/isolation headers that are identical for every response, kept as
 * ONE table rather than nine separate setHeader calls.
 *
 * WHY THIS IS A TABLE (DIR-040 drift fix): the header set was previously written
 * as independent setHeader() calls, which is how `Cross-Origin-Resource-Policy`
 * came to be `cross-origin` here while the canonical policy
 * (scripts/security-headers-policy.mjs) and all three generated .htaccess files
 * said `same-site`. Nine independent literals can disagree with each other and
 * with the canonical policy forever; a single table cannot, because it is the
 * only place a value exists.
 *
 * WHY `same-site` IS THE CORRECT VALUE (and not a loosening):
 *   - It is what production ALREADY serves. Requests reach the backend through
 *     api/index.php, and Apache's `Header always set` executes after PHP has
 *     emitted the proxied headers, so it replaces whatever Express sent. The old
 *     `cross-origin` therefore never reached a single client; it was a claim the
 *     deployment did not honour.
 *   - Converging on the stricter value changes no observable behaviour while
 *     making the code state the truth. `cross-origin` would be a WEAKENING: it
 *     would let any site embed this origin's responses in a no-cors context.
 *   - CORP is not enforced on CORS-mode fetches, so the SPA's XHR/fetch calls to
 *     the API are unaffected, and `same-site` still permits sibling subdomains
 *     and the api./www. host split.
 */
const SHARED_SECURITY_HEADERS = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'no-referrer'],
  ['Permissions-Policy', PERMISSIONS_POLICY],
  ['Cross-Origin-Opener-Policy', 'same-origin-allow-popups'],
  // Cross-Origin-Opener-Policy stays same-origin-allow-popups (not same-origin)
  // so the Stripe, PayPal, Razorpay and Paytm checkout popups keep working.
  ['Cross-Origin-Resource-Policy', 'same-site'],
  ['Strict-Transport-Security', HSTS_VALUE],
  ['X-Permitted-Cross-Domain-Policies', 'none'],
];

function applySharedSecurityHeaders(res) {
  for (const [name, value] of SHARED_SECURITY_HEADERS) {
    res.setHeader(name, value);
  }
  // The framework must never advertise itself.
  res.removeHeader('X-Powered-By');
}

const CSP_SCRIPT_ORIGINS = [
  'https://js.stripe.com',
  'https://static.cloudflareinsights.com',
  'https://www.paypal.com',
  'https://www.sandbox.paypal.com',
  'https://checkout.razorpay.com',
  'https://securegw.paytm.in',
  'https://securegw-stage.paytm.in',
  'https://maps.googleapis.com',
  'https://apis.google.com',
];
const CSP_STYLE_ELEM_ORIGINS = ['https://fonts.googleapis.com', 'https://rsms.me'];
const CSP_FONT_ORIGINS = ['https://fonts.gstatic.com', 'https://rsms.me'];
const CSP_CONNECT_ORIGINS = [
  'https://api.stripe.com',
  'https://cloudflareinsights.com',
  'https://*.googleapis.com',
  'https://*.firebaseio.com',
  'wss://*.firebaseio.com',
  'https://www.paypal.com',
  'https://www.sandbox.paypal.com',
  'https://api.razorpay.com',
  'https://maps.googleapis.com',
];
const CSP_FRAME_ORIGINS = [
  'https://app.supademo.com',
  'https://js.stripe.com',
  'https://*.firebaseapp.com',
  'https://accounts.google.com',
  'https://www.paypal.com',
  'https://www.sandbox.paypal.com',
  'https://api.razorpay.com',
];

/**
 * Joins host-source expressions for a CSP directive.
 *
 * THESE MUST NOT BE SINGLE-QUOTED. Per CSP Level 2/3 the serialized grammar for a
 * host-source is `scheme-part "://" host-part [":" port-part] [path-part]`. Quoting
 * applies only to keyword-sources ('self', 'none', 'unsafe-inline', ...) and
 * nonce/hash sources, so a quoted host is an *invalid source* that Chromium/Edge
 * discard rather than honour — silently collapsing connect-src to its remaining
 * 'self' token and breaking Firebase identitytoolkit (auth/network-request-failed).
 *
 * This helper is duplicated from scripts/security-headers-policy.mjs because the
 * backend is CommonJS and the canonical module is ESM. backend/test/dir040-zero-trust
 * .test.js asserts the two layers emit a byte-identical policy, so they must not
 * diverge. Empirically proven in .bridge/evidence/dir047-csp-quote-probe.mjs.
 */
const hosts = values => values.join(' ');

/**
 * Builds the canonical policy. When `nonce` is supplied it is threaded into the
 * inline allowances so the per-response HTML surface can be protected by nonce
 * instead of by a blanket allowance.
 */
function canonicalContentSecurityPolicy(nonce) {
  const nonceSource = nonce ? ` 'nonce-${nonce}'` : '';
  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `script-src 'self'${nonceSource} ${hosts(CSP_SCRIPT_ORIGINS)}`,
    `style-src 'self' ${hosts(CSP_STYLE_ELEM_ORIGINS)}`,
    `style-src-attr 'unsafe-inline'`,
    `style-src-elem 'self'${nonceSource} 'unsafe-inline' ${hosts(CSP_STYLE_ELEM_ORIGINS)}`,
    `font-src 'self' data: ${hosts(CSP_FONT_ORIGINS)}`,
    `img-src 'self' data: blob: https:`,
    `connect-src 'self' ${hosts(CSP_CONNECT_ORIGINS)}`,
    `frame-src 'self' ${hosts(CSP_FRAME_ORIGINS)}`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

function createNonce() {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Security headers middleware. A fresh cryptographic nonce is minted per
 * response and exposed on `res.locals.cspNonce` so any server-rendered markup
 * can reference exactly the nonce named in the header.
 */
function securityHeaders() {
  return function applySecurityHeaders(req, res, next) {
    const nonce = createNonce();
    res.locals.cspNonce = nonce;
    res.setHeader('Content-Security-Policy', canonicalContentSecurityPolicy(nonce));
    applySharedSecurityHeaders(res);
    next();
  };
}

/**
 * Applies only the headers that are meaningful for a non-HTML API response.
 * Kept separate so JSON endpoints are not handed a document policy that can
 * never be violated usefully.
 */
function apiSecurityHeaders() {
  return function applyApiSecurityHeaders(req, res, next) {
    applySharedSecurityHeaders(res);
    next();
  };
}

module.exports = {
  securityHeaders,
  apiSecurityHeaders,
  canonicalContentSecurityPolicy,
  createNonce,
  HSTS_VALUE,
  PERMISSIONS_POLICY,
  // Exported so the test suite can assert that this table matches the canonical
  // policy in scripts/security-headers-policy.mjs value-for-value, rather than
  // only checking that the middleware emits *some* header.
  SHARED_SECURITY_HEADERS,
};
