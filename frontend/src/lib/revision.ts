/**
 * Client-side mirror of the authoritative optimistic-concurrency contract
 * implemented by `backend/services/revision.js`.
 *
 * Both sides must normalize a missing revision onto the SAME floor. Historically
 * the browser used `revision || 1` while the server used `Number(revision || 0)`,
 * so a NULL revision produced a permanent spurious 409 that refreshing could not
 * clear. Import this helper instead of writing an ad-hoc `|| 1` coercion.
 */

/** Schema-declared floor (`database/migrations/001_baseline.sql`: DEFAULT 1). */
export const REVISION_FLOOR = 1;

/** Upper bound accepted for a revision counter. */
export const REVISION_CEILING = 1_000_000;

/** Normalize a revision received from the API onto the authoritative scale. */
export function normalizeRevision(value: unknown): number {
  if (value === null || value === undefined || value === '') return REVISION_FLOOR;
  const numeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric)) return REVISION_FLOOR;
  const truncated = Math.trunc(numeric);
  if (truncated < REVISION_FLOOR) return REVISION_FLOOR;
  if (truncated > REVISION_CEILING) return REVISION_CEILING;
  return truncated;
}

/** Next revision to expect locally after a successful compare-and-set write. */
export function nextRevision(value: unknown): number {
  const current = normalizeRevision(value);
  return current >= REVISION_CEILING ? REVISION_CEILING : current + 1;
}
