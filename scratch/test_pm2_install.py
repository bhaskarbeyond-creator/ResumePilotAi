import paramiko

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

node_env = 'export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH'

commands = [
    f'{node_env} && npm install -g pm2 --prefix ~/.local 2>&1',
    f'export PATH=~/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && which pm2 2>&1',
    f'export PATH=~/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && pm2 -v 2>&1',
]

for cmd in commands:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    print(f"\n$ {cmd}")
    if out:
        print(out)
    if err:
        print(f"STDERR: {err}")

ssh.close()
