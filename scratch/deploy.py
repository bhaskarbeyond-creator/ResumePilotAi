import paramiko
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting via SSH...")
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)
sftp = ssh.open_sftp()
print("SFTP session established.")

def mkdir_p(sftp, remote_directory):
    dirs = []
    while remote_directory and remote_directory != '/':
        dirs.append(remote_directory)
        remote_directory = os.path.dirname(remote_directory)
    dirs.reverse()
    for d in dirs:
        try:
            sftp.mkdir(d)
        except IOError:
            pass

def upload_dir(local_dir, remote_dir):
    print(f"Uploading {local_dir} -> {remote_dir}...")
    mkdir_p(sftp, remote_dir)
    for root, dirs, files in os.walk(local_dir):
        rel_path = os.path.relpath(root, local_dir)
        target_remote_dir = remote_dir if rel_path == '.' else os.path.join(remote_dir, rel_path).replace('\\', '/')
        mkdir_p(sftp, target_remote_dir)
        for f in files:
            local_file = os.path.join(root, f)
            remote_file = os.path.join(target_remote_dir, f).replace('\\', '/')
            sftp.put(local_file, remote_file)

# 1. Clean old assets and upload dist to public_html
local_dist = r'd:\xampp\htdocs\ai-resume-builder\dist'
remote_public = '/home/u727965524/domains/airesume.projectdemo.guru/public_html'

# Keep previous assets on server so active browser sessions don't get chunk 404 / MIME errors
print("Preserving existing assets for backward compatibility.")

upload_dir(local_dist, remote_public)

# Upload remote production .htaccess
remote_htaccess = os.path.join(remote_public, '.htaccess').replace('\\', '/')
remote_htaccess_content = r'''<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Proxy /api requests to PHP API proxy
  RewriteCond %{REQUEST_URI} ^/api/ [NC]
  RewriteRule ^api/(.*)$ api/index.php [L]

  # Return 404 for missing static assets under /assets/ instead of falling back to index.html
  RewriteCond %{REQUEST_URI} ^/assets/ [NC]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteRule ^ - [R=404,L]

  # SPA Routing — all other page routes serve index.html directly
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ index.html [L]
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css application/javascript application/json image/svg+xml
</IfModule>

<IfModule mod_mime.c>
  AddType application/javascript .js .mjs
  AddType text/css .css
</IfModule>

<IfModule mod_headers.c>
  <FilesMatch "\.(js|mjs)$">
    Header set Content-Type "application/javascript; charset=utf-8"
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\.css$">
    Header set Content-Type "text/css; charset=utf-8"
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\.(png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|otf)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "^(index\.html)?$">
    Header set Content-Type "text/html; charset=utf-8"
    Header set Cache-Control "no-cache, no-store, must-revalidate, max-age=0, s-maxage=0"
    Header set CDN-Cache-Control "no-store"
    Header set Cloudflare-CDN-Cache-Control "no-store"
    Header set Pragma "no-cache"
    Header set Expires "0"
  </FilesMatch>
</IfModule>
'''
with sftp.open(remote_htaccess, 'w') as f:
    f.write(remote_htaccess_content)
print("Uploaded production .htaccess to public_html")

# Create dedicated assets/.htaccess for LiteSpeed MIME enforcement
remote_assets_htaccess = os.path.join(remote_public, 'assets', '.htaccess').replace('\\', '/')
assets_htaccess_content = r'''<IfModule mod_mime.c>
  AddType application/javascript .js .mjs
  AddType text/css .css
</IfModule>
<IfModule mod_headers.c>
  <FilesMatch "\.(js|mjs)$">
    ForceType application/javascript
    Header set Content-Type "application/javascript; charset=utf-8"
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\.css$">
    ForceType text/css
    Header set Content-Type "text/css; charset=utf-8"
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>
'''
with sftp.open(remote_assets_htaccess, 'w') as f:
    f.write(assets_htaccess_content)
print("Uploaded assets/.htaccess to force JavaScript MIME type")

# Create PHP API Proxy (api/index.php) inside public_html
api_dir = os.path.join(remote_public, 'api').replace('\\', '/')
mkdir_p(sftp, api_dir)

