-- Deliberately non-destructive rollback.
-- Roll back the application release while retaining additive columns and queued
-- records. The enterprise_outbox table may only be dropped after proving it is
-- empty and after a separately approved, verified backup/restore drill.
SELECT COUNT(*) AS enterprise_outbox_records_requiring_retention FROM enterprise_outbox;
