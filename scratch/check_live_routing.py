import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

# Check the .htaccess on the live server
print("[1] Live server .htaccess:")
stdin, stdout, stderr = ssh.exec_command("cat /home/u727965524/domains/airesume.projectdemo.guru/public_html/.htaccess 2>/dev/null || echo 'NOT FOUND'")
print(stdout.read().decode('utf-8', errors='replace'))

# Check nginx config if exists
print("\n[2] Nginx config (if any):")
stdin2, stdout2, stderr2 = ssh.exec_command("cat /home/u727965524/domains/airesume.projectdemo.guru/public_html/../conf/nginx.conf 2>/dev/null || find /etc/nginx /home/u727965524 -name '*.conf' 2>/dev/null | grep -i airesume | head -5 || echo 'No nginx config found'")
print(stdout2.read().decode('utf-8', errors='replace'))

# Check what web server is running
print("\n[3] Web server type:")
stdin3, stdout3, stderr3 = ssh.exec_command("curl -sI http://localhost/ 2>/dev/null | grep -i server | head -3 || echo 'Could not determine'")
print(stdout3.read().decode('utf-8', errors='replace'))

# Try hitting the API directly on port 8080 from the server itself
print("\n[4] Testing backend from server (curl localhost:8080/api/resume):")
stdin4, stdout4, stderr4 = ssh.exec_command("curl -s -o /dev/null -w '%{http_code} %{content_type}' http://localhost:8080/api/resume 2>/dev/null")
print(stdout4.read().decode('utf-8', errors='replace'))

# Check how requests reach the backend - Apache proxy rules
print("\n[5] Apache vhost config:")
stdin5, stdout5, stderr5 = ssh.exec_command("cat /home/u727965524/domains/airesume.projectdemo.guru/private/conf/vhost.conf 2>/dev/null || cat /home/u727965524/domains/airesume.projectdemo.guru/conf/vhost.conf 2>/dev/null || find /home/u727965524 -name 'vhost*' 2>/dev/null | head -3 || echo 'Not found'")
print(stdout5.read().decode('utf-8', errors='replace'))

ssh.close()
