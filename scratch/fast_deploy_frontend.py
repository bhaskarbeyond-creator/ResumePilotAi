import paramiko
import os
import sys
import json
import urllib.request

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

print("Uploading updated frontend dist files...")
for root, dirs, files in os.walk(local_dist):
    rel_path = os.path.relpath(root, local_dist)
    target_remote_dir = remote_public if rel_path == '.' else os.path.join(remote_public, rel_path).replace('\\', '/')
    mkdir_p(sftp, target_remote_dir)
    for f in files:
        local_file = os.path.join(root, f)
        remote_file = os.path.join(target_remote_dir, f).replace('\\', '/')
        # Only upload if remote file doesn't exist or size is different
        try:
            rstat = sftp.stat(remote_file)
            lstat = os.stat(local_file)
            if rstat.st_size == lstat.st_size and not f.endswith('.html'):
                continue
        except IOError:
            pass
        sftp.put(local_file, remote_file)
        print(f"Uploaded {f}")

sftp.close()
ssh.close()
print("Frontend files synchronized.")

# Purge Cloudflare Edge Cache
CLOUDFLARE_ZONE_ID = "725f3d648139c27172638441415bf9d2"
CLOUDFLARE_API_TOKEN = "cfut_Su0qFg1y8DIfMAMbGP9hNM89hW87cVhEBqfdVzeH84cb9675"
CF_PURGE_URL = f"https://api.cloudflare.com/client/v4/zones/{CLOUDFLARE_ZONE_ID}/purge_cache"

req = urllib.request.Request(
    CF_PURGE_URL,
    data=json.dumps({"purge_everything": True}).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json",
    },
    method="POST",
)
with urllib.request.urlopen(req) as resp:
    res = json.loads(resp.read().decode("utf-8"))
    print("Cloudflare Purge Result:", res.get("success"))
