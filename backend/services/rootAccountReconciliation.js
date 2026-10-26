'use strict';

/**
 * Reconciliation between the identity provider's claims and the platform's own records.
 *
 * ## Why this exists (REC-026)
 *
 * Root authority lives in two places at once and neither is authoritative on its own:
 *
 *  - **Firebase custom claims** (`role: 'SUPER_ADMIN'`) are what a token carries, and they are
 *    minted out of band — the Firebase console, a provisioning script, an operator with the
 *    service account. Nothing in this repository observes that act.
 *  - **`admin_user_roles`** is what `services/adminRbac.js` resolves, and it is the record the
 *    RBAC administration API and the audit trail describe.
 *
 * The two can therefore disagree, in either direction, and the disagreement is a security
 * event:
 *
 *  - a claim with no grant is authority the platform cannot revoke through its own API;
 *  - a grant with no claim is a revocation that did not take effect, or an elevation that
 *    never landed.
 *
 * Neither shows up as an error. Both show up here as a named mismatch.
 *
 * ## Design
 *
 * `attest()` is pure: it takes the two lists and returns a report. No I/O, no clock beyond the
 * one passed in, so every rule below is a unit test rather than an integration guess. The
 * route that gathers the lists is `GET /api/platform/operators/attestation` and it is
 * SUPER_ADMIN-only by the manifest rule `platform-operators` (permission `*`).
 *
 * ## What "root" means here
 *
 * Accounts whose claim **or** grant resolves to SUPER_ADMIN. A grant-only root is included
 * deliberately: it is exactly the case an attestation built from identity data alone cannot see.
 *
 * @module services/rootAccountReconciliation
 */

/** Every mismatch this module can report, with the operator action each one implies. */
const MISMATCH = Object.freeze({
  CLAIM_WITHOUT_GRANT: 'CLAIM_WITHOUT_GRANT',
  GRANT_WITHOUT_CLAIM: 'GRANT_WITHOUT_CLAIM',
  ROOT_WITHOUT_MFA: 'ROOT_WITHOUT_MFA',
  ROOT_UNVERIFIED_EMAIL: 'ROOT_UNVERIFIED_EMAIL',
  ROOT_SUSPENDED: 'ROOT_SUSPENDED',
});

/** What to do about each kind, in the order they should be handled. */
const REMEDIATION = Object.freeze({
  [MISMATCH.CLAIM_WITHOUT_GRANT]: 'Grant the role through POST /api/admin/rbac/grants/:uid/:role (audited), or remove the claim in the identity provider. A claim cannot be revoked from this platform.',
  [MISMATCH.GRANT_WITHOUT_CLAIM]: 'The token does not carry the authority the platform records. Re-issue the claim, or revoke the grant through DELETE /api/admin/rbac/grants/:uid/:role (audited).',
  [MISMATCH.ROOT_WITHOUT_MFA]: 'Root with no enrolled second factor. Enrol MFA before the next release; this is a release blocker, not a backlog item.',
  [MISMATCH.ROOT_UNVERIFIED_EMAIL]: 'Root whose email is unverified. Verify or remove; an unverified address is an unowned credential.',
  [MISMATCH.ROOT_SUSPENDED]: 'A suspended identity still holds root. Suspension must imply revocation; treat as an incident.',
});

/**
 * Normalise anything role-shaped to an upper-case role name.
 * @param {unknown} value
 * @returns {string}
 */
function roleOf(value) {
  return String(value ?? '').trim().toUpperCase();
}

/**
 * Build the attestation report.
 *
 * @param {object} input
 * @param {Array<{uid: string, email?: string|null, role?: string, mfaEnrolled?: boolean,
 *   emailVerified?: boolean, suspended?: boolean}>} [input.claims]
 *   Accounts as the identity provider reports them, with the role from their custom claims.
 * @param {Array<{uid: string, role: string}>} [input.grants]
 *   Rows from the platform's own grant store (`admin_user_roles`).
 * @param {Date} [input.now] injectable clock, so `checkedAt` is assertable
 * @returns {{checkedAt: string, roots: Array<object>, mismatches: Array<object>,
 *   summary: {roots: number, claims: number, grants: number, mismatched: number, byKind: Record<string, number>}}}
 */
