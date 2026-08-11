import paramiko, sys, time

sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

stdin, stdout, stderr = ssh.exec_command('ls -la /proc/$(pgrep -u u727965524 -f index.js | head -n 1)/exe 2>/dev/null || which node || find / -name node 2>/dev/null')
out = stdout.read().decode('utf-8', errors='replace')
print('Node path:', out)

# Launch node server if not running
ssh.exec_command('cd /home/u727965524/backend && nohup node index.js > server.log 2>&1 &')
time.sleep(3)

stdin, stdout, stderr = ssh.exec_command('ps aux | grep node')
print('=== PROCESS LIST ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('cat /home/u727965524/backend/server.log')
print('=== BACKEND LOG ===')
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
