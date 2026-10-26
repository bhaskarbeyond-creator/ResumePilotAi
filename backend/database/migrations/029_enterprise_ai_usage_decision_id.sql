-- PH4-ENGINE-022: join key from the per-request enterprise ledger to ai_routing_decisions (028).
-- Additive nullable column: every pre-existing row honestly keeps NULL (no fabricated retroactive
-- attribution, no backfill by design — schema-proposal §5). Legacy inserts stay valid (the
-- repository INSERT is column-explicit, mysqlEnterpriseRepository.js recordAiUsage).

ALTER TABLE enterprise_ai_usage
    ADD COLUMN decision_id CHAR(36) NULL,
    ADD INDEX idx_ent_ai_usage_decision (decision_id);
