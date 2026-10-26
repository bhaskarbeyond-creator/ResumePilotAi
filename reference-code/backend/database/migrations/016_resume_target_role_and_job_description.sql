-- Migration 016: Add targetRole and targetJobDescription to resumes table for permanent cross-device persistence
ALTER TABLE resumes
  ADD COLUMN targetJobDescription MEDIUMTEXT NULL AFTER summary,
  ADD COLUMN targetRole VARCHAR(255) NULL AFTER occupation;
