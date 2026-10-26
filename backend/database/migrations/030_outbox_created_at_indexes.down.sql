-- 030_outbox_created_at_indexes (down) — remove only the two recency indexes.
-- Outbox rows are untouched: this rollback discards an access path and nothing else.
DROP INDEX IF EXISTS idx_notification_created ON notification_outbox;
DROP INDEX IF EXISTS idx_ent_outbox_created ON enterprise_outbox;
