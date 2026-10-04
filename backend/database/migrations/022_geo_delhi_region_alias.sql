-- DIR-024: classify plain "Delhi" locations that the original regional
-- projection did not include. Existing non-null classifications take
-- precedence, preserving the ordered multi-region backfill in migration 020.
-- No posting is inserted or otherwise changed.
UPDATE jobs
SET region_state = 'delhi'
WHERE region_state IS NULL
  AND LOWER(location) LIKE '%delhi%';
