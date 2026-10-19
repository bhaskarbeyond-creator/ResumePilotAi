'use strict';

/**
 * DIR-008 — stateless, unguessable public share tokens.
 *
 * A published resume is addressed by `v1.<base64url(resumeId)>.<hmac>` so that
 * knowing (or enumerating) internal resume ids is never enough to read a public
 * resume. The token is an HMAC over the resume id with a server-only secret:
 *
 *  - no database column or migration is required;
 *  - tokens survive restarts and are stable across workers;
 *  - revocation is the publication state itself (unpublish ⇒ 404), and rotating
 *    the secret invalidates every outstanding link.
 *
 * Fail-closed contract: in production a dedicated secret is mandatory. Token
 * issuance throws 503 rather than falling back to a predictable value.
 */

const crypto = require('crypto');

const TOKEN_RE = /^v1\.([A-Za-z0-9_-]{1,160})\.([A-Za-z0-9_-]{22})$/;
const DEV_FALLBACK_SECRET = 'dir008-local-share-secret-not-for-production';

let cachedSecret = null;
let cachedSecretSource = null;

function resolveSecret() {
  const explicit = process.env.RESUME_SHARE_SECRET;
  if (explicit && String(explicit).length >= 16) {
    return { secret: String(explicit), source: 'RESUME_SHARE_SECRET' };
  }
  if (process.env.NODE_ENV === 'production') {
    return { secret: null, source: 'MISSING' };
  }
  const devSecret = process.env.TEST_AUTH_HMAC_SECRET || process.env.JWT_SECRET || DEV_FALLBACK_SECRET;
  return { secret: String(devSecret), source: 'DEV_FALLBACK' };
}

function getSecret() {
  if (!cachedSecret) {
    const { secret, source } = resolveSecret();
    if (!secret) {
      const error = new Error('Public share links are unavailable: RESUME_SHARE_SECRET is not configured.');
      error.code = 'SHARE_SECRET_UNAVAILABLE';
      error.status = 503;
      throw error;
    }
    cachedSecret = secret;
    cachedSecretSource = source;
  }
  return cachedSecret;
}

function _resetForTests() {
  cachedSecret = null;
  cachedSecretSource = null;
}

function secretSource() {
  return cachedSecretSource;
}

function signatureFor(resumeId, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`resume-share:v1:${resumeId}`)
    .digest('base64url')
    .slice(0, 22);
}

/** Issues a stable public token for a resume id. */
function issueShareToken(resumeId) {
  const id = String(resumeId || '');
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) {
    const error = new Error('Resume id cannot be encoded in a public share link.');
    error.code = 'SHARE_TOKEN_UNENCODABLE_ID';
    error.status = 400;
    throw error;
  }
  const secret = getSecret();
  return `v1.${Buffer.from(id, 'utf8').toString('base64url')}.${signatureFor(id, secret)}`;
}

/** Verifies a public token and returns the resume id, or null. */
function verifyShareToken(token) {
  const match = TOKEN_RE.exec(String(token || ''));
  if (!match) return null;
  let resumeId;
  try {
    resumeId = Buffer.from(match[1], 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(resumeId)) return null;
  let secret;
  try {
    secret = getSecret();
  } catch {
    return null;
  }
  const expected = Buffer.from(signatureFor(resumeId, secret), 'utf8');
  const received = Buffer.from(match[2], 'utf8');
  if (expected.length !== received.length) return null;
  return crypto.timingSafeEqual(expected, received) ? resumeId : null;
}

/** Public path used by the share UI and the anonymous viewer. */
function sharePathFor(resumeId) {
  return `/shared/${issueShareToken(resumeId)}`;
}

module.exports = {
  issueShareToken,
  verifyShareToken,
  sharePathFor,
  secretSource,
  _resetForTests,
};

/**
 * Resume fields that may be exposed on an anonymous public endpoint. Anything
 * not listed here (owner ids, revisions, publication bookkeeping, storage
 * metadata, internal flags) is dropped before the response leaves the server.
 */
const PUBLIC_RESUME_FIELDS = Object.freeze([
  'id', 'title', 'name', 'template', 'language', 'revision',
  'heading', 'summary', 'experience', 'education', 'skillCategories', 'skills',
  'certifications', 'languages', 'projects', 'achievements', 'hobbies',
  'references', 'customSections',
  // Legacy / flattened draft columns. A resume created through the older API
  // stores identity here, and a published snapshot must keep the document
  // readable. Owner and publication bookkeeping remain excluded below.
  'firstname', 'lastname', 'email', 'phone', 'occupation', 'targetRole',
  'city', 'country', 'address', 'postalcode', 'website', 'linkedin', 'github',
  'photo', 'showPhoto', 'employments', 'educations',
]);

function projectPublicResume(data) {
  const source = data && typeof data === 'object' ? data : {};
  const projected = {};
  for (const key of PUBLIC_RESUME_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) projected[key] = source[key];
  }
  // The publication snapshot must not carry the owner identity or internal ids.
  delete projected.userId;
  delete projected.user_id;
  delete projected.ownerUid;
  delete projected.isPublished;
  delete projected.pbId;
  delete projected.publicationRevision;
  if (projected.heading && typeof projected.heading === 'object') {
    projected.heading = { ...projected.heading };
    delete projected.heading.userId;
    delete projected.heading.user_id;
  }
  return projected;
}

module.exports.PUBLIC_RESUME_FIELDS = PUBLIC_RESUME_FIELDS;
module.exports.projectPublicResume = projectPublicResume;
