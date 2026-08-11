import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

# Updated .htaccess using PHP proxy (works on shared hosting without mod_proxy)
htaccess_content = """<IfModule mod_rewrite.c>
  RewriteEngine On

  # Route /api/* through PHP proxy to Node.js backend on port 8080
  # (mod_proxy not required - PHP curl handles the forwarding)
  RewriteCond %{REQUEST_URI} ^/api/ [NC]
  RewriteRule ^api/(.*)$ api/index.php [QSA,L]

  # SPA Routing - serve index.html for all other routes
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ index.html [L]
</IfModule>
"""

local_php = r'd:\xampp\htdocs\ai-resume-builder\api\index.php'
remote_php = '/home/u727965524/domains/airesume.projectdemo.guru/public_html/api/index.php'
remote_htaccess = '/home/u727965524/domains/airesume.projectdemo.guru/public_html/.htaccess'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)
sftp = ssh.open_sftp()

# Ensure api/ directory exists
print("[1] Ensuring api/ directory exists on live server...")
try:
    sftp.mkdir('/home/u727965524/domains/airesume.projectdemo.guru/public_html/api')
    print("    Created api/ directory")
except:
    print("    api/ directory already exists")

# Upload PHP proxy
print("\n[2] Uploading api/index.php...")
sftp.put(local_php, remote_php)
print("    Done!")

# Update .htaccess
print("\n[3] Updating .htaccess (PHP proxy instead of mod_proxy)...")
with sftp.open(remote_htaccess, 'w') as f:
    f.write(htaccess_content)
print("    Done!")

sftp.close()

# Verify
print("\n[4] Verifying files on server...")
stdin, stdout, stderr = ssh.exec_command(f"cat {remote_htaccess}")
print("    .htaccess:\n" + stdout.read().decode('utf-8', errors='replace'))

stdin2, stdout2, stderr2 = ssh.exec_command(f"head -5 {remote_php}")
print("    api/index.php (first 5 lines):\n" + stdout2.read().decode('utf-8', errors='replace'))

ssh.close()
print("\n✅ PHP proxy and .htaccess deployed!")
