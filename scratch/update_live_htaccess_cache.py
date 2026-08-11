import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

htaccess_content = """<IfModule mod_rewrite.c>
  RewriteEngine On

  # Route /api/* through PHP proxy to Node.js backend on port 8080
  RewriteCond %{REQUEST_URI} ^/api/ [NC]
  RewriteRule ^api/(.*)$ api/index.php [QSA,L]

  # SPA Routing - serve index.html for all other routes
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ index.html [L]
</IfModule>

# Never cache index.html so users always get fresh JS/CSS bundle references
<Files "index.html">
  Header set Cache-Control "no-cache, no-store, must-revalidate"
  Header set Pragma "no-cache"
  Header set Expires 0
</Files>

# Correct MIME types for self-hosted fonts
AddType font/woff2        .woff2
AddType font/woff         .woff
AddType font/ttf          .ttf
AddType font/otf          .otf
AddType application/font-sfnt .ttf .otf

# CORS for fonts - allow Playwright/browser to load self-hosted fonts
<FilesMatch "\\.(woff2|woff|ttf|otf|eot)$">
  Header set Access-Control-Allow-Origin "*"
  Header set Cache-Control "public, max-age=31536000, immutable"
</FilesMatch>
"""

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)
sftp = ssh.open_sftp()
remote = '/home/u727965524/domains/airesume.projectdemo.guru/public_html/.htaccess'
with sftp.open(remote, 'w') as f:
    f.write(htaccess_content)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('cat ' + remote)
print(stdout.read().decode('utf-8', errors='replace'))
ssh.close()
print('Done!')
