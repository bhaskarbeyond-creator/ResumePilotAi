-- Constrain the durable notification lifecycle to states implemented by the
-- enqueue, lease, retry, terminal-delivery, cancellation, and DLQ paths.
-- This intentionally fails closed when historical rows contain an unknown
-- value; operators must investigate rather than silently relabel evidence.
ALTER TABLE notification_outbox
  ADD CONSTRAINT chk_notification_outbox_state
  CHECK (state IN (
    'NOTIFICATION_QUEUED',
    'DELIVERY_ATTEMPTED',
    'RETRYING',
    'DELIVERED',
    'DEAD_LETTER',
    'CANCELLED'
  ));
