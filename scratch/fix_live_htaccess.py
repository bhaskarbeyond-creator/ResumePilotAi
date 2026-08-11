import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

htaccess_content = """<IfModule mod_rewrite.c>
  RewriteEngine On

  # Proxy /api/* requests to Node.js backend on port 8080
  RewriteCond %{REQUEST_URI} ^/api/ [NC]
  RewriteRule ^api/(.*)$ http://localhost:8080/api/$1 [P,L]

  # SPA Routing - serve index.html for all other routes
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ index.html [L]
</IfModule>
"""

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)
sftp = ssh.open_sftp()

remote_htaccess = '/home/u727965524/domains/airesume.projectdemo.guru/public_html/.htaccess'

print("[1] Writing updated .htaccess to live server...")
with sftp.open(remote_htaccess, 'w') as f:
    f.write(htaccess_content)
sftp.close()
print("    Done!")

# Verify it was written
print("\n[2] Verifying written .htaccess:")
stdin, stdout, stderr = ssh.exec_command(f"cat {remote_htaccess}")
print(stdout.read().decode('utf-8', errors='replace'))

# Quick test - hit /api/export via domain
print("\n[3] Testing /api/export proxy (expect PDF or backend response):")
stdin2, stdout2, stderr2 = ssh.exec_command(
    "curl -s -o /dev/null -w '%{http_code} %{content_type} size=%{size_download}' "
    "-X POST https://airesume.projectdemo.guru/api/export "
    "-H 'Content-Type: application/json' "
    "-d '{\"resumeName\":\"Cv1\",\"resumeId\":\"routing_test\",\"language\":\"en\"}' "
    "--max-time 10 --insecure 2>/dev/null"
)
print(stdout2.read().decode('utf-8', errors='replace'))

ssh.close()
print("\n✅ Done!")
