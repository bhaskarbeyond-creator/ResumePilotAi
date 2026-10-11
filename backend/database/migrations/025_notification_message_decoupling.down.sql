-- Roll back the DIR-072 notification/message decoupling.
--
-- This migration is a DATA-ONLY, non-destructive read-state change: it advanced
-- `is_read` on legacy `type='message'` rows. Reversing it would require
-- fabricating "unread" state that the product no longer has a reason to show, and
-- the schema itself is unchanged, so the down migration is intentionally a no-op.
--
-- Nothing is dropped and no row is deleted: `notifications` keeps every legacy
-- message row, exactly as before the up migration ran.
SELECT 1;