function attest({ claims = [], grants = [], now = new Date() } = {}) {
  const claimByUid = new Map();
  for (const account of claims) {
    const uid = String(account?.uid || '').trim();
    if (!uid) continue;
    claimByUid.set(uid, {
      uid,
      email: account.email ? String(account.email) : null,
      role: roleOf(account.role || account.claims?.role),
      mfaEnrolled: account.mfaEnrolled === true,
      emailVerified: account.emailVerified === true,
      suspended: account.suspended === true,
    });
  }

  /** @type {Map<string, Set<string>>} uid → the set of roles the platform records */
  const grantRoles = new Map();
  for (const grant of grants) {
    const uid = String(grant?.uid || '').trim();
    const role = roleOf(grant?.role);
    if (!uid || !role) continue;
    if (!grantRoles.has(uid)) grantRoles.set(uid, new Set());
    grantRoles.get(uid).add(role);
  }

  const uids = new Set([...claimByUid.keys(), ...grantRoles.keys()]);
  const mismatches = [];
  const roots = [];

  for (const uid of [...uids].sort()) {
    const claim = claimByUid.get(uid) || null;
    const roles = grantRoles.get(uid) || new Set();
    const claimIsRoot = claim?.role === 'SUPER_ADMIN';
    const grantIsRoot = roles.has('SUPER_ADMIN');

    const findings = [];
    if (claimIsRoot && !grantIsRoot) findings.push(MISMATCH.CLAIM_WITHOUT_GRANT);
    if (grantIsRoot && !claimIsRoot) findings.push(MISMATCH.GRANT_WITHOUT_CLAIM);
    if (claimIsRoot || grantIsRoot) {
      // The three identity properties are checked only for root: they are the ones whose
      // absence turns an account into a usable, unowned back door.
      if (claim && !claim.mfaEnrolled) findings.push(MISMATCH.ROOT_WITHOUT_MFA);
      if (claim && !claim.emailVerified) findings.push(MISMATCH.ROOT_UNVERIFIED_EMAIL);
      if (claim && claim.suspended) findings.push(MISMATCH.ROOT_SUSPENDED);
      roots.push({
        uid,
        email: claim?.email ?? null,
        claimRole: claim?.role ?? null,
        grantRoles: [...roles].sort(),
        mfaEnrolled: claim ? claim.mfaEnrolled : null,
        emailVerified: claim ? claim.emailVerified : null,
        suspended: claim ? claim.suspended : null,
        findings,
        // A root the identity provider has never heard of cannot be authenticating at all;
        // it is reported, never silently treated as fine.
        presentInIdentity: Boolean(claim),
      });
    }
    for (const kind of findings) {
      mismatches.push({
        uid,
        kind,
        detail: describe(kind, { claim, roles: [...roles].sort() }),
        remediation: REMEDIATION[kind],
      });
    }
  }

  const byKind = {};
  for (const kind of Object.values(MISMATCH)) byKind[kind] = 0;
  for (const mismatch of mismatches) byKind[mismatch.kind] += 1;

  return {
    checkedAt: now.toISOString(),
    roots,
    mismatches,
    summary: {
      roots: roots.length,
      claims: claimByUid.size,
      grants: grantRoles.size,
      mismatched: new Set(mismatches.map(mismatch => mismatch.uid)).size,
      byKind,
    },
  };
}

/**
 * One sentence an operator can act on without reading this file.
 * @param {string} kind
 * @param {{claim: object|null, roles: string[]}} context
 * @returns {string}
 */
function describe(kind, context) {
  const uid = context.claim?.uid || 'this account';
  switch (kind) {
    case MISMATCH.CLAIM_WITHOUT_GRANT:
      return `${uid} carries the SUPER_ADMIN claim but has no SUPER_ADMIN grant in admin_user_roles (grants: ${context.roles.join(', ') || 'none'}).`;
    case MISMATCH.GRANT_WITHOUT_CLAIM:
      return `${uid} holds a SUPER_ADMIN grant but the identity provider does not report the claim (claim role: ${context.claim?.role || 'none'}).`;
    case MISMATCH.ROOT_WITHOUT_MFA:
      return `${uid} is root with no enrolled second factor.`;
    case MISMATCH.ROOT_UNVERIFIED_EMAIL:
      return `${uid} is root with an unverified email address.`;
    case MISMATCH.ROOT_SUSPENDED:
      return `${uid} is disabled in the identity provider but still holds root.`;
    default:
      return `${uid}: ${kind}`;
  }
}

module.exports = { MISMATCH, REMEDIATION, attest, describe };
