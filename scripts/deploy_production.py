import os
import sys
import subprocess
import tarfile
import tempfile
import time

def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    print("=== STARTING ZERO-DOWNTIME PRODUCTION DEPLOYMENT ===")
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    dist_dir = os.path.join(root_dir, 'dist')
    backend_dir = os.path.join(root_dir, 'backend')

    # 1. Get HEAD commit SHA
    head_sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root_dir).decode('utf-8').strip()
    print(f"Authoritative Commit SHA to deploy: {head_sha}")

    # 2. Verify dist exists and is fresh
    if not os.path.exists(dist_dir):
        print("Building frontend assets...")
        subprocess.check_call(['npm', 'run', 'build'], cwd=root_dir)

    # 3. Create frontend tar archive
    frontend_tar = os.path.join(tempfile.gettempdir(), 'frontend_dist.tar.gz')
    if os.path.exists(frontend_tar):
        os.remove(frontend_tar)
    print(f"Creating frontend tarball: {frontend_tar}")
    with tarfile.open(frontend_tar, "w:gz") as tar:
        for item in os.listdir(dist_dir):
            item_path = os.path.join(dist_dir, item)
            tar.add(item_path, arcname=item)

    # 4. Create backend tar archive (exclude node_modules, .env, test)
    backend_tar = os.path.join(tempfile.gettempdir(), 'backend_src.tar.gz')
    if os.path.exists(backend_tar):
        os.remove(backend_tar)
    
    commit_sha_file = os.path.join(backend_dir, 'COMMIT_SHA')
    with open(commit_sha_file, 'w', encoding='utf-8') as f:
        f.write(head_sha + '\n')

    print(f"Creating backend tarball: {backend_tar}")
    with tarfile.open(backend_tar, "w:gz") as tar:
        for item in ['COMMIT_SHA', 'index.js', 'routes', 'services', 'security', 'enterprise', 'database', 'repositories', 'package.json']:
            item_path = os.path.join(backend_dir, item)
            if os.path.exists(item_path):
                tar.add(item_path, arcname=item)

    # 5. SCP tarballs to remote server
    print("Uploading backend package via SCP...")
    subprocess.check_call(['scp', '-o', 'BatchMode=yes', backend_tar, 'airesume:~/backend_src.tar.gz'])
    print("Uploading frontend package via SCP...")
    subprocess.check_call(['scp', '-o', 'BatchMode=yes', frontend_tar, 'airesume:~/frontend_dist.tar.gz'])

    # 6. Execute extraction and restart on remote server
    remote_script = f"""
    export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:$PATH
    set -e
    echo "=== Extracting Frontend ==="
    mkdir -p ~/domains/airesume.projectdemo.guru/public_html
    tar -xzf ~/frontend_dist.tar.gz -C ~/domains/airesume.projectdemo.guru/public_html/
    rm ~/frontend_dist.tar.gz

    echo "=== Extracting Backend ==="
    mkdir -p ~/backend
    tar -xzf ~/backend_src.tar.gz -C ~/backend/
    rm ~/backend_src.tar.gz

    echo "=== Updating Commit SHA ==="
    echo "{head_sha}" > ~/backend/COMMIT_SHA

    echo "=== Restarting Backend Service ==="
    /opt/alt/alt-nodejs20/root/usr/bin/node /home/u727965524/.local/lib/node_modules/pm2/bin/pm2 restart airesume-backend --update-env
    sleep 2
    /opt/alt/alt-nodejs20/root/usr/bin/node /home/u727965524/.local/lib/node_modules/pm2/bin/pm2 status
    """

    print("Deploying on remote host...")
    ssh_proc = subprocess.run(['ssh', 'airesume', remote_script], capture_output=True, text=True, encoding='utf-8', errors='replace')
    print(ssh_proc.stdout)
    if ssh_proc.stderr:
        print("STDERR:", ssh_proc.stderr)

    if ssh_proc.returncode != 0:
        print("Remote deploy failed!")
        sys.exit(1)

    # 7. Verification via live curl
    print("Verifying live deployment health...")
    time.sleep(3)
    health_check = subprocess.check_output(['curl.exe', '-s', 'https://airesume.projectdemo.guru/api/healthz']).decode('utf-8')
    print("Live healthz response:")
    print(health_check)

    if head_sha in health_check:
        print(f"\nSUCCESS: Commit {head_sha} is LIVE in PRODUCTION on https://airesume.projectdemo.guru")
    else:
        print(f"\nWarning: Expected commit {head_sha} in healthz output.")

if __name__ == '__main__':
    main()
