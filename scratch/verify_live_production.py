import paramiko
import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

test_cmd = r"""
export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH
pm2 status airesume-backend
git_or_time=$(ls -la /home/u727965524/backend/services/aiRuntime.js)
echo "Backend aiRuntime.js on server: $git_or_time"
fe_time=$(ls -la /home/u727965524/domains/airesume.projectdemo.guru/public_html/index.html)
echo "Frontend index.html on server: $fe_time"
"""

stdin, stdout, stderr = ssh.exec_command(test_cmd)
output = stdout.read().decode('utf-8')
err = stderr.read().decode('utf-8')
ssh.close()

print("=== Remote Server File & Process Verification ===")
print(output)
if err:
    print("Stderr:", err)

# Check public HTTPS endpoint
print("=== Checking Public HTTPS Health & Edge Response ===")
req = urllib.request.Request("https://airesume.projectdemo.guru/api/health", headers={"User-Agent": "HealthCheck/1.0"})
try:
    with urllib.request.urlopen(req, timeout=10) as response:
        print("HTTP Status:", response.getcode())
        print("Body:", response.read().decode('utf-8'))
except Exception as e:
    print("Health check status:", e)
