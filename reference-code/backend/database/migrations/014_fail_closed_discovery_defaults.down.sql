-- Roll back only pristine bootstrap rows touched by the forward migration.
-- WARNING: this intentionally restores migration 009's historical default-ON
-- presentation flags and unevidenced rating and is not recommended for service
-- operation; it exists solely as a reproducible schema/data rollback.

UPDATE system_settings
SET data = JSON_SET(
  data,
  '$.modules.atsChecker', JSON_EXTRACT('true', '$'),
  '$.modules.resumeImport', JSON_EXTRACT('false', '$'),
  '$.modules.aiAssistant', JSON_EXTRACT('true', '$'),
  '$.modules.coverLetter', JSON_EXTRACT('true', '$'),
  '$.modules.blog', JSON_EXTRACT('true', '$'),
  '$.modules.jobs', JSON_EXTRACT('true', '$'),
  '$.modules.jobTracker', JSON_EXTRACT('false', '$'),
  '$.modules.portfolio', JSON_EXTRACT('false', '$'),
  '$.modules.review', JSON_EXTRACT('true', '$'),
  '$.modules.contact', JSON_EXTRACT('true', '$'),
  '$.modules.subscriptions', JSON_EXTRACT('false', '$'),
  '$.modules.enableGoogleAuthModule', JSON_EXTRACT('true', '$'),
  '$.modules.enableGoogle', JSON_EXTRACT('true', '$'),
  '$.modules.enableFacebookAuthModule', JSON_EXTRACT('true', '$'),
  '$.modules.enableFacebook', JSON_EXTRACT('true', '$'),
  '$.modules.enableImportModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableCouponsModule', JSON_EXTRACT('true', '$'),
  '$.modules.enableJobScraperModule', JSON_EXTRACT('true', '$'),
  '$.modules.enablePortfolioModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableMessagesModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableJobTrackerModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableAppliedJobsModule', JSON_EXTRACT('false', '$'),
  '$.modules.enableCoverLetterModule', JSON_EXTRACT('true', '$'),
  '$.modules.enableAiSuggestionsModule', JSON_EXTRACT('true', '$'),
  '$.modules.enableAtsScoreModule', JSON_EXTRACT('true', '$'),
  '$.modules.enablePublicSharingModule', JSON_EXTRACT('true', '$'),
  '$.modules.enableSalesTaxModule', JSON_EXTRACT('true', '$'),
  '$.geoSeo.enableGeoSeo', JSON_EXTRACT('true', '$'),
  '$.geoSeo.enableJobPostingSchema', JSON_EXTRACT('true', '$'),
  '$.geoSeo.enableOrganizationSchema', JSON_EXTRACT('true', '$'),
  '$.llmGeo', JSON_OBJECT(
    'enableLlmGeo', JSON_EXTRACT('true', '$'),
    'aiModelOptimization', 'ChatGPT, Perplexity, Gemini, Claude',
    'llmsTxtContent', '',
    'allowGptBot', JSON_EXTRACT('true', '$'),
    'allowClaudeBot', JSON_EXTRACT('true', '$'),
    'allowGeminiBot', JSON_EXTRACT('true', '$'),
    'llmCitationPrompt', ''
  )
),
updated_at = CURRENT_TIMESTAMP
WHERE category = 'public_config'
  AND revision = 0;

UPDATE system_settings
SET data = JSON_SET(data, '$.rating', 5),
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'website_meta'
  AND revision = 0;
