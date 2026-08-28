-- Single-owner runtime hardening.
-- MariaDB 11.4+ is the supported production target.

-- Portfolio publication needs an owner-scoped optimistic revision and a stable,
-- unique public route. Existing records remain private until explicitly
-- republished through the revisioned API.
ALTER TABLE portfolios
  ADD COLUMN IF NOT EXISTS slug VARCHAR(180) NULL AFTER title,
  ADD COLUMN IF NOT EXISTS revision BIGINT UNSIGNED NOT NULL DEFAULT 1 AFTER is_published,
  ADD COLUMN IF NOT EXISTS published_at DATETIME(3) NULL AFTER revision;

CREATE UNIQUE INDEX IF NOT EXISTS uq_portfolios_slug ON portfolios (slug);
CREATE INDEX IF NOT EXISTS idx_portfolios_public ON portfolios (is_published, slug);

-- Preserve non-secret legacy mail settings only when the dedicated owner does
-- not yet exist. Plaintext legacy credential fields are deliberately stripped;
-- an operator must re-enter them so the application can persist an encrypted
-- envelope under email_runtime.
INSERT IGNORE INTO system_settings (category, data, revision, updated_at)
SELECT
  'email_runtime',
  JSON_OBJECT(
    'smtp', COALESCE((SELECT JSON_REMOVE(data, '$.password', '$.pass') FROM system_settings WHERE category = 'smtp' LIMIT 1), JSON_OBJECT()),
    'fallbackSmtp', COALESCE((SELECT JSON_REMOVE(data, '$.password', '$.pass') FROM system_settings WHERE category = 'fallback_smtp' LIMIT 1), JSON_OBJECT()),
    'imap', COALESCE((SELECT JSON_REMOVE(data, '$.password', '$.pass') FROM system_settings WHERE category = 'imap' LIMIT 1), JSON_OBJECT()),
    'enabledTemplates', COALESCE((SELECT data FROM system_settings WHERE category = 'enabled_templates' LIMIT 1), JSON_OBJECT()),
    'customTemplates', JSON_OBJECT()
  ),
  1,
  CURRENT_TIMESTAMP
FROM DUAL
WHERE EXISTS (
  SELECT 1 FROM system_settings
  WHERE category IN ('smtp', 'fallback_smtp', 'imap', 'enabled_templates', 'email_templates')
);

-- Obsolete generic owners are removed after the safe projection above. This is
-- a credential scrub, not a reversible copy of historic plaintext secrets.
DELETE FROM system_settings
WHERE category IN ('smtp', 'fallback_smtp', 'imap', 'enabled_templates', 'email_templates');

-- Security audits need request/actor context for incident reconstruction.
ALTER TABLE security_audit_logs
  ADD COLUMN IF NOT EXISTS actor_email VARCHAR(255) NULL AFTER actor_uid,
  ADD COLUMN IF NOT EXISTS actor_role VARCHAR(64) NULL AFTER actor_email,
  ADD COLUMN IF NOT EXISTS outcome VARCHAR(32) NOT NULL DEFAULT 'SUCCESS' AFTER severity,
  ADD COLUMN IF NOT EXISTS method VARCHAR(16) NULL AFTER outcome,
  ADD COLUMN IF NOT EXISTS pathname VARCHAR(512) NULL AFTER method,
  ADD COLUMN IF NOT EXISTS status_code INT NULL AFTER pathname,
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64) NULL AFTER status_code,
  ADD COLUMN IF NOT EXISTS user_agent VARCHAR(512) NULL AFTER ip_address;

CREATE INDEX IF NOT EXISTS idx_sec_category_created ON security_audit_logs (category, created_at);
CREATE INDEX IF NOT EXISTS idx_sec_request ON security_audit_logs (request_id);
