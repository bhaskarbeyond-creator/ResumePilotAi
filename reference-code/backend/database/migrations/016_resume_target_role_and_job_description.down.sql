-- Rollback Migration 016
ALTER TABLE resumes
  DROP COLUMN targetJobDescription,
  DROP COLUMN targetRole;
