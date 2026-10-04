-- Roll back the DIR-024 geo-regional projection.
--
-- The indexes reference the projection columns, so they must be dropped BEFORE
-- the columns: MariaDB refuses to drop a column that a surviving index covers.
--
-- This deletes no requisition. `jobs.location` — the authoritative free-text
-- source the projection was derived from — is untouched, so a re-run of
-- 020_geo_regional_projection.sql reproduces exactly the same classification.
DROP INDEX IF EXISTS idx_jobs_region ON jobs;
DROP INDEX IF EXISTS idx_jobs_region_state ON jobs;

ALTER TABLE jobs
    DROP COLUMN IF EXISTS region_state,
    DROP COLUMN IF EXISTS region_city;
