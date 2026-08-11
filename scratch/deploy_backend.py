import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

local_backend = r'd:\xampp\htdocs\ai-resume-builder\backend\index.js'
remote_backend = '/home/u727965524/backend/index.js'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)
sftp = ssh.open_sftp()

print("Uploading backend/index.js...")
sftp.put(local_backend, remote_backend)
sftp.close()
print("Uploaded backend/index.js!")

# Kill old node process and restart
restart_cmd = "kill $(pgrep -f 'node /home/u727965524/backend/index.js') 2>/dev/null; sleep 2; cd /home/u727965524/backend && nohup node index.js > /home/u727965524/backend/app.log 2>&1 &"
stdin, stdout, stderr = ssh.exec_command(restart_cmd)
out = stdout.read().decode('utf-8', errors='replace').strip()
err = stderr.read().decode('utf-8', errors='replace').strip()
print(f"Restart output: {out or '(none)'}")
if err:
    print(f"STDERR: {err}")

ssh.close()
print("Backend deployment finished successfully!")
