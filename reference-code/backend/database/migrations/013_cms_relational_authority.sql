-- Consolidate custom pages, customer reviews, and trusted-organization logos
-- onto their declared relational MariaDB owners. Earlier builds accidentally
-- wrote some administrative mutations to canonical_documents while public
-- reads used these domain tables. This migration reconciles those active
-- generic documents without deleting either pre-existing relational records
-- or the legacy source rows. Runtime code quarantines the legacy entity types
-- after this migration so they cannot become an implicit fallback owner.

ALTER TABLE custom_pages
  ADD COLUMN IF NOT EXISTS description VARCHAR(500) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS revision INT UNSIGNED NOT NULL DEFAULT 1,
  ADD CONSTRAINT chk_custom_page_status CHECK (status IN ('draft', 'published', 'unpublished'));

UPDATE custom_pages
SET status = CASE WHEN published = 1 THEN 'published' ELSE 'unpublished' END
WHERE status IS NULL OR status = '' OR (status = 'published' AND published = 0);

ALTER TABLE trusted_by
  ADD COLUMN IF NOT EXISTS revision INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS revision INT UNSIGNED NOT NULL DEFAULT 1;

-- Prefer whichever representation was updated most recently when both stores
-- contain the same identifier. VALUES(updated_at) is the reconciled generic
-- document timestamp and updated_at is the existing relational timestamp.
INSERT INTO custom_pages
  (id, title, slug, description, content, published, status, nav_order, show_in_nav,
   show_in_footer, revision, created_at, updated_at)
SELECT
  cd.entity_id,
  COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.title')), ''), cd.entity_id),
  COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.slug')), ''), cd.entity_id),
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.description')), ''),
  COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.pagecontent')),
    JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.content')),
    ''
  ),
  CASE
    WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.status')), '')) = 'published' THEN 1
    WHEN JSON_EXTRACT(cd.payload, '$.published') = TRUE THEN 1
    ELSE 0
  END,
  CASE
    WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.status')), '')) IN ('draft', 'published', 'unpublished')
      THEN LOWER(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.status')))
    WHEN JSON_EXTRACT(cd.payload, '$.published') = TRUE THEN 'published'
    ELSE 'unpublished'
  END,
  COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.navOrder')) AS SIGNED), 0),
  CASE WHEN JSON_EXTRACT(cd.payload, '$.showInNav') = TRUE THEN 1 ELSE 0 END,
  CASE WHEN JSON_EXTRACT(cd.payload, '$.showInFooter') = TRUE THEN 1 ELSE 0 END,
  GREATEST(1, cd.revision),
  cd.created_at,
  cd.updated_at
FROM canonical_documents cd
WHERE cd.entity_type = 'custom_pages' AND cd.deleted_at IS NULL
ON DUPLICATE KEY UPDATE
  title = IF(VALUES(updated_at) >= custom_pages.updated_at, VALUES(title), title),
  slug = IF(VALUES(updated_at) >= custom_pages.updated_at, VALUES(slug), slug),
  description = IF(VALUES(updated_at) >= custom_pages.updated_at, VALUES(description), description),
  content = IF(VALUES(updated_at) >= custom_pages.updated_at, VALUES(content), content),
  published = IF(VALUES(updated_at) >= custom_pages.updated_at, VALUES(published), published),
  status = IF(VALUES(updated_at) >= custom_pages.updated_at, VALUES(status), status),
  nav_order = IF(VALUES(updated_at) >= custom_pages.updated_at, VALUES(nav_order), nav_order),
  show_in_nav = IF(VALUES(updated_at) >= custom_pages.updated_at, VALUES(show_in_nav), show_in_nav),
  show_in_footer = IF(VALUES(updated_at) >= custom_pages.updated_at, VALUES(show_in_footer), show_in_footer),
  revision = GREATEST(custom_pages.revision, VALUES(revision)),
  updated_at = GREATEST(custom_pages.updated_at, VALUES(updated_at));

INSERT INTO trusted_by
  (id, name, logo_url, website_url, display_order, active, revision, created_at, updated_at)
SELECT
  cd.entity_id,
  COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.name')), ''), cd.entity_id),
  COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.imageUrl')),
    JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.logoUrl')),
    ''
  ),
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.websiteUrl')), ''),
  COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.order')) AS SIGNED), 0),
  CASE WHEN JSON_EXTRACT(cd.payload, '$.published') = FALSE THEN 0 ELSE 1 END,
  GREATEST(1, cd.revision),
  cd.created_at,
  cd.updated_at
FROM canonical_documents cd
WHERE cd.entity_type = 'trusted_by' AND cd.deleted_at IS NULL
ON DUPLICATE KEY UPDATE
  name = IF(VALUES(updated_at) >= trusted_by.updated_at, VALUES(name), name),
  logo_url = IF(VALUES(updated_at) >= trusted_by.updated_at, VALUES(logo_url), logo_url),
  website_url = IF(VALUES(updated_at) >= trusted_by.updated_at, VALUES(website_url), website_url),
  display_order = IF(VALUES(updated_at) >= trusted_by.updated_at, VALUES(display_order), display_order),
  active = IF(VALUES(updated_at) >= trusted_by.updated_at, VALUES(active), active),
  revision = GREATEST(trusted_by.revision, VALUES(revision)),
  updated_at = GREATEST(trusted_by.updated_at, VALUES(updated_at));

INSERT INTO reviews
  (id, name, role, company, avatar, content, rating, featured, status,
   revision, created_at, updated_at)
SELECT
  cd.entity_id,
  COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.name')), ''), 'Anonymous'),
  COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.occupation')),
    JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.role')),
    ''
  ),
  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.company')), ''),
  COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.imageUrl')),
    JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.avatar')),
    ''
  ),
  COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.review')),
    JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.content')),
    ''
  ),
  LEAST(5, GREATEST(1, COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.rating')) AS SIGNED), 5))),
  CASE WHEN JSON_EXTRACT(cd.payload, '$.featured') = TRUE THEN 1 ELSE 0 END,
  UPPER(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cd.payload, '$.status')), ''), 'APPROVED')),
  GREATEST(1, cd.revision),
  cd.created_at,
  cd.updated_at
FROM canonical_documents cd
WHERE cd.entity_type = 'reviews' AND cd.deleted_at IS NULL
ON DUPLICATE KEY UPDATE
  name = IF(VALUES(updated_at) >= reviews.updated_at, VALUES(name), name),
  role = IF(VALUES(updated_at) >= reviews.updated_at, VALUES(role), role),
  company = IF(VALUES(updated_at) >= reviews.updated_at, VALUES(company), company),
  avatar = IF(VALUES(updated_at) >= reviews.updated_at, VALUES(avatar), avatar),
  content = IF(VALUES(updated_at) >= reviews.updated_at, VALUES(content), content),
  rating = IF(VALUES(updated_at) >= reviews.updated_at, VALUES(rating), rating),
  featured = IF(VALUES(updated_at) >= reviews.updated_at, VALUES(featured), featured),
  status = IF(VALUES(updated_at) >= reviews.updated_at, VALUES(status), status),
  revision = GREATEST(reviews.revision, VALUES(revision)),
  updated_at = GREATEST(reviews.updated_at, VALUES(updated_at));
