-- Structural rollback only. Scrubbed legacy plaintext mail credentials are not
-- restored; restoring secrets from schema rollback would violate the ownership
-- and encryption boundary.
DROP INDEX IF EXISTS idx_sec_request ON security_audit_logs;
DROP INDEX IF EXISTS idx_sec_category_created ON security_audit_logs;
ALTER TABLE security_audit_logs
  DROP COLUMN IF EXISTS user_agent,
  DROP COLUMN IF EXISTS ip_address,
  DROP COLUMN IF EXISTS status_code,
  DROP COLUMN IF EXISTS pathname,
  DROP COLUMN IF EXISTS method,
  DROP COLUMN IF EXISTS outcome,
  DROP COLUMN IF EXISTS actor_role,
  DROP COLUMN IF EXISTS actor_email;

DROP INDEX IF EXISTS idx_portfolios_public ON portfolios;
DROP INDEX IF EXISTS uq_portfolios_slug ON portfolios;
ALTER TABLE portfolios
  DROP COLUMN IF EXISTS published_at,
  DROP COLUMN IF EXISTS revision,
  DROP COLUMN IF EXISTS slug;
