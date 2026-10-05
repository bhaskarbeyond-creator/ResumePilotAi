'use strict';
/**
 * DIR-040 — universal request sanitizer for req.body / req.query / req.params.
 *
 * HARD CONSTRAINT (directive invariant): sanitization must neutralize malicious
 * vectors WITHOUT corrupting valid candidate text. This application stores
 * resumes, cover letters and portfolios, which legitimately contain:
 *   - programming code samples: `<script>alert(1)</script>`, `a < b && c > d`,
 *     SQL snippets inside a "technologies" field, curly quotes, emoji
 *   - prose containing the words "DROP TABLE" or "-- comment"
 *
 * Therefore this module does NOT blanket HTML-escape strings and does NOT strip
 * angle brackets from free text. Blanket escaping would silently mangle every
 * code sample a candidate pastes into their portfolio, which is the exact
 * corruption the invariant forbids.
 *
 * What it DOES do is remove the vectors that are dangerous regardless of
 * context and cannot be legitimate input:
 *   1. Prototype-pollution keys (`__proto__`, `constructor`, `prototype`) are
 *      stripped structurally, at every depth, so no JSON body can reach
 *      Object.prototype.
 *   2. Values that are pure active-content URLs (`javascript:`, `vbscript:`,
 *      `data:text/html`) are neutralized. A resume that legitimately mentions
 *      "javascript:" in prose is untouched because the check only fires when the
 *      whole trimmed value IS such a URL scheme.
 *   3. NUL bytes and C0 control characters are removed, defeating smuggling
 *      tricks that bypass downstream parsers.
 *   4. Depth and breadth are bounded, so a deeply nested body cannot exhaust
 *      the stack (a DoS vector in its own right).
 *
 * Rendering-context safety (escaping for HTML output) remains the job of the
 * existing client-side DOMPurify layer at the point of render. This middleware
 * is transport hygiene, not an XSS output encoder.
 */

const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 24;
const MAX_KEYS_PER_LEVEL = 2000;
const MAX_STRING_LENGTH = 512 * 1024;

/**
 * A value that is ENTIRELY an active-content URL scheme.
 *
 * `data:` is deliberately NOT in this list. Portfolio images, avatars and
 * pasted screenshots are legitimately transported as `data:image/png;base64,...`
 * (this codebase does exactly that in 22 places), and the directive invariant
 * forbids corrupting valid candidate text. Only the executable `data:` payloads
 * are dangerous, and those are matched separately by DANGEROUS_DATA_URL below.
 */
const DANGEROUS_SCHEME = /^(?:javascript|vbscript|livescript|mocha)\s*:/i;

/**
 * A `data:` URL whose media type can execute script. `image/png`, `image/jpeg`,
 * `image/gif` and `image/webp` are excluded on purpose so real uploads survive.
 */
const DANGEROUS_DATA_URL = /^data\s*:\s*text\/html|^data\s*:\s*image\/svg\+xml|^data\s*:\s*application\/(?:xhtml\+xml|javascript|ecmascript)/i;

/**
 * The scheme portion of a value that is ENTIRELY an active-content URL.
 *
 * Neutralization strips the scheme delimiter itself rather than entity-encoding
 * the colon. That distinction is the whole point: browsers decode HTML
 * character references in an attribute value BEFORE the URL parser ever sees
 * it, so `javascript:&#58;alert(1)` is handed to the URL parser as
 * `javascript::alert(1)` and remains an executable `javascript:` URL. Encoding
 * the colon is therefore not a defense at all — it is decoration. Removing the
 * colon yields `javascriptalert(1)`, which has no scheme, so no amount of
 * downstream decoding can revive it.
 */
const ACTIVE_CONTENT_SCHEME = /^\s*(?:(?:javascript|vbscript|livescript|mocha)\s*:|data\s*:\s*(?:text\/html|image\/svg\+xml|application\/(?:xhtml\+xml|javascript|ecmascript)))/i;

/**
 * Rebuilds a value without prototype-pollution keys, dropping any value that
 * cannot be represented safely in a JSON transport.
 */
