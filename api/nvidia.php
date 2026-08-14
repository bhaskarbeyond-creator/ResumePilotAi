<?php
// Retired: the anonymous BYOK proxy exposed provider credentials and bypassed application
// authentication/quotas. AI requests must use the authenticated Node /api/generate-* routes.
header('Content-Type: application/json');
header('Cache-Control: no-store');
http_response_code(410);
echo json_encode(['error' => ['code' => 'LEGACY_AI_PROXY_RETIRED', 'message' => 'Use the authenticated application AI API.']]);
?>
