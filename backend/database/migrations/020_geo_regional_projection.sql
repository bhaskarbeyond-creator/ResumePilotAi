-- DIR-024: geo-regional projection for the Indian career hubs (AC-1).
--
-- WHY THIS EXISTS
-- ---------------
-- `jobs.location` is free-text VARCHAR(255) written by employers ("Bengaluru,
-- India (Hybrid)", "Bangalore, Karnataka, India"). AC-1 requires regional hubs
-- that filter, count, and benchmark by city and state. Two options existed:
--
--   (a) LIKE-match the free-text column on every request.
--   (b) Persist a normalised projection and index it.
--
-- (a) cannot be indexed, forces a table scan per crawler hit, and makes the
-- result depend on alias ordering. (b) is deterministic and indexable. The
-- columns below are therefore a DERIVED PROJECTION of data already in the row,
-- never a new fact and never a new row.
--
-- INV-2 / BLOCKER 1 RULING
-- ------------------------
-- This migration inserts ZERO requisitions. It only classifies rows that
-- already exist. A row whose location matches no known Indian region keeps NULL
-- in both columns, and the frontend renders an explicit empty state for it. The
-- five non-Bengaluru AC-1 hubs therefore stay honestly empty until an employer
-- actually posts there, which is exactly what the Lead ruled.
--
-- DETERMINISM
-- -----------
-- The backfill uses an ordered CASE expression. Ordering matters: "Bengaluru"
-- and "Bangalore" are one city, and the more specific "Delhi NCR" grouping must
-- be evaluated before any generic "Delhi" grouping, or a NCR row would be
-- attributed to the wrong state. The precedence below is the reviewed order and
-- must not be reordered without re-verifying the projection.

ALTER TABLE jobs
    ADD COLUMN region_city VARCHAR(64) NULL AFTER location,
    ADD COLUMN region_state VARCHAR(64) NULL AFTER region_city;

-- Ordered, deterministic backfill from the existing free-text location string.
-- A region is only assigned when a token is actually present in the data.
UPDATE jobs SET
    region_city = CASE
        WHEN LOWER(location) LIKE '%bengaluru%' OR LOWER(location) LIKE '%bangalore%' THEN 'bengaluru'
        WHEN LOWER(location) LIKE '%hyderabad%' OR LOWER(location) LIKE '%secunderabad%' OR LOWER(location) LIKE '%hitec city%' THEN 'hyderabad'
        WHEN LOWER(location) LIKE '%pune%' OR LOWER(location) LIKE '%pimpri-chinchwad%' THEN 'pune'
        WHEN LOWER(location) LIKE '%mumbai%' OR LOWER(location) LIKE '%bombay%' THEN 'mumbai'
        WHEN LOWER(location) LIKE '%delhi ncr%' OR LOWER(location) LIKE '%delhi-ncr%' OR LOWER(location) LIKE '%new delhi%' OR LOWER(location) LIKE '%noida%' OR LOWER(location) LIKE '%gurgaon%' OR LOWER(location) LIKE '%gurugram%' THEN 'delhi-ncr'
        WHEN LOWER(location) LIKE '%chennai%' OR LOWER(location) LIKE '%madras%' THEN 'chennai'
        ELSE NULL
    END,
    region_state = CASE
        WHEN LOWER(location) LIKE '%karnataka%' OR LOWER(location) LIKE '%bengaluru%' OR LOWER(location) LIKE '%bangalore%' THEN 'karnataka'
        WHEN LOWER(location) LIKE '%telangana%' OR LOWER(location) LIKE '%hyderabad%' OR LOWER(location) LIKE '%secunderabad%' OR LOWER(location) LIKE '%hitec city%' THEN 'telangana'
        WHEN LOWER(location) LIKE '%maharashtra%' OR LOWER(location) LIKE '%mumbai%' OR LOWER(location) LIKE '%bombay%' OR LOWER(location) LIKE '%pune%' OR LOWER(location) LIKE '%pimpri-chinchwad%' OR LOWER(location) LIKE '%nagpur%' THEN 'maharashtra'
        WHEN LOWER(location) LIKE '%delhi ncr%' OR LOWER(location) LIKE '%delhi-ncr%' OR LOWER(location) LIKE '%new delhi%' OR LOWER(location) LIKE '%noida%' OR LOWER(location) LIKE '%gurgaon%' OR LOWER(location) LIKE '%gurugram%' OR LOWER(location) LIKE '%faridabad%' OR LOWER(location) LIKE '%ghaziabad%' THEN 'delhi'
        WHEN LOWER(location) LIKE '%tamil nadu%' OR LOWER(location) LIKE '%chennai%' OR LOWER(location) LIKE '%madras%' OR LOWER(location) LIKE '%coimbatore%' THEN 'tamil-nadu'
        ELSE NULL
    END;

-- The regional hub queries are always additionally bounded by
-- LOWER(status) = 'active' AND (expires_at IS NULL OR expires_at > NOW()),
-- so these composite indexes lead with the projection columns and still serve
-- the expiry filter from the index tail instead of a filesort.
CREATE INDEX IF NOT EXISTS idx_jobs_region ON jobs (region_city, status, expires_at, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_region_state ON jobs (region_state, status, expires_at, created_at);
