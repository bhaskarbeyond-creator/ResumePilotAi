-- Reverse of 033_enterprise_tenant_quotas.sql
-- Dropping the columns also drops the unique index that covers custom_domain,
-- so the index is removed explicitly first to keep the rollback deterministic
-- on deployments where the index was created separately.
DROP INDEX IF EXISTS uq_ent_tenant_domain ON enterprise_tenants;
ALTER TABLE enterprise_tenants
  DROP COLUMN IF EXISTS custom_domain,
  DROP COLUMN IF EXISTS monthly_ai_credits,
  DROP COLUMN IF EXISTS seat_quota;
