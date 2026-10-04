-- Reverse only the plain-Delhi rows introduced by this migration. Existing
-- NCR, Noida, Gurgaon/Gurugram, Faridabad, and Ghaziabad classifications from
-- migration 020 remain untouched.
UPDATE jobs
SET region_state = NULL
WHERE region_state = 'delhi'
  AND region_city IS NULL
  AND LOWER(location) LIKE '%delhi%'
  AND LOWER(location) NOT LIKE '%delhi ncr%'
  AND LOWER(location) NOT LIKE '%delhi-ncr%'
  AND LOWER(location) NOT LIKE '%new delhi%'
  AND LOWER(location) NOT LIKE '%noida%'
  AND LOWER(location) NOT LIKE '%gurgaon%'
  AND LOWER(location) NOT LIKE '%gurugram%'
  AND LOWER(location) NOT LIKE '%faridabad%'
  AND LOWER(location) NOT LIKE '%ghaziabad%';
