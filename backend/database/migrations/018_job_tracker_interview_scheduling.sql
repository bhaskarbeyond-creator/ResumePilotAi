-- DIR-020: interview scheduling + work mode for the candidate Kanban pipeline.
-- Single-table persistence is deliberate: keeping these columns on `job_tracker`
-- preserves the optimistic `revision` compare-and-swap, makes a stage transition
-- into 'interview' atomic with its interview details, and avoids cross-table lock
-- contention. The canonical `status` enum stays untouched
-- (wishlist | applied | interview | offer | rejected) so every existing candidate
-- row keeps working; only the Kanban DISPLAY label for `rejected` is 'Archived'.
--
-- `salary`, `date_applied`, `contact_person` and `contact_email` already exist on
-- the baseline table (001) and are adopted as-is by the application layer.
ALTER TABLE job_tracker
  ADD COLUMN IF NOT EXISTS work_mode VARCHAR(32) NULL DEFAULT 'Remote' AFTER location,
  ADD COLUMN IF NOT EXISTS interview_round VARCHAR(64) NULL AFTER deadline,
  ADD COLUMN IF NOT EXISTS interview_at DATETIME(3) NULL DEFAULT NULL AFTER interview_round,
  ADD COLUMN IF NOT EXISTS interview_format VARCHAR(32) NULL AFTER interview_at,
  ADD COLUMN IF NOT EXISTS interview_link VARCHAR(1024) NULL AFTER interview_format;

-- Supports the upcoming-interview lookup that powers the scheduler reminders.
CREATE INDEX IF NOT EXISTS idx_jt_user_interview
  ON job_tracker (user_id, interview_at);
