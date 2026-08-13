import paramiko

def test_remote_admin():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    key_path = r"C:\Users\mbhas\.ssh\id_ed25519"
    ssh.connect('82.112.232.112', port=65002, username='u727965524', key_filename=key_path)

    # Test node command inside /home/u727965524/backend
    cmd = '''export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && cd /home/u727965524/backend && node -e "
const admin = require('firebase-admin');
try {
    if (!admin.apps.length) {
        admin.initializeApp({ projectId: 'ai-resume-builder-424cf' });
    }
    console.log('Apps length:', admin.apps.length);
} catch(e) {
    console.log('Err:', e.message);
}
"'''
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8').strip()
    err = stderr.read().decode('utf-8').strip()
    print("Node output:", out)
    print("Node error:", err)

    ssh.close()

if __name__ == '__main__':
    test_remote_admin()
