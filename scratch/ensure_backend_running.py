import paramiko, sys, time

sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

NODE_BIN = '/opt/alt/alt-nodejs20/root/usr/bin/node'
cmd = f'pgrep -f "backend/index.js" || nohup {NODE_BIN} /home/u727965524/backend/index.js > /home/u727965524/backend/node_app.log 2>&1 &'

ssh.exec_command(cmd)
time.sleep(3)

stdin, stdout, stderr = ssh.exec_command('ps aux | grep "backend/index.js"')
print('=== RUNNING BACKEND PROCESS ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = ssh.exec_command('cat /home/u727965524/backend/node_app.log')
print('=== BACKEND LOG ===')
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
