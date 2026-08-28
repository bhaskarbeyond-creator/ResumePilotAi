-- Roll back the job-tracker revision/order extension.
DROP INDEX IF EXISTS idx_jt_user_updated ON job_tracker;
ALTER TABLE job_tracker
  DROP COLUMN IF EXISTS sort_order,
  DROP COLUMN IF EXISTS revision;
