-- Migration 043: Automated Candidate ATS Scoring & Ranking Engine
-- Target: MariaDB 10.4+ / 11.4+
-- Implements FP-F16 (Automated Candidate Ranking & ATS Scoring Engine)

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS ats_score INT NULL DEFAULT NULL AFTER rating,
  ADD COLUMN IF NOT EXISTS ats_breakdown LONGTEXT NULL DEFAULT NULL AFTER ats_score;

CREATE INDEX IF NOT EXISTS idx_app_job_ats ON applications (job_id, ats_score);
