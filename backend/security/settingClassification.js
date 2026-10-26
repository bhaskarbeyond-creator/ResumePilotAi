'use strict';

/**
 * Single source of truth for "is this settings field a secret?".
 *
 * ## Why this is a module and not a regex inside index.js
 *
 * Secret protection in this codebase is *name-driven*:
 *
 *   1. `preserveAdminSettingSecrets` keeps the stored value when the browser
 *      submits a blank field,
 *   2. `applyExplicitAdminSecretClears` / `materializeAdminSecretDeletes` remove
 *      a field only on an explicit clear,
 *   3. `publicAdminSettings(category, …)` strips private keys before the value
 *      is written to `public_config`, which the **unauthenticated**
 *      `GET /api/platform/public-config` serves verbatim.
 *
 * Step 3 is a confidentiality boundary. While this logic lived inline it was
 * extended only when someone remembered to; RCA-013 found the console writing
 * `twilioToken` and `recaptchaSecret`, neither of which matched the old
 * patterns, which would have published a Twilio auth token on a public endpoint
 * as soon as the settings write path started working.
 *
 * Making classification a first-class, tested module is what turns "remember to
 * add the pattern" into "the test fails if you forget". The companion test
 * `test/setting-classification.test.js` walks every allowed settings category
 * and fails on any projected key that *looks* like a credential, so a new
 * credential field cannot reach `public_config` without being classified.
 *
 * ## Contract
 *
 * `isPrivateAdminSettingKey(category, key)` is pure: no I/O, no mutation, no
 * dependency on configuration. It returns `true` when the field must never be
 * projected to a browser or to `public_config`.
 *
 * ## Deliberate exceptions
 *
 * Some keys match a credential pattern but are genuinely public client
 * identifiers (a Maps JS key is embedded in every page by design). Those are
 * listed in `PUBLIC_CLIENT_KEYS` and must be justified individually — the list
 * is small on purpose and a test asserts it stays that way.
 *
 * @module security/settingClassification
 */

const { PUBLIC_CLIENT_KEYS } = require('./settingClassification.data');

/**
 * Key patterns that denote a credential. Ordered for readability; matching is
 * case-insensitive over the whole key.
 * @type {readonly RegExp[]}
 */
const PRIVATE_KEY_PATTERNS = Object.freeze([
  /secret/i,
  /password/i,
  /passwd/i,
  /privatekey/i,
  /authtoken/i,
  /accesstoken/i,
  /refreshtoken/i,
  /clienttoken/i,
  /clientsecret/i,
  /apisecret/i,
  /serviceaccount/i,
  /merchantkey/i,
  /saltkey/i,
  /keysecret/i,
  /s3accesskeyid/i,
  /s3secretaccesskey/i,
  // Provider-key aliases that are not spelled `apiKey`: the console's older
  // `googleMapsKey` field is the same client key. Unknown `*Key` spellings are
  // withheld rather than published — over-classification is recoverable,
  // disclosure is not.
  /maps(api)?key$/i,
  /webhooksecret/i,
  /signingkey/i,
  /encryptionkey/i,
  /credentials?$/i,
  /^bearer/i,
  // Bare token fields: `twilioToken`, `authToken`, `botToken`, `verifyToken`.
  /token$/i,
  // RSA / PEM material pasted into a settings form.
  /-----BEGIN/i,
]);

/**
 * Categories whose `apiKey`-shaped fields are public by design (client-side SDKs).
 * Firebase is exempted from the generic `apiKey` rule because its web API key is
 * a public project identifier, not a credential.
 */
const API_KEY_EXEMPT_CATEGORIES = Object.freeze(['firebase']);

/**
 * Infrastructure-owned values that must not be editable from a browser because
 * they must match the container filesystem (DIV-014).
 */
const INFRASTRUCTURE_READ_ONLY = Object.freeze({
  exportPdf: Object.freeze(['websiteDomain', 'backendExportUrl', 'chromiumPath']),
});

/**
 * Does this settings field hold a credential?
 *
 * @param {string} category settings category, e.g. `'integrations'`
 * @param {string} key field name, e.g. `'twilioToken'`
 * @returns {boolean} `true` when the field must never leave the server
 */
function isPrivateAdminSettingKey(category, key) {
  const field = String(key ?? '');
  const scope = String(category ?? '');
  if (!field) return false;

  if (PUBLIC_CLIENT_KEYS.has(field)) return false;
  if (PRIVATE_KEY_PATTERNS.some(pattern => pattern.test(field))) return true;

  // Correctness fix over the legacy inline rule: the original checked the
  // firebase exemption only in the exact-match branch, so the generic `/apiKey$/`
  // rule then classified `firebase.apiKey` private anyway — contradicting its own
  // comment. Both branches now honour the exemption.
  if (field === 'apiKey' && !API_KEY_EXEMPT_CATEGORIES.includes(scope)) return true;
  if (/apiKey$/i.test(field) && !PUBLIC_CLIENT_KEYS.has(field) && !API_KEY_EXEMPT_CATEGORIES.includes(scope)) return true;

  const infrastructure = INFRASTRUCTURE_READ_ONLY[scope];
  if (infrastructure && infrastructure.includes(field)) return true;

  return false;
}

/**
 * Recursively collect every private key present in a settings object.
 * Used by the classification test and by audit redaction.
 *
 * @param {string} category
 * @param {unknown} value
 * @param {string} [prefix] dotted path prefix for reporting
 * @returns {string[]} dotted paths of private keys, sorted for stable assertions
 */
function collectPrivateKeys(category, value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPrivateAdminSettingKey(category, key)) {
      found.push(path);
      continue;
    }
    found.push(...collectPrivateKeys(category, child, path));
  }
  return found.sort();
}

/**
 * Redact a settings object for audit storage, replacing every private leaf with
 * a mask marker so that `before`/`after` snapshots never persist a credential
 * (REC-015).
 *
 * @param {string} category
 * @param {unknown} value
 * @returns {unknown} a structurally identical value with secrets masked
 */
function redactSecretsForAudit(category, value) {
  if (Array.isArray(value)) return value.map(item => redactSecretsForAudit(category, item));
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (isPrivateAdminSettingKey(category, key)) {
      output[key] = child === undefined || child === null || child === '' ? null : '••••redacted';
      continue;
    }
    output[key] = redactSecretsForAudit(category, child);
  }
  return output;
}

module.exports = {
  PRIVATE_KEY_PATTERNS,
  API_KEY_EXEMPT_CATEGORIES,
  INFRASTRUCTURE_READ_ONLY,
  isPrivateAdminSettingKey,
  collectPrivateKeys,
  redactSecretsForAudit,
};
