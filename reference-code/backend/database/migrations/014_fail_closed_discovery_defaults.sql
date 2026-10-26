-- Supersede unsafe clean-state presentation defaults introduced by migration 009.
-- Operator-modified configuration is never overwritten: the root revision moves
-- above zero on the first audited settings write. Runtime validation separately
-- fails closed for unsupported legacy llms.txt content on upgraded databases.

UPDATE system_settings
SET data = JSON_SET(
  JSON_REMOVE(
    data,
    '$.modules.atsChecker',
    '$.modules.resumeImport',
    '$.modules.aiAssistant',
    '$.modules.coverLetter',
    '$.modules.blog',
    '$.modules.jobs',
    '$.modules.jobTracker',
    '$.modules.portfolio',
    '$.modules.review',
    '$.modules.contact',
    '$.modules.subscriptions'
  ),
  '$.modules.enableGoogleAuthModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableGoogle', JSON_EXTRACT('false', '$'),
  '$.modules.enableFacebookAuthModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableFacebook', JSON_EXTRACT('false', '$'),
  '$.modules.enableImportModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableCouponsModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableJobScraperModule', JSON_EXTRACT('false', '$'),
  '$.modules.enablePortfolioModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableMessagesModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableJobTrackerModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableAppliedJobsModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableCoverLetterModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableAiSuggestionsModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableAtsScoreModule', JSON_EXTRACT('false', '$'),
  '$.modules.enablePublicSharingModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableSalesTaxModule', JSON_EXTRACT('false', '$'),
  '$.geoSeo.enableGeoSeo', JSON_EXTRACT('false', '$'),
  '$.geoSeo.enableJobPostingSchema', JSON_EXTRACT('false', '$'),
  '$.geoSeo.enableOrganizationSchema', JSON_EXTRACT('false', '$'),
  '$.llmGeo', JSON_OBJECT(
    'enableLlmGeo', JSON_EXTRACT('false', '$'),
    'llmsTxtContent', ''
  )
),
updated_at = CURRENT_TIMESTAMP
WHERE category = 'public_config'
  AND revision = 0;

-- Migration 009 seeded an unevidenced five-star value. On a pristine row it is
-- metadata, not a customer-derived rating, so remove it rather than publishing
-- or presenting it as an observed fact.
UPDATE system_settings
SET data = JSON_REMOVE(data, '$.rating'),
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'website_meta'
  AND revision = 0;
