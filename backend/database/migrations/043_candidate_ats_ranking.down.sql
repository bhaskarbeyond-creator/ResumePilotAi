-- Migration 043 Rollback: Automated Candidate ATS Scoring & Ranking Engine

DROP INDEX IF EXISTS idx_app_job_ats ON applications;

ALTER TABLE applications
  DROP COLUMN IF EXISTS ats_breakdown,
  DROP COLUMN IF EXISTS ats_score;
