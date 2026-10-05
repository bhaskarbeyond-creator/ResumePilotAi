/**
 * DIR-031 — client-side contract for the public contact/lead form.
 *
 * WHY THIS IS A SEPARATE MODULE
 * The authoritative rules live on the server (`app.post(''/api/contact'')` in
 * backend/index.js). Before this module the browser had NO rules at all: the form only
 * checked `required`, so a visitor could type a multi-megabyte "message", or a
 * `<script>` payload, and only learn about it after a full round trip. DIR-031 requires
 * strict input sanitization on every public lead form, so the browser now validates
 * against the SAME bounds the server enforces.
 *
 * PARITY IS STRUCTURAL, NOT ASPIRATIONAL
 * `tests/contact-form-validation.test.mjs` asserts that every bound literal in this
 * file still appears in backend/index.js. If one side is tightened without the other the
 * suite fails, so the two cannot silently diverge the way the sitemap origin did.
 *
 * Server contract mirrored verbatim:
 *   email   /^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/ and length <= 254, lowercased
 *   name    trimmed, 2 <= length <= 100
 *   message trimmed, 10 <= length <= 5000
 */
export const CONTACT_FIELD_LIMITS = Object.freeze({
  NAME_MIN: 2,
  NAME_MAX: 100,
  EMAIL_MAX: 254,
  EMAIL_LOCAL_MAX: 64,
  EMAIL_DOMAIN_MAX: 190,
  MESSAGE_MIN: 10,
  MESSAGE_MAX: 5000,
});

/** Same expression the server uses; commas and angle brackets are rejected outright. */
export const CONTACT_EMAIL_PATTERN = /^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/;

/**
 * Active-content guard applied before any length check.
 *
 * Only SCRIPT-BEARING URI schemes are neutralized, and only at a token boundary (start
 * of string or after whitespace / quote / backtick / open paren). Two deliberate
 * constraints keep this from corrupting genuine enquiries:
 *
 *  1. `<` and `>` are PRESERVED. Someone writing "I use C++ and Rust <3" must not have
 *     punctuation deleted, and stripping angle brackets would also violate the DIR-040
 *     invariant that valid prose survives sanitization intact. Markup is neutralized at
 *     the DOM sink (`sanitizePlainText`), not here.
 *  2. Bare `data:` is PRESERVED — only script-bearing media types are removed — so
 *     "data: 2024", "metadata: internal" and "data science" all survive verbatim.
 */
const SCRIPT_URI_TOKENS = /(^|[\s"'`(])((?:javascript|vbscript|livescript)\s*:|data\s*:\s*(?:text\/html|application\/xhtml|image\/svg\+xml))/gi;

export function sanitizeContactInput(value) {
  return String(value ?? '')
    // C0 controls and DEL become a space, not an empty string, so the replacement can
    // never fuse the two neighbouring words together.
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    // Only collapse the runs of spaces the control-character pass just produced; the
    // author's own interior spacing is left alone.
    .replace(/ {2,}/g, ' ')
    .replace(SCRIPT_URI_TOKENS, '$1')
    .trim();
}

/**
 * Validates one normalized form payload.
 *
 * Returns `{ valid, values, errors }` where `values` are the trimmed/lowercased fields
 * that should actually be transmitted and `errors` maps a field name to a translation
 * key. Returning both lets the caller render per-field messages without a second
 * normalization pass — which is exactly how the client and server came to disagree.
 */
export function validateContactForm({ email, name, message } = {}) {
  const values = {
    email: sanitizeContactInput(email).toLowerCase(),
    name: sanitizeContactInput(name),
    message: sanitizeContactInput(message),
  };
  const errors = {};

  if (!values.name) {
    errors.name = 'contact.error.nameRequired';
  } else if (values.name.length < CONTACT_FIELD_LIMITS.NAME_MIN || values.name.length > CONTACT_FIELD_LIMITS.NAME_MAX) {
    errors.name = 'contact.error.nameLength';
  }

  if (!values.email) {
    errors.email = 'contact.error.emailRequired';
  } else if (!CONTACT_EMAIL_PATTERN.test(values.email) || values.email.length > CONTACT_FIELD_LIMITS.EMAIL_MAX) {
    errors.email = 'contact.error.emailInvalid';
  }

  if (!values.message) {
    errors.message = 'contact.error.messageRequired';
  } else if (values.message.length < CONTACT_FIELD_LIMITS.MESSAGE_MIN || values.message.length > CONTACT_FIELD_LIMITS.MESSAGE_MAX) {
    errors.message = 'contact.error.messageLength';
  }

  return { valid: Object.keys(errors).length === 0, values, errors };
}
