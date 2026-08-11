import paramiko
import zipfile
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

local_dist = r'd:\xampp\htdocs\ai-resume-builder\dist'
zip_path = r'd:\xampp\htdocs\ai-resume-builder\scratch\dist.zip'

print("Zipping dist folder...")
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(local_dist):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, local_dist)
            zipf.write(full_path, rel_path)

print("dist.zip created successfully!")

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)
sftp = ssh.open_sftp()

remote_public = '/home/u727965524/domains/airesume.projectdemo.guru/public_html'
remote_zip = '/home/u727965524/dist.zip'

print("Uploading dist.zip via SFTP...")
sftp.put(zip_path, remote_zip)
sftp.close()
print("Uploaded dist.zip!")

cmd = f'unzip -o {remote_zip} -d {remote_public} && rm -f {remote_zip}'
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', errors='replace').strip()
err = stderr.read().decode('utf-8', errors='replace').strip()
print(f"$ {cmd}")
if out:
    print(out[:200] + "...")
if err:
    print(f"STDERR: {err}")

ssh.close()
if os.path.exists(zip_path):
    os.remove(zip_path)

print("Zip deployment finished successfully!")
