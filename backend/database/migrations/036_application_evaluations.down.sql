-- Reverse of 036_application_evaluations.sql
-- The legacy `applications.rating` / `applications.notes` columns are NOT touched:
-- they existed before this migration and remain the compatibility contract.
DROP TABLE IF EXISTS application_evaluations;
