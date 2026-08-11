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

node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH'

cmd = f'{node_env} && cd /home/u727965524/backend && node /home/u727965524/update_admin_db.js 2>&1'
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', errors='replace').strip()
err = stderr.read().decode('utf-8', errors='replace').strip()
print(f"$ {cmd}")
if out:
    print(out)
if err:
    print(f"STDERR: {err}")

ssh.close()
