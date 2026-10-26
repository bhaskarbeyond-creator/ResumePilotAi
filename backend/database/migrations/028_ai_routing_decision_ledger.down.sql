-- Rollback: remove the AI routing decision ledger (observability data only —
-- quota, billing and audit trails are unaffected by design).

DROP TABLE IF EXISTS ai_routing_decisions;
