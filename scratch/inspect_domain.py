import paramiko

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)
print("Connected using SSH key!")

commands = [
    'ls -la domains/airesume.projectdemo.guru',
    'ls -la domains/airesume.projectdemo.guru/public_html 2>&1',
    'find /opt/alt/ -maxdepth 3 -name node 2>&1',
    'find ~/.nvm ~/.nix-profile /usr/local -name node 2>&1',
    'which node npm npx 2>&1',
    'echo $PATH'
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
