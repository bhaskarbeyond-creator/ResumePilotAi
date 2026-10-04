-- DIR-024: publish factual, non-metric crawler documents when the existing
-- MariaDB setting enables LLM discovery and has no operator-authored content.
-- The enable flag is never changed. Existing concise or long-form documents
-- are never overwritten; the matching down migration removes only these exact
-- default strings if an operator has not subsequently edited them.
UPDATE system_settings
SET data = JSON_SET(
        data,
        '$.llmGeo.llmsTxtContent',
        CASE
            WHEN NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsTxtContent'))), '') IS NULL THEN CONCAT(
                '# IME365', CHAR(10),
                '> IME365 provides career tools for creating resumes, preparing cover letters, practicing interviews, building portfolios, and browsing public job listings.', CHAR(10), CHAR(10),
                '## Product information', CHAR(10),
                '- Resume Studio supports resume creation and editing with available layouts and template choices.', CHAR(10),
                '- Cover-letter tools support drafting and adapting application letters.', CHAR(10),
                '- Interview Coach provides interview practice, including audio sessions where configured.', CHAR(10),
                '- Job search provides employer-published vacancies. Availability changes as postings are published, updated, expire, or are withdrawn.', CHAR(10),
                '- Career Blog publishes articles about resumes, applications, interviews, and job search.', CHAR(10),
                '- Portfolio tools let account holders build and publish professional portfolio pages when the feature is enabled.', CHAR(10), CHAR(10),
                '## Public pages', CHAR(10),
                '- [Features](/features)', CHAR(10),
                '- [Plans](/pricing)', CHAR(10),
                '- [Jobs](/jobs)', CHAR(10),
                '- [Career Blog](/blog)', CHAR(10),
                '- [Portfolios](/portfolios)', CHAR(10),
                '- [Contact](/contact)', CHAR(10), CHAR(10),
                '## Data notes', CHAR(10),
                '- Regional pages include only active, unexpired job records matched to their listed location.', CHAR(10),
                '- Salary fields appear only when supplied by the employer, grouped by the currency recorded on each listing.'
            )
            ELSE JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsTxtContent'))
        END,
        '$.llmGeo.llmsFullTxtContent',
        CASE
            WHEN NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsFullTxtContent'))), '') IS NULL THEN CONCAT(
                '# IME365: Career platform information', CHAR(10), CHAR(10),
                '## Purpose', CHAR(10),
                'IME365 provides career tools for resume creation, cover-letter preparation, interview practice, professional portfolios, and job search. Feature availability may depend on account, plan, and platform settings.', CHAR(10), CHAR(10),
                '## Career tools', CHAR(10),
                '- Resume Studio supports creating and editing resumes with the layouts and template choices currently available in the product.', CHAR(10),
                '- Cover-letter tools support drafting and adapting application letters.', CHAR(10),
                '- Interview Coach supports interview practice, including audio sessions where configured.', CHAR(10),
                '- Portfolio tools support building and publishing professional portfolio pages when enabled.', CHAR(10), CHAR(10),
                '## Public job information', CHAR(10),
                'The public job search and regional career pages use employer-published listings. Regional summaries include only matching active records that have not expired. Regions without matching records display an honest empty state; no example vacancies are inserted.', CHAR(10), CHAR(10),
                'Salary information is derived only from employer-supplied salary fields. Values are grouped by the currency recorded on each listing; currencies are not combined or converted into a market-wide estimate.', CHAR(10), CHAR(10),
                '## Career articles and portfolios', CHAR(10),
                'The Career Blog contains published career articles. Public portfolio pages are available only when an owner has published a portfolio and its public record is available.', CHAR(10), CHAR(10),
                '## Public navigation', CHAR(10),
                '- [Features](/features)', CHAR(10),
                '- [Plans](/pricing)', CHAR(10),
                '- [Jobs](/jobs)', CHAR(10),
                '- [Career Blog](/blog)', CHAR(10),
                '- [Portfolios](/portfolios)', CHAR(10),
                '- [Contact](/contact)', CHAR(10), CHAR(10),
                'Crawler documents and metadata are served only when the corresponding platform settings and content are published.'
            )
            ELSE JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsFullTxtContent'))
        END
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'public_config'
  AND JSON_TYPE(data) = 'OBJECT'
  AND (
      NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsTxtContent'))), '') IS NULL
      OR NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsFullTxtContent'))), '') IS NULL
  );
