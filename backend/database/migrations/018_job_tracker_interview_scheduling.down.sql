-- Roll back the DIR-020 interview scheduling / work mode extension.
DROP INDEX IF EXISTS idx_jt_user_interview ON job_tracker;
ALTER TABLE job_tracker
  DROP COLUMN IF EXISTS interview_link,
  DROP COLUMN IF EXISTS interview_format,
  DROP COLUMN IF EXISTS interview_at,
  DROP COLUMN IF EXISTS interview_round,
  DROP COLUMN IF EXISTS work_mode;
