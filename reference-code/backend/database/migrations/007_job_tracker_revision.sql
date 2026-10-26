-- Make the MariaDB job-tracker resource revision-safe and deterministically ordered.
-- Existing rows begin at revision 1; all subsequent writes use compare-and-swap.
ALTER TABLE job_tracker
  ADD COLUMN IF NOT EXISTS revision INT UNSIGNED NOT NULL DEFAULT 1 AFTER status,
  ADD COLUMN IF NOT EXISTS sort_order INT UNSIGNED NOT NULL DEFAULT 0 AFTER revision;

CREATE INDEX IF NOT EXISTS idx_jt_user_updated
  ON job_tracker (user_id, updated_at);
