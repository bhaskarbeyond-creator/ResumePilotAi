import paramiko

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

commands = [
    '/opt/alt/alt-nodejs20/root/usr/bin/node -v',
    '/opt/alt/alt-nodejs20/root/usr/bin/npm -v',
    '/opt/alt/alt-nodejs20/root/usr/bin/npx -v',
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
