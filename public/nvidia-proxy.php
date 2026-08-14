<?php
// Same-origin proxy: CORS is enforced by the application gateway; never reflect arbitrary origins.
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$requestUri = $_SERVER['REQUEST_URI'];
$path = preg_replace('/^.*\/nvidia-proxy(\.php)?/', '', $requestUri);
if (empty($path) || $path === '/') {
    $path = '/v1/chat/completions';
}

$targetUrl = 'https://integrate.api.nvidia.com' . $path;

$headers = [];
$authHeader = null;

if (function_exists('getallheaders')) {
    $allHeaders = getallheaders();
    foreach ($allHeaders as $name => $value) {
        if (strtolower($name) === 'authorization') {
            $authHeader = $value;
        }
        if (in_array(strtolower($name), ['authorization', 'content-type', 'accept'])) {
            $headers[] = "$name: $value";
        }
    }
}

if (!$authHeader) {
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if ($authHeader && !in_array("Authorization: $authHeader", $headers)) {
        $headers[] = "Authorization: $authHeader";
    }
}

if (isset($_SERVER['CONTENT_TYPE']) && !in_array("Content-Type: " . $_SERVER['CONTENT_TYPE'], $headers)) {
    $headers[] = "Content-Type: " . $_SERVER['CONTENT_TYPE'];
}

$body = file_get_contents('php://input');

// Attempt 1: cURL (Preferred for performance)
if (function_exists('curl_init')) {
    $ch = curl_init($targetUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if (!empty($body)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
} else {
    // Attempt 2: file_get_contents stream context fallback (For hosts without cURL extension)
    $opts = [
        'http' => [
            'method' => $_SERVER['REQUEST_METHOD'],
            'header' => implode("\r\n", $headers),
            'content' => $body,
            'ignore_errors' => true,
            'timeout' => 30
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true
        ]
    ];
    $context = stream_context_create($opts);
    $response = @file_get_contents($targetUrl, false, $context);
    
    $httpCode = 200;
    if (isset($http_response_header)) {
        foreach ($http_response_header as $h) {
            if (preg_match('/HTTP\/\d\.\d\s+(\d+)/', $h, $matches)) {
                $httpCode = intval($matches[1]);
                break;
            }
        }
    }
}

if ($httpCode > 0) {
    http_response_code($httpCode);
} else {
    http_response_code(500);
    $response = json_encode(['error' => ['message' => 'PHP Proxy failed to connect to NVIDIA API']]);
}

echo $response;
?>
