'use strict';

/**
 * Authoritative optimistic-concurrency (revision) contract.
 *
 * ROOT CAUSE ADDRESSED
 * --------------------
 * `database/migrations/001_baseline.sql` declares `revision INT NOT NULL DEFAULT 1`
 * and `services/liveInterviewSession.js` enforced `revision >= 1`, so 1 is the
 * domain floor. Meanwhile 54 backend call sites coerced a missing/NULL revision
 * with `Number(x.revision || 0)` (floor 0) while frontend clients coerced the
 * same value with `revision || 1` (floor 1).
 *
 * For any row whose revision is NULL/absent (legacy rows predating the column,
 * or repository projections that omit it) the server therefore computed
 * `currentRevision = 0` while the client sent `expectedRevision = 1`, and every
 * compare-and-set guard rejected the write with a spurious 409
 * (`CAS_CONFLICT` / `APPLICATION_CHANGED`). Refreshing could never clear it,
 * because the client re-applied the same `|| 1` coercion to the same projected 0.
 *
 * This module is the single source of truth for that normalization so the read
 * projection, the CAS guards and the increment arithmetic can never diverge
 * again. It is intentionally dependency-free and side-effect free.
 */

/** Schema-declared floor for a revision counter (`001_baseline.sql`). */
const REVISION_FLOOR = 1;

/** Upper bound accepted for a revision counter (guards against overflow/garbage). */
const REVISION_CEILING = 1_000_000;

/**
 * Normalize any stored or transmitted revision onto the authoritative scale.
 * Absent, non-numeric, out-of-range or sub-floor values collapse to the floor
 * rather than to 0, which is what made client and server disagree.
 *
 * @param {unknown} value
 * @returns {number} integer in [REVISION_FLOOR, REVISION_CEILING]
 */
function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return REVISION_FLOOR;
  const numeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric)) return REVISION_FLOOR;
  const truncated = Math.trunc(numeric);
  if (truncated < REVISION_FLOOR) return REVISION_FLOOR;
  if (truncated > REVISION_CEILING) return REVISION_CEILING;
  return truncated;
}

/**
 * Next revision after a successful compare-and-set write.
 * @param {unknown} value current stored revision
 * @returns {number}
 */
function nextRevision(value) {
  const current = normalizeRevision(value);
  return current >= REVISION_CEILING ? REVISION_CEILING : current + 1;
}

/**
 * Compare-and-set predicate used by every optimistic-concurrency guard.
 * Both operands are normalized with the same rule, so a client that echoes the
 * revision it was given always matches, and a NULL/absent stored revision no
 * longer mismatches a client-side floor of 1.
 *
 * @param {unknown} storedRevision revision currently persisted
 * @param {unknown} expectedRevision revision asserted by the caller
 * @returns {boolean}
 */
function isSameRevision(storedRevision, expectedRevision) {
  return normalizeRevision(storedRevision) === normalizeRevision(expectedRevision);
}

module.exports = {
  REVISION_FLOOR,
  REVISION_CEILING,
  normalizeRevision,
  nextRevision,
  isSameRevision,
};
