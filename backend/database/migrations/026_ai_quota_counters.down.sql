-- DIR-106 rollback — drop the shared organization quota counter and the
-- additive tenant attribution columns on `ai_usage`.
--
-- `ai_usage` rows themselves are NOT deleted: dropping the columns only removes
-- the attribution metadata, so usage history survives a rollback.

DROP TABLE IF EXISTS ai_quota_counters;

DROP INDEX IF EXISTS idx_ai_usage_tenant_day ON ai_usage;

ALTER TABLE ai_usage
  DROP COLUMN IF EXISTS scope,
  DROP COLUMN IF EXISTS tenant_id;
