import paramiko
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting to live production host...")
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)
sftp = ssh.open_sftp()
print("SFTP connected.")

def mkdir_p(sftp, remote_directory):
    dirs = []
    while remote_directory and remote_directory != '/':
        dirs.append(remote_directory)
        remote_directory = os.path.dirname(remote_directory)
    dirs.reverse()
    for d in dirs:
        try:
            sftp.mkdir(d)
        except IOError:
            pass

def upload_dir(local_dir, remote_dir):
    print(f"Uploading {local_dir} -> {remote_dir}...")
    mkdir_p(sftp, remote_dir)
    for root, dirs, files in os.walk(local_dir):
        rel_path = os.path.relpath(root, local_dir)
        target_remote_dir = remote_dir if rel_path == '.' else os.path.join(remote_dir, rel_path).replace('\\', '/')
        mkdir_p(sftp, target_remote_dir)
        for f in files:
            local_file = os.path.join(root, f)
            remote_file = os.path.join(target_remote_dir, f).replace('\\', '/')
            sftp.put(local_file, remote_file)

local_backend = r'd:\xampp\htdocs\ai-resume-builder\backend'
remote_backend = '/home/u727965524/backend'
mkdir_p(sftp, remote_backend)

for item in ['index.js', 'package.json']:
    local_path = os.path.join(local_backend, item)
    if os.path.exists(local_path):
        sftp.put(local_path, os.path.join(remote_backend, item).replace('\\', '/'))
        print(f"Uploaded backend/{item}")

for folder in ['routes', 'services', 'security']:
    local_folder = os.path.join(local_backend, folder)
    if os.path.exists(local_folder):
        upload_dir(local_folder, os.path.join(remote_backend, folder).replace('\\', '/'))

sftp.close()
print("All backend files transferred successfully!")

node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH'
restart_cmds = [
    f'{node_env} && pm2 restart airesume-backend --update-env 2>&1 || ({node_env} && cd /home/u727965524/backend && pm2 start index.js --name "airesume-backend" 2>&1)',
    f'{node_env} && pm2 save 2>&1',
    f'{node_env} && pm2 status 2>&1'
]

for cmd in restart_cmds:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    print(f"\n$ {cmd}\n{out}")

ssh.close()
print("\nBackend deployment and PM2 restart finished successfully!")
