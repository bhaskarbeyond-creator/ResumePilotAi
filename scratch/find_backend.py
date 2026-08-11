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

# Find where backend index.js lives
cmd = "find /home/u727965524 -name 'index.js' 2>/dev/null | grep -i backend | head -10"
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', errors='replace').strip()
err = stderr.read().decode('utf-8', errors='replace').strip()
print("Find results:")
print(out or "(none found)")
if err:
    print("STDERR:", err[:500])

# Also check running node processes
cmd2 = "ps aux | grep node | grep -v grep | head -5"
stdin2, stdout2, stderr2 = ssh.exec_command(cmd2)
out2 = stdout2.read().decode('utf-8', errors='replace').strip()
print("\nNode processes:")
print(out2 or "(none)")

# Check pm2
cmd3 = "pm2 list 2>&1 | head -20"
stdin3, stdout3, stderr3 = ssh.exec_command(cmd3)
out3 = stdout3.read().decode('utf-8', errors='replace').strip()
print("\nPM2 list:")
print(out3 or "(none)")

ssh.close()
