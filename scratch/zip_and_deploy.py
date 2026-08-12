import paramiko
import zipfile
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

local_dist = r'd:\xampp\htdocs\ai-resume-builder\dist'
zip_path = r'd:\xampp\htdocs\ai-resume-builder\scratch\dist.zip'
local_backend_index = r'd:\xampp\htdocs\ai-resume-builder\backend\index.js'
local_backend_routes = r'd:\xampp\htdocs\ai-resume-builder\backend\routes'

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
remote_backend_dir = '/home/u727965524/backend'
local_backend_env = r'd:\xampp\htdocs\ai-resume-builder\backend\.env'

print("Uploading dist.zip via SFTP...")
sftp.put(zip_path, remote_zip)
print("Uploading backend/index.js & .env via SFTP...")
sftp.put(local_backend_index, f"{remote_backend_dir}/index.js")
sftp.put(local_backend_env, f"{remote_backend_dir}/.env")

# Upload routes directory
for root, dirs, files in os.walk(local_backend_routes):
    for file in files:
        local_path = os.path.join(root, file)
        rel_path = os.path.relpath(local_path, local_backend_routes)
        remote_path = f"{remote_backend_dir}/routes/{rel_path}".replace('\\', '/')
        try:
            sftp.mkdir(os.path.dirname(remote_path))
        except OSError:
            pass
        sftp.put(local_path, remote_path)

sftp.close()
print("Uploaded frontend zip & backend files!")

# Deploy frontend zip + restart backend process
restart_cmd = (
    f'unzip -o {remote_zip} -d {remote_public} && rm -f {remote_zip} && '
    f'pkill -f "node /home/u727965524/backend/index.js" || true; '
    f'sleep 1; '
    f'cd {remote_backend_dir} && nohup node index.js > server.log 2>&1 &'
)

stdin, stdout, stderr = ssh.exec_command(restart_cmd)
out = stdout.read().decode('utf-8', errors='replace').strip()
err = stderr.read().decode('utf-8', errors='replace').strip()
print(f"$ {restart_cmd}")
if out:
    print(out[:300])
if err:
    print(f"STDERR: {err[:300]}")

# Verify new process is running
stdin, stdout, stderr = ssh.exec_command('ps aux | grep "node /home/u727965524/backend/index.js"')
proc_out = stdout.read().decode('utf-8', errors='replace').strip()
print("Active backend process:")
print(proc_out)

ssh.close()
if os.path.exists(zip_path):
    os.remove(zip_path)

print("Full Frontend & Backend Deployment finished successfully!")
