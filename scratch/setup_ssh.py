import paramiko
import os

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
password = 'Bhaskar@002!'
pub_key_path = os.path.expanduser('~/.ssh/id_ed25519.pub')

with open(pub_key_path, 'r') as f:
    pub_key = f.read().strip()

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {hostname}:{port}...")
ssh.connect(hostname, port=port, username=username, password=password)
print("Connected successfully!")

# Ensure ~/.ssh exists and add public key to authorized_keys
commands = [
    'mkdir -p ~/.ssh && chmod 700 ~/.ssh',
    f'grep -qF "{pub_key}" ~/.ssh/authorized_keys 2>/dev/null || echo "{pub_key}" >> ~/.ssh/authorized_keys',
    'chmod 600 ~/.ssh/authorized_keys',
    'echo "=== SYSTEM INFORMATION ==="',
    'uname -a',
    'whoami',
    'pwd',
    'echo "=== INSTALLED RUNTIMES ==="',
    'node -v 2>&1',
    'npm -v 2>&1',
    'npx -v 2>&1',
    'pm2 -v 2>&1',
    'python3 --version 2>&1',
    'which chromium 2>&1',
    'which google-chrome 2>&1',
    'which playwright 2>&1',
    'echo "=== DIRECTORY LISTING ==="',
    'ls -la',
    'ls -la domains 2>&1',
    'ls -la public_html 2>&1'
]

for cmd in commands:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f"\n$ {cmd}")
    if out:
        print(out)
    if err:
        print(f"STDERR: {err}")

ssh.close()
