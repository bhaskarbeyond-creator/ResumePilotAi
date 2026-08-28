-- Rollback only removes the validation constraint. It does not rewrite or
-- delete durable delivery evidence.
ALTER TABLE notification_outbox
  DROP CONSTRAINT chk_notification_outbox_state;
