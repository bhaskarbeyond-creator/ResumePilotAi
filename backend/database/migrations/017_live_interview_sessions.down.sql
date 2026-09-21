-- Rollback Migration 017
-- Only run after verified backup/retention review: active interview session data will be removed.
DROP TABLE IF EXISTS live_interview_sessions;
