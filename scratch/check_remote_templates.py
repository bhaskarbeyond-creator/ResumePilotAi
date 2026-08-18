import paramiko
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
grep "Standard Europass Modern" /home/u727965524/backend/services/docxThemes.js 2>/dev/null || echo "NOT IN REMOTE docxThemes.js"
ls -la /home/u727965524/domains/airesume.projectdemo.guru/public_html/assets/Cv51* 2>/dev/null || echo "Cv51 assets check"
"""

stdin, stdout, stderr = ssh.exec_command(test_cmd)
print("=== Server inspection ===")
print(stdout.read().decode('utf-8'))
ssh.close()