php_proxy_code = '''<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept, X-Requested-With, X-NVIDIA-API-KEY');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$requestUri = $_SERVER['REQUEST_URI'];
// Forward request to Node backend on localhost:8080
$targetUrl = 'http://127.0.0.1:8080' . $requestUri;

$headers = [];
if (function_exists('getallheaders')) {
    $allHeaders = getallheaders();
    foreach ($allHeaders as $name => $value) {
        if (strtolower($name) !== 'host') {
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
}

$body = file_get_contents('php://input');

$ch = curl_init($targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
if (!empty($body)) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}
curl_setopt($ch, CURLOPT_TIMEOUT, 90);
curl_setopt($ch, CURLOPT_HEADER, true);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

if ($response !== false) {
    $responseHeaders = substr($response, 0, $headerSize);
    $responseBody = substr($response, $headerSize);

    foreach (explode("\\r\\n", $responseHeaders) as $h) {
        if (!empty($h) && !preg_match('/^HTTP\\//i', $h) && !preg_match('/^Transfer-Encoding:/i', $h)) {
            header($h);
        }
    }
    http_response_code($httpCode);
    echo $responseBody;
} else {
    http_response_code(502);
    echo json_encode(['error' => 'API Backend Service Unavailable']);
}
?>'''

with sftp.open(os.path.join(api_dir, 'index.php').replace('\\', '/'), 'w') as f:
    f.write(php_proxy_code)
print("Created public_html/api/index.php proxy script.")

# 2. Upload backend folder
local_backend = r'd:\xampp\htdocs\ai-resume-builder\backend'
remote_backend = '/home/u727965524/backend'
mkdir_p(sftp, remote_backend)

for item in ['index.js', 'package.json', '.env']:
    local_path = os.path.join(local_backend, item)
    if os.path.exists(local_path):
        sftp.put(local_path, os.path.join(remote_backend, item).replace('\\', '/'))
        print(f"Uploaded backend/{item}")

for folder in ['routes', 'services', 'security', 'enterprise']:
    local_folder = os.path.join(local_backend, folder)
    if os.path.exists(local_folder):
        upload_dir(local_folder, os.path.join(remote_backend, folder).replace('\\', '/'))

sftp.close()
print("All files transferred successfully!")

# 3. Setup backend dependencies and PM2 on remote server
node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH'

remote_cmds = [
    f'{node_env} && cd /home/u727965524/backend && npm install 2>&1',
    f'{node_env} && cd /home/u727965524/backend && npx playwright install chromium 2>&1',
    f'{node_env} && pm2 delete airesume-backend 2>/dev/null || true',
    f'{node_env} && cd /home/u727965524/backend && pm2 start index.js --name "airesume-backend" 2>&1',
    f'{node_env} && pm2 save 2>&1',
    f'{node_env} && pm2 status 2>&1',
]

for cmd in remote_cmds:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    print(f"\n$ {cmd}")
    if out:
        print(out)
    if err:
        print(f"STDERR: {err}")

ssh.close()
print("Deployment complete!")

# 4. Automatically purge Cloudflare Edge Cache for instantaneous global updates
import urllib.request, urllib.error
import json

CLOUDFLARE_ZONE_ID = os.environ.get("CLOUDFLARE_ZONE_ID", "")
CLOUDFLARE_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
if not CLOUDFLARE_ZONE_ID or not CLOUDFLARE_API_TOKEN:
    raise SystemExit(
        "Refusing to run: set CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN in the "
        "environment. These are deployment credentials and must never be "
        "committed to the repository."
    )
CF_PURGE_URL = f"https://api.cloudflare.com/client/v4/zones/{CLOUDFLARE_ZONE_ID}/purge_cache"

# Purge all edge cached routes & assets worldwide
PURGE_PAYLOAD = {
    "purge_everything": True
}

print("\n🔄 Purging Cloudflare Edge Cache for index.html...")
try:
    req = urllib.request.Request(
        CF_PURGE_URL,
        data=json.dumps(PURGE_PAYLOAD).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        if result.get("success"):
            print("✅ Cloudflare Edge Cache purged successfully! Users worldwide will get the new version instantly.")
        else:
            errors = result.get("errors", [])
            raise RuntimeError(f"Cloudflare purge API returned success=false. Errors: {errors}")
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8")
    print(f"\n❌ CRITICAL: Cloudflare purge FAILED with HTTP {e.code}!")
    print(f"Response body: {body}")
    print("\n⚠️  ACTION REQUIRED: Go to dash.cloudflare.com → projectdemo.guru → Caching → Purge Everything")
    print("   OR add 'Zone → Cache Purge → Purge' permission to the API token.")
    raise SystemExit(1)
except Exception as e:
    print(f"\n❌ CRITICAL: Cloudflare purge FAILED: {e}")
    print("\n⚠️  ACTION REQUIRED: Go to dash.cloudflare.com → projectdemo.guru → Caching → Purge Everything")
    raise SystemExit(1)
