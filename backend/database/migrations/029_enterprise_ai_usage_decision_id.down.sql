-- Rollback: drop the join column and its index. Loses at most post-028 join
-- keys; enterprise_ai_usage money/token data is untouched (additive column).

ALTER TABLE enterprise_ai_usage DROP INDEX idx_ent_ai_usage_decision, DROP COLUMN decision_id;
