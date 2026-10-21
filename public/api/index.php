<?php
/**
 * PHP Reverse Proxy for Node.js Backend API & AI Wire Endpoints
 * Supports:
 * - Local XAMPP Windows development & Hostinger Shared Linux Hosting
 * - Dynamic port (BACKEND_PORT / PORT / 8080) and Unix Domain Socket (Passenger)
 * - /api/*, /v1/* (FreeLLMAPI & Claude Code Agent wire formats), and health probes
 * - Real-time SSE (Server-Sent Events) streaming with LiteSpeed/Apache buffer bypassing
 */

// Allow ample time for long-running AI completions and document export
set_time_limit(300);

// Same-origin proxy: CORS is enforced by the application gateway
header('Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE, PATCH');
header('Access-Control-Allow-Headers: Content-Type, Authorization, Accept, X-Requested-With, Anthropic-Version');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// 1. Resolve Target URL and Path
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$parsed = parse_url($requestUri);
$rawPath = $parsed['path'] ?? '/';
$query = isset($parsed['query']) ? '?' . $parsed['query'] : '';

// Normalize path: if request is in a subfolder (e.g. /ime365/api/...), strip subfolder
$path = preg_replace('/^.*?(\/(?:api|v1|healthz|readyz|llms\.txt|llms-full\.txt|public|sitemap\.xml)\b.*)$/i', '$1', $rawPath);
if (!$path || $path === $rawPath) {
    $path = $rawPath;
}

$backendPort = getenv('BACKEND_PORT') ?: (getenv('PORT') ?: '8080');
$socketPath = getenv('PASSENGER_SOCKET') ?: '';

$targetUrl = 'http://127.0.0.1:' . $backendPort . $path . $query;

// 2. Collect Request Headers
$headers = [];
$incomingHost = $_SERVER['HTTP_HOST'] ?? '127.0.0.1';
$headers[] = "X-Forwarded-Host: $incomingHost";
$headers[] = "X-Forwarded-Proto: " . ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http');
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
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $headers[] = 'Authorization: ' . $_SERVER['HTTP_AUTHORIZATION'];
    }
    if (isset($_SERVER['HTTP_ACCEPT'])) {
        $headers[] = 'Accept: ' . $_SERVER['HTTP_ACCEPT'];
    }
}

$body = file_get_contents('php://input');

// 3. Initialize cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $targetUrl);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
if (!empty($body)) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}
curl_setopt($ch, CURLOPT_TIMEOUT, 300);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);

if (!empty($socketPath) && file_exists($socketPath)) {
    curl_setopt($ch, CURLOPT_UNIX_SOCKET_PATH, $socketPath);
}

// 4. Handle Real-Time Streaming (SSE / Chunked Transfer)
$isEventStream = false;
$headersSent = false;
$skipHeaders = ['transfer-encoding', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade'];

// Stream response headers directly as they arrive from Node.js
curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($curl, $headerLine) use (&$isEventStream, &$headersSent, $skipHeaders) {
    $len = strlen($headerLine);
    $trimmed = trim($headerLine);
    if (empty($trimmed)) {
        return $len;
    }

    if (stripos($trimmed, 'HTTP/') === 0) {
        $parts = explode(' ', $trimmed, 3);
        if (isset($parts[1])) {
            http_response_code((int)$parts[1]);
        }
        return $len;
    }

    if (strpos($trimmed, ':') !== false) {
        list($hname, $hval) = explode(':', $trimmed, 2);
        $lname = strtolower(trim($hname));
        $hval = trim($hval);

        if ($lname === 'content-type' && stripos($hval, 'text/event-stream') !== false) {
            $isEventStream = true;
            header('X-Accel-Buffering: no'); // Tell LiteSpeed / Nginx not to buffer
            header('Cache-Control: no-cache, no-transform');
        }

        if (!in_array($lname, $skipHeaders, true)) {
            header(trim($hname) . ': ' . $hval, false);
        }
    }
    return $len;
});

// Stream response body chunks in real-time
curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($curl, $data) use (&$isEventStream, &$headersSent) {
    if (!$headersSent) {
        $headersSent = true;
        if (function_exists('apache_setenv')) {
            @apache_setenv('no-gzip', '1');
        }
        @ini_set('zlib.output_compression', '0');
        while (ob_get_level() > 0) {
            @ob_end_clean();
        }
    }

    echo $data;
    if ($isEventStream) {
        @ob_flush();
        @flush();
    }
    return strlen($data);
});

$success = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError && !$headersSent) {
    error_log('Backend proxy connection failed: ' . $curlError . ' Target: ' . $targetUrl);
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => [
            'code' => 'BACKEND_UNAVAILABLE',
            'message' => 'Backend service unavailable at port ' . $backendPort . '. Ensure the Node.js backend process is running.',
            'target' => $path
        ]
    ]);
    exit();
}

exit();
