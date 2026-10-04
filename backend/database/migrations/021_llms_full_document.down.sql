-- Roll back only the empty DIR-024 companion field. Never remove an
-- operator-authored long-form document.
UPDATE system_settings
SET data = JSON_REMOVE(data, '$.llmGeo.llmsFullTxtContent'),
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'public_config'
  AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.llmGeo.llmsFullTxtContent')) = '';
