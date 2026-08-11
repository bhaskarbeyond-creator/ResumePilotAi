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
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)
sftp = ssh.open_sftp()

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

local_dist = r'd:\xampp\htdocs\ai-resume-builder\dist'
remote_public = '/home/u727965524/domains/airesume.projectdemo.guru/public_html'

print(f"Uploading updated dist to {remote_public}...")
for root, dirs, files in os.walk(local_dist):
    rel_path = os.path.relpath(root, local_dist)
    target_remote_dir = remote_public if rel_path == '.' else os.path.join(remote_public, rel_path).replace('\\', '/')
    mkdir_p(sftp, target_remote_dir)
    for f in files:
        local_file = os.path.join(root, f)
        remote_file = os.path.join(target_remote_dir, f).replace('\\', '/')
        sftp.put(local_file, remote_file)

sftp.close()
ssh.close()
print("Dist sync complete!")
