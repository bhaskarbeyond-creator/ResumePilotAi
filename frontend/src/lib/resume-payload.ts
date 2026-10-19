/**
 * Resume write payloads (DIR-008, R-17/R-19/R-45).
 *
 * A list or GET row contains server-owned metadata (ownership, revision,
 * publication bookkeeping). Copying a whole row back into a save, rename or
 * duplicate used to let that metadata override the server's state — a rename
 * could rewind the revision, and a duplicate could inherit publication flags.
 * Only content fields are ever forwarded.
 */

export const SERVER_OWNED_RESUME_KEYS = new Set([
  'id', 'userId', 'user_id', 'ownerUid', 'owner_uid', 'revision',
  'isPublished', 'is_published', 'publicationRevision', 'publication_revision',
  'publishedAt', 'published_at', 'pbId', 'pb_id', 'publicationMode',
]);

export function resumeContentPayload<T extends Record<string, any>>(source: T): Record<string, any> {
  const payload: Record<string, any> = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (SERVER_OWNED_RESUME_KEYS.has(key)) continue;
    payload[key] = value;
  }
  return payload;
}
