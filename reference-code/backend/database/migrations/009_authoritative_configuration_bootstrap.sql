-- Establish MariaDB-owned clean-state platform configuration.
-- Missing safe fields are backfilled while existing operator values win every
-- merge; upgrades never overwrite operator configuration or credentials.
--
-- Migrate the retired monolithic `subscriptions` setting before installing the
-- clean-state baseline. Runtime code never reads that legacy category. Secrets
-- move only into the server-only provider record; the public projection has all
-- secret-shaped keys removed. Existing split-store values win every merge.
INSERT IGNORE INTO system_settings (category, data, revision, updated_at)
SELECT
  'payment_providers',
  JSON_OBJECT(
    'stripe', JSON_OBJECT('secretKey', JSON_UNQUOTE(JSON_EXTRACT(data, '$.stripeSecretKey'))),
    'paypal', JSON_OBJECT(
      'clientId', JSON_UNQUOTE(JSON_EXTRACT(data, '$.paypalClientId')),
      'clientSecret', JSON_UNQUOTE(JSON_EXTRACT(data, '$.paypalClientSecret'))
    ),
    'razorpay', JSON_OBJECT(
      'keyId', JSON_UNQUOTE(JSON_EXTRACT(data, '$.razorpayKeyId')),
      'keySecret', JSON_UNQUOTE(JSON_EXTRACT(data, '$.razorpayKeySecret'))
    ),
    'paytm', JSON_OBJECT(
      'mid', JSON_UNQUOTE(JSON_EXTRACT(data, '$.paytmMid')),
      'merchantKey', JSON_UNQUOTE(JSON_EXTRACT(data, '$.paytmMerchantKey')),
      'website', JSON_UNQUOTE(JSON_EXTRACT(data, '$.paytmWebsite'))
    ),
    'phonepe', JSON_OBJECT(
      'merchantId', JSON_UNQUOTE(JSON_EXTRACT(data, '$.phonepeId')),
      'saltKey', JSON_UNQUOTE(JSON_EXTRACT(data, '$.phonepeSaltKey')),
      'saltIndex', JSON_UNQUOTE(JSON_EXTRACT(data, '$.phonepeSaltIndex'))
    ),
    '_revision', revision
  ),
  revision,
  CURRENT_TIMESTAMP
FROM system_settings
WHERE category = 'subscriptions';

UPDATE system_settings target
JOIN (
  SELECT JSON_OBJECT(
    'stripe', JSON_OBJECT('secretKey', JSON_UNQUOTE(JSON_EXTRACT(data, '$.stripeSecretKey'))),
    'paypal', JSON_OBJECT(
      'clientId', JSON_UNQUOTE(JSON_EXTRACT(data, '$.paypalClientId')),
      'clientSecret', JSON_UNQUOTE(JSON_EXTRACT(data, '$.paypalClientSecret'))
    ),
    'razorpay', JSON_OBJECT(
      'keyId', JSON_UNQUOTE(JSON_EXTRACT(data, '$.razorpayKeyId')),
      'keySecret', JSON_UNQUOTE(JSON_EXTRACT(data, '$.razorpayKeySecret'))
    ),
    'paytm', JSON_OBJECT(
      'mid', JSON_UNQUOTE(JSON_EXTRACT(data, '$.paytmMid')),
      'merchantKey', JSON_UNQUOTE(JSON_EXTRACT(data, '$.paytmMerchantKey')),
      'website', JSON_UNQUOTE(JSON_EXTRACT(data, '$.paytmWebsite'))
    ),
    'phonepe', JSON_OBJECT(
      'merchantId', JSON_UNQUOTE(JSON_EXTRACT(data, '$.phonepeId')),
      'saltKey', JSON_UNQUOTE(JSON_EXTRACT(data, '$.phonepeSaltKey')),
      'saltIndex', JSON_UNQUOTE(JSON_EXTRACT(data, '$.phonepeSaltIndex'))
    ),
    '_revision', revision
  ) AS migrated_data
  FROM system_settings
  WHERE category = 'subscriptions'
) source
SET target.data = JSON_MERGE_PATCH(source.migrated_data, target.data)
WHERE target.category = 'payment_providers';

INSERT IGNORE INTO system_settings (category, data, revision, updated_at)
SELECT
  'public_config',
  JSON_OBJECT(
    'subscriptions',
    JSON_REMOVE(
      data,
      '$.stripeSecretKey', '$.paypalClientSecret', '$.razorpayKeySecret',
      '$.paytmMerchantKey', '$.phonepeSaltKey'
    )
  ),
  revision,
  CURRENT_TIMESTAMP
FROM system_settings
WHERE category = 'subscriptions';

UPDATE system_settings target
JOIN (
  SELECT JSON_OBJECT(
    'subscriptions',
    JSON_REMOVE(
      data,
      '$.stripeSecretKey', '$.paypalClientSecret', '$.razorpayKeySecret',
      '$.paytmMerchantKey', '$.phonepeSaltKey'
    )
  ) AS migrated_data
  FROM system_settings
  WHERE category = 'subscriptions'
) source
SET target.data = JSON_MERGE_PATCH(source.migrated_data, target.data)
WHERE target.category = 'public_config';

