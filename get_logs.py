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
stdin, stdout, stderr = ssh.exec_command('tail -n 100 /home/u727965524/.pm2/logs/airesume-backend-out.log /home/u727965524/.pm2/logs/airesume-backend-error.log')

with open('remote_logs.txt', 'w', encoding='utf-8') as f:
    f.write(stdout.read().decode('utf-8', errors='replace'))
    f.write(stderr.read().decode('utf-8', errors='replace'))

ssh.close()
