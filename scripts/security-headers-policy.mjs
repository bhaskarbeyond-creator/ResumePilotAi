/**
 * DIR-040 — Single source of truth for the browser-facing security headers.
 *
 * BEFORE this module the identical-looking policy existed in THREE hand-edited
 * copies (.htaccess, public/.htaccess, dist/.htaccess) and they had already
 * drifted: the root copy was missing the rsms.me font origins that the built
 * copies carried. A policy that can silently diverge is not a policy, so every
 * copy is now generated from the constants below by
 * scripts/generate-security-headers.mjs.
 *
 * DESIGN CONSTRAINT (why style-src no longer carries 'unsafe-inline'):
 *   This SPA is React 19 with ~1691 `style={{...}}` attributes and framer-motion
 *   injects <style> elements at runtime. Those are governed by the CSP3
 *   `style-src-attr` and `style-src-elem` directives respectively. Splitting them
 *   out states the actual intent precisely instead of blanket-allowing every
 *   inline style:
 *     - style-src-attr 'unsafe-inline'  -> required by React inline style attributes
 *     - style-src-elem 'self' ... 'unsafe-inline' -> required by the frozen
 *       pre-paint <style> block in index.html (pinned by tests/fouc-prevention)
 *       and by runtime style injection
 *   A nonce is deliberately NOT used for the document: index.html is served as a
 *   static file by Apache, so no per-response nonce can be injected into the
 *   markup to match a header nonce. Nonces are enabled where a real per-response
 *   generator exists: the Express API surface (see backend/security/headers.js).
 *
 * Everything else here is deliberately kept at least as strict as the previous
 * hand-written values, so no integration can regress:
 *   - X-Frame-Options stays DENY (stricter than the SAMEORIGIN the spec allows).
 *   - Referrer-Policy stays no-referrer (stricter than strict-origin-when-cross-origin).
 *   - microphone=() stays denied (stricter than the spec's microphone=(self)).
 *   - Cross-Origin-Opener-Policy stays same-origin-allow-popups so the Stripe,
 *     PayPal, Razorpay and Paytm checkout popups keep working.
 */

export const HSTS_VALUE = 'max-age=31536000; includeSubDomains; preload';
export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(self)';

/** Third-party origins the application genuinely talks to. */
export const CSP_SCRIPT_ORIGINS = [
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

export const CSP_STYLE_ELEM_ORIGINS = ['https://fonts.googleapis.com', 'https://rsms.me'];
export const CSP_FONT_ORIGINS = ['https://fonts.gstatic.com', 'https://rsms.me'];
export const CSP_CONNECT_ORIGINS = [
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
export const CSP_FRAME_ORIGINS = [
  'https://app.supademo.com',
  'https://js.stripe.com',
  'https://*.firebaseapp.com',
  'https://accounts.google.com',
  'https://www.paypal.com',
  'https://www.sandbox.paypal.com',
  'https://api.razorpay.com',
];

const list = values => values.map(value => `'${value}'`).join(' ');

/**
 * The canonical Content-Security-Policy. `style-src` itself carries no
 * 'unsafe-inline'; the inline allowances are expressed through the CSP3
 * style-src-attr / style-src-elem directives that actually govern them.
 */
export const CONTENT_SECURITY_POLICY = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `script-src 'self' ${list(CSP_SCRIPT_ORIGINS)}`,
  `style-src 'self' ${list(CSP_STYLE_ELEM_ORIGINS)}`,
  `style-src-attr 'unsafe-inline'`,
  `style-src-elem 'self' 'unsafe-inline' ${list(CSP_STYLE_ELEM_ORIGINS)}`,
  `font-src 'self' data: ${list(CSP_FONT_ORIGINS)}`,
  `img-src 'self' data: blob: https:`,
  `connect-src 'self' ${list(CSP_CONNECT_ORIGINS)}`,
  `frame-src 'self' ${list(CSP_FRAME_ORIGINS)}`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `upgrade-insecure-requests`,
].join('; ');

/** Every header Apache must emit, in emission order. */
export const SECURITY_HEADERS = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'no-referrer'],
  ['Permissions-Policy', PERMISSIONS_POLICY],
  ['Cross-Origin-Opener-Policy', 'same-origin-allow-popups'],
  ['Cross-Origin-Resource-Policy', 'same-site'],
  ['Strict-Transport-Security', HSTS_VALUE],
  ['X-Permitted-Cross-Domain-Policies', 'none'],
  ['Content-Security-Policy', CONTENT_SECURITY_POLICY],
];

/** Renders the mod_headers block that every generated .htaccess embeds. */
export function renderApacheHeaderBlock() {
  const lines = SECURITY_HEADERS.map(([name, value]) => `  Header always set ${name} "${value}"`);
  return ['<IfModule mod_headers.c>', ...lines, '</IfModule>'].join('\n');
}
