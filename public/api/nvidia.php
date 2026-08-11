<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$requestUri = $_SERVER['REQUEST_URI'];
$path = preg_replace('/^.*\/nvidia(\.php)?/', '', $requestUri);
if (empty($path) || $path === '/') {
    $path = '/v1/chat/completions';
}

$targetUrl = 'https://integrate.api.nvidia.com' . $path;

$headers = [];
if (function_exists('getallheaders')) {
    foreach (getallheaders() as $name => $value) {
        if (in_array(strtolower($name), ['authorization', 'content-type', 'accept'])) {
            $headers[] = "$name: $value";
        }
    }
} else {
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $headers[] = "Authorization: " . $_SERVER['HTTP_AUTHORIZATION'];
    }
    if (isset($_SERVER['CONTENT_TYPE'])) {
        $headers[] = "Content-Type: " . $_SERVER['CONTENT_TYPE'];
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
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode > 0) {
    http_response_code($httpCode);
} else {
    http_response_code(500);
    $response = json_encode(['error' => ['message' => 'PHP Proxy failed to connect to NVIDIA API']]);
}

echo $response;
?>
