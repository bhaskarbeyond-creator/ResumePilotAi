<?php
/**
 * PHP proxy for Node.js backend API (port 8080)
 * Handles all /api/* requests including long-running Playwright PDF export
 */

// Allow large timeouts for PDF generation and comprehensive AI assessments
set_time_limit(180);

// Same-origin proxy: CORS is enforced by the application gateway; never reflect arbitrary origins.
header('Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization, Accept');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Build target URL: forward to Node.js on port 8080
$requestUri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '';
// Strip /api prefix to get the path, then re-add it for the backend
$path = preg_replace('/^(\/[^\/]+)?\/api/', '/api', $requestUri);
$targetUrl = 'http://127.0.0.1:8080' . $path;

// Collect request headers and inject X-Forwarded-Host / X-Forwarded-Proto for backend domain resolution
$headers = [];
$incomingHost = $_SERVER['HTTP_HOST'] ?? 'airesume.projectdemo.guru';
$headers[] = "X-Forwarded-Host: $incomingHost";
$headers[] = "X-Forwarded-Proto: https";
$remoteAddress = $_SERVER['REMOTE_ADDR'] ?? '';
if (filter_var($remoteAddress, FILTER_VALIDATE_IP)) {
    $headers[] = "X-Forwarded-For: $remoteAddress";
}

if (function_exists('getallheaders')) {
    foreach (getallheaders() as $name => $value) {
        $lname = strtolower($name);
        if ($lname !== 'host' && $lname !== 'connection' && $lname !== 'x-forwarded-host' && $lname !== 'x-forwarded-proto' && $lname !== 'x-forwarded-for') {
            $headers[] = "$name: $value";
        }
    }
} else {
    if (isset($_SERVER['CONTENT_TYPE'])) {
        $headers[] = 'Content-Type: ' . $_SERVER['CONTENT_TYPE'];
    }
}

$body = file_get_contents('php://input');

$ch = curl_init($targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
if (!empty($body)) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}
curl_setopt($ch, CURLOPT_TIMEOUT, 180);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
curl_setopt($ch, CURLOPT_HEADER, true); // Get response headers too

$rawResponse = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    error_log('Backend proxy connection failed: ' . $curlError);
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => ['code' => 'BACKEND_UNAVAILABLE', 'message' => 'Backend service unavailable']]);
    exit();
}

// Split response headers from body
$responseHeaders = substr($rawResponse, 0, $headerSize);
$responseBody = substr($rawResponse, $headerSize);

// Forward response headers (skip status line and hop-by-hop headers)
$skipHeaders = ['transfer-encoding', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade'];
foreach (explode("\r\n", $responseHeaders) as $line) {
    if (strpos($line, ':') !== false) {
        list($hname, $hvalue) = explode(':', $line, 2);
        $lname = strtolower(trim($hname));
        if (!in_array($lname, $skipHeaders)) {
            header(trim($hname) . ':' . $hvalue, false);
        }
    }
}

http_response_code($httpCode > 0 ? $httpCode : 502);
echo $responseBody;
