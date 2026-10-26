-- DANGER: run only after restoring a verified pre-migration backup and rolling
-- application code back to a build that writes canonical_documents. Reconciled
-- rows are intentionally retained; dropping only revision/description metadata
-- avoids deleting content that may have been created after consolidation.

ALTER TABLE reviews
  DROP COLUMN IF EXISTS revision;

ALTER TABLE trusted_by
  DROP COLUMN IF EXISTS revision;

ALTER TABLE custom_pages
  DROP CONSTRAINT chk_custom_page_status,
  DROP COLUMN IF EXISTS revision,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS description;
