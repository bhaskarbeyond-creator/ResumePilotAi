import paramiko, sys, os

sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

sftp = ssh.open_sftp()

# Ensure remote /home/u727965524/backend/fonts directory exists
remote_fonts_dir = '/home/u727965524/backend/fonts'
try:
    sftp.mkdir(remote_fonts_dir)
except Exception:
    pass

local_fonts_dir = r'd:\xampp\htdocs\ai-resume-builder\backend\fonts'
print('Uploading backend/fonts to live server...')
for f in os.listdir(local_fonts_dir):
    local_p = os.path.join(local_fonts_dir, f)
    remote_p = f'{remote_fonts_dir}/{f}'
    print(f'  Uploading {f}...')
    sftp.put(local_p, remote_p)

# Upload updated backend/index.js
print('Uploading backend/index.js...')
sftp.put(r'd:\xampp\htdocs\ai-resume-builder\backend\index.js', '/home/u727965524/backend/index.js')

sftp.close()

# Restart PM2 or node backend process
print('Restarting backend process on server...')
NODE_BIN = '/proc/202058/exe'
cmd = 'pkill -f "node /home/u727965524/backend/index.js" || true; sleep 1; nohup /proc/$(pgrep -f "node" | head -n 1)/exe /home/u727965524/backend/index.js > /home/u727965524/backend/server.log 2>&1 &'
stdin, stdout, stderr = ssh.exec_command('export PATH=$PATH:/usr/local/bin; pm2 restart all || pkill -f "node /home/u727965524/backend/index.js"')

print('Command output:', stdout.read().decode('utf-8', errors='replace'))

# Check running process
stdin, stdout, stderr = ssh.exec_command('ps aux | grep "backend/index.js"')
print('=== RUNNING BACKEND PROCESS ===')
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
print('Done!')
