-- Roll back the DIR-026 messaging read cursor.
--
-- Only the read state is removed: `conversation_messages`, `conversations` and
-- the participant membership rows themselves are authoritative product data and
-- are never touched by a down migration. Reverting therefore discards "who has
-- read what" and nothing else — no message text and no conversation is lost.
DROP INDEX IF EXISTS idx_conv_participants_read ON conversation_participants;
ALTER TABLE conversation_participants
  DROP COLUMN IF EXISTS last_read_at,
  DROP COLUMN IF EXISTS last_read_message_id;