INSERT INTO system_settings (category, data, revision, updated_at) VALUES
  ('payment_providers', '{"_revision":0}', 0, CURRENT_TIMESTAMP),
  ('public_config', '{"modules":{"atsChecker":true,"resumeImport":false,"aiAssistant":true,"coverLetter":true,"blog":true,"jobs":true,"jobTracker":false,"portfolio":false,"review":true,"contact":true,"subscriptions":false,"enableGoogleAuthModule":true,"enableGoogle":true,"enableFacebookAuthModule":true,"enableFacebook":true,"enableImportModule":false,"enableCouponsModule":true,"enableJobScraperModule":true,"enablePortfolioModule":false,"enableMessagesModule":false,"enableJobTrackerModule":false,"enableAppliedJobsModule":false,"enableCoverLetterModule":true,"enableAiSuggestionsModule":true,"enableAtsScoreModule":true,"enablePublicSharingModule":true,"enableSalesTaxModule":true},"auth":{"enableEmailVerification":false},"branding":{"brandName":"IME365","logoUrl":"","darkLogoUrl":"","faviconUrl":"","defaultAvatarUrl":""},"codeInjection":{"headerScripts":"","footerScripts":""},"exportPdf":{"renderTimeout":60000,"paperFormat":"A4"},"facebook":{"facebookAppId":"","facebookPixelId":"","enableFacebookLogin":false},"gdpr":{"enableCookieBanner":true,"cookieMessage":"We use cookies to improve your resume building experience and analyze website traffic.","buttonText":"Accept All Cookies","privacyPolicyUrl":"/p/privacy-policy","termsOfServiceUrl":"/p/terms-of-service"},"geoSeo":{"enableGeoSeo":true,"targetRegion":"IN","targetCity":"Bengaluru","targetCountry":"India","metaKeywords":"AI Resume Builder India, Free CV Maker, Biodata Format, Naukri Resume, Professional CV Bengaluru","canonicalUrl":"","enableJobPostingSchema":true,"enableOrganizationSchema":true},"google":{"enableGoogleLogin":true},"integrations":{"googleMapsApiKey":"","recaptchaSiteKey":"","gaMeasurementId":"","facebookPixelId":""},"jobScraper":{"keywords":"web developer","location":"India","maxJobs":25,"scrapeIntervalHours":24},"llmGeo":{"enableLlmGeo":true,"aiModelOptimization":"ChatGPT, Perplexity, Gemini, Claude","llmsTxtContent":"","allowGptBot":true,"allowClaudeBot":true,"allowGeminiBot":true,"llmCitationPrompt":""},"security":{"maxUploadSizeMb":5,"allowedExtensions":".png,.jpg,.jpeg,.pdf,.doc,.docx","sessionTimeoutMinutes":60,"rateLimitRequests":100},"social":{"facebook":"","twitter":"","instagram":"","youtube":"","pinterest":""},"socialAuth":{"enableGoogleLogin":true,"enableFacebookLogin":false,"linkedinClientId":"","enableLinkedinLogin":false,"githubClientId":"","enableGithubLogin":false},"templateManager":{"disabledCvTemplates":[],"proCvTemplates":["Cv1","Cv2","Cv5"],"disabledCoverTemplates":[]},"watermark":{"enableFreeWatermark":true,"watermarkText":"Created with IME365 (Free Plan)","opacity":0.2,"position":"diagonal"},"subscriptions":{"state":false,"stripeEnabled":false,"paypalEnabled":false,"razorpayEnabled":false,"paytmEnabled":false,"phonepeEnabled":false,"sandboxMode":true,"enableTax":true,"taxName":"GST","taxRate":18,"taxInclusive":false,"currency":"INR","monthlyPrice":199,"quartarlyPrice":399,"yearlyPrice":499},"systemHealth":{"maintenanceMode":false,"maintenanceMessage":"Scheduled maintenance is in progress."},"currency":"INR","currencySymbol":"₹","allowMultiCurrency":false,"_settingsRevisions":{"modules":0,"auth":0,"branding":0,"codeInjection":0,"exportPdf":0,"facebook":0,"gdpr":0,"geoSeo":0,"google":0,"integrations":0,"jobScraper":0,"llmGeo":0,"security":0,"social":0,"socialAuth":0,"templateManager":0,"watermark":0,"payments":0,"systemHealth":0}}', 0, CURRENT_TIMESTAMP),
  ('website_meta', '{"title":"IME365 — ATS Resume Builder & CV Maker","description":"Create ATS-friendly resumes and cover letters in minutes.","keywords":"IME365, ATS Resume Builder, CV Maker","language":"English","disabledLanguages":[],"trackingCode":"","rating":5,"revision":0}', 0, CURRENT_TIMESTAMP),
  ('system_settings', '{"currency":"INR","currencyRevision":0,"allowMultiCurrency":false}', 0, CURRENT_TIMESTAMP),
  ('admin_configuration', '{"_revisions":{}}', 0, CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE data = JSON_MERGE_PATCH(VALUES(data), data);
