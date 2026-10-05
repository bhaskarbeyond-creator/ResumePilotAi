-- DIR-026: per-participant read cursor for live unread messaging badging.
--
-- WHY THIS TABLE: `conversation_messages` is a shared, append-only log shared by
-- both sides of a conversation, so a read flag cannot live on it — "read" is a
-- property of a (participant, conversation) pair, never of a message. The
-- authoritative read state therefore belongs on `conversation_participants`,
-- which already carries the strict participant isolation boundary (INV-3): a
-- user can only ever advance the cursor for a row that names their own uid.
--
-- `last_read_message_id` is a CURSOR, not a boolean: it records the newest
-- message id this participant has consumed, so the unread count is a bounded
-- `id > last_read_message_id` range scan rather than a per-message join that
-- would degrade linearly with thread length. NULL means "nothing read yet",
-- which correctly yields an unread count equal to the whole thread for a
-- conversation that has never been opened.
--
-- The enable flag is never touched here; this migration is pure schema and is
-- inert until the /api/messages module gate (AC-4) is satisfied.
ALTER TABLE conversation_participants
  ADD COLUMN IF NOT EXISTS last_read_message_id VARCHAR(128) NULL DEFAULT NULL AFTER created_at,
  ADD COLUMN IF NOT EXISTS last_read_at BIGINT NULL DEFAULT NULL AFTER last_read_message_id;

-- Supports the unread projection: for one participant, resolve the newest
-- message newer than their cursor within their own conversations only.
CREATE INDEX IF NOT EXISTS idx_conv_participants_read
  ON conversation_participants (user_id, conversation_id, last_read_message_id);