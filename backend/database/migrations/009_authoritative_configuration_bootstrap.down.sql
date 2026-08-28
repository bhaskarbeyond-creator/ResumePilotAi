-- Data-owner bootstrap rows are intentionally retained on structural rollback.
-- Deleting them could erase operator changes made after migration 009. A restore
-- from a verified backup is the rollback mechanism for configuration data.
SELECT 1;
