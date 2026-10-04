-- DIR-024: add the optional long-form discovery document without overwriting
-- an operator-authored llms.txt document or enabling publication. A missing
-- companion document remains an empty string and /llms-full.txt stays 404 until
-- the shared llmGeo.enableLlmGeo switch is explicitly enabled.
UPDATE system_settings
SET data = JSON_SET(
        data,
        '$.llmGeo.llmsFullTxtContent',
        COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsFullTxtContent')), '')
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'public_config'
  AND JSON_TYPE(data) = 'OBJECT'
  AND JSON_EXTRACT(data, '$.llmGeo.llmsFullTxtContent') IS NULL;