function sanitizeValue(value, depth = 0, budget = { keys: 0 }) {
  if (depth > MAX_DEPTH) return undefined;
  if (value === null || value === undefined) return value;

  const type = typeof value;

  if (type === 'string') return sanitizeString(value);
  if (type === 'number') return Number.isFinite(value) ? value : null;
  if (type === 'boolean') return value;
  if (type === 'bigint') return value.toString();
  if (type === 'function' || type === 'symbol') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return undefined;
  if (Buffer.isBuffer(value)) return value;

  if (Array.isArray(value)) {
    return value
      .map(item => sanitizeValue(item, depth + 1, budget))
      .filter(item => item !== undefined);
  }

  if (type === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      if (isPollutionKey(key)) continue;
      if (++budget.keys > MAX_KEYS_PER_LEVEL) break;
      const cleaned = sanitizeValue(value[key], depth + 1, budget);
      if (cleaned === undefined) continue;
      out[key] = cleaned;
    }
    return out;
  }

  return undefined;
}

/**
 * Removes NUL bytes and C0 control characters (keeping tab/newline/carriage
 * return, which are legitimate in resumes) and neutralizes a value that is
 * entirely an active-content URL.
 */
function sanitizeString(input) {
  const stripped = String(input)
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const bounded = stripped.length > MAX_STRING_LENGTH
    ? stripped.slice(0, MAX_STRING_LENGTH)
    : stripped;
  const trimmed = bounded.trim();
  if (!trimmed) return bounded;
  // Only a value whose entire content is an active-content URL is neutralized.
  // Prose and code samples that merely mention a scheme survive untouched.
  if (DANGEROUS_SCHEME.test(trimmed) || DANGEROUS_DATA_URL.test(trimmed)) {
    // Remove the scheme and its colon outright. See ACTIVE_CONTENT_SCHEME for why
    // entity-encoding the colon is not a real defense.
    return bounded.replace(ACTIVE_CONTENT_SCHEME, '');
  }
  return bounded;
}

/**
 * Rebuilds a value without prototype-pollution keys, dropping any value that
 * cannot be represented safely in a JSON transport.
 *
 * RAW BODY EXCEPTION (DIR-040 regression guard): `/api/stripe-webhook` is
 * mounted with `express.raw` precisely because Stripe signs the EXACT bytes it
 * sent. `webhookGuard.verifyStripeSignature` recomputes an HMAC over
 * `req.body`, so rebuilding that Buffer through Object.keys() would shred it
 * into `{"0":123,"1":34,...}` and make every signature verification fail —
 * breaking all payment activation. Binary carriers are therefore returned
 * untouched; a Buffer cannot carry prototype-pollution keys either, since
 * Buffer.prototype is not reachable from `JSON.parse` output.
 */
function sanitizeCarrier(carrier) {
  if (!carrier || typeof carrier !== 'object') return carrier;
  if (Buffer.isBuffer(carrier)) return carrier;
  const safe = {};
  for (const key of Object.keys(carrier)) {
    if (isPollutionKey(key)) continue;
    safe[key] = sanitizeValue(carrier[key], 0, { keys: 0 });
  }
  return safe;
}

/**
 * Express middleware. Mutates req.body/query/params to their sanitized
 * equivalents. Must be registered after the body parsers and BEFORE any
 * authentication, authorization or admission decision, so nothing downstream
 * ever observes a polluted object.
 */
function sanitizeRequest() {
  return function applySanitizeRequest(req, res, next) {
    try {
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeCarrier(req.body);
      }
      if (req.params && typeof req.params === 'object') {
        req.params = sanitizeCarrier(req.params);
      }
      if (req.query && typeof req.query === 'object') {
        const sanitizedQuery = sanitizeCarrier(req.query);
        // req.query is a getter on Express 5; redefine it rather than assign.
        try {
          Object.defineProperty(req, 'query', {
            value: sanitizedQuery,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        } catch (_) {
          req.query = sanitizedQuery;
        }
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  sanitizeRequest,
  sanitizeValue,
  sanitizeString,
  sanitizeCarrier,
  isPollutionKey,
  POLLUTION_KEYS,
  MAX_DEPTH,
  MAX_STRING_LENGTH,
};

function isPollutionKey(key) {
  return POLLUTION_KEYS.has(String(key).toLowerCase());
}
