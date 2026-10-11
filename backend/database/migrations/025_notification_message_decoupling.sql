-- DIR-072: decouple the direct-chat pipeline from the system notification feed.
--
-- WHY THIS MIGRATION EXISTS
--   Before DIR-072 every `/api/messages/send` ALSO inserted a `type='message'`
--   row into `notifications`, keyed by the generated message id. Because the
--   event id embedded the message id, each individual chat message became its
--   own unread notification, so a single thread left the candidate bell stuck at
--   a large, monotonically-growing number of identical "New message" rows.
--
--   The producer is now decoupled (backend/index.js no longer writes a
--   notification for a chat message). This migration cleans up the LEGACY rows
--   that the old producer left behind.
--
-- SAFETY CONTRACT (non-destructive by construction)
--   * No row is ever removed: this file contains only an UPDATE. Every legacy
--     row is retained for audit; only its read flag is advanced.
--   * Scoped to `type = 'message'` AND `is_read = 0`, so a genuinely-unread
--     system notification (application, interview, payment, security) is never
--     touched.
--   * Idempotent: re-running matches zero rows once every message row is read.
UPDATE notifications
   SET is_read = 1,
       updated_at = CURRENT_TIMESTAMP
 WHERE type = 'message'
   AND is_read = 0;
