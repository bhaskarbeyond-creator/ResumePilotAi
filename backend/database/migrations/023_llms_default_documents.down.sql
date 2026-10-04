-- Remove only the exact DIR-024 default documents seeded by the up migration.
-- An operator-edited document has a different digest and is preserved.
UPDATE system_settings
SET data = JSON_SET(
        data,
        '$.llmGeo.llmsTxtContent',
        CASE
            WHEN SHA2(JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsTxtContent')), 256) = 'c79bdf9af675613cad1d28256db2068c43e0b83203bcc2f5537179bd0f82500e' THEN ''
            ELSE COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsTxtContent')), '')
        END,
        '$.llmGeo.llmsFullTxtContent',
        CASE
            WHEN SHA2(JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsFullTxtContent')), 256) = '6ce26126ffaf550c3861a3b4c54aa7380f3ab55e9294e044604291c6e48daa3d' THEN ''
            ELSE COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsFullTxtContent')), '')
        END
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'public_config'
  AND JSON_TYPE(data) = 'OBJECT'
  AND (
      SHA2(JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsTxtContent')), 256) = 'c79bdf9af675613cad1d28256db2068c43e0b83203bcc2f5537179bd0f82500e'
      OR SHA2(JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsFullTxtContent')), 256) = '6ce26126ffaf550c3861a3b4c54aa7380f3ab55e9294e044604291c6e48daa3d'
  );
