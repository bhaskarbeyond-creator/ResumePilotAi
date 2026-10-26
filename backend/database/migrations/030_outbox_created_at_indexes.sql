-- 030_outbox_created_at_indexes — unscoped "newest first" outbox scans need their
-- own index (query-plan regression tier).
--
-- WHY: `GET /api/platform/queues` (routes/platform.js:478,480) reads both outboxes
-- with `ORDER BY created_at DESC LIMIT ?` and no WHERE clause. The pre-existing
-- indexes are all state/tenant scoped (`idx_notification_due(state, next_attempt_at)`,
-- `idx_ent_outbox_tenant(tenantId, status, created_at)`), so neither can serve an
-- unscoped recency scan: MariaDB falls back to a full table scan plus filesort, and
-- the cost grows with the backlog — precisely when an operator is looking at the
-- queue because something is wrong.
--
-- The query-plan regression suite (test/query-plan-regression.test.js) pins this:
-- every hot query in its registry must be index-covered, and this migration is the
-- fix for the two it found uncovered.
CREATE INDEX IF NOT EXISTS idx_notification_created ON notification_outbox (created_at);
CREATE INDEX IF NOT EXISTS idx_ent_outbox_created ON enterprise_outbox (created_at);
