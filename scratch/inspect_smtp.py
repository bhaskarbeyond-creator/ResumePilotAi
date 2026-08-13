import paramiko

def check_remote_smtp():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    key_path = r"C:\Users\mbhas\.ssh\id_ed25519"
    ssh.connect('82.112.232.112', port=65002, username='u727965524', key_filename=key_path)

    # Read backend/email_config.json if exists
    stdin, stdout, stderr = ssh.exec_command('cat /home/u727965524/backend/email_config.json 2>/dev/null || echo "NO_CONFIG_FILE"')
    out = stdout.read().decode('utf-8').strip()
    print("Remote email_config.json:", out)

    # Check PM2 backend logs for [Custom Reset] or SMTP errors
    stdin, stdout, stderr = ssh.exec_command('export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && pm2 logs airesume-backend --lines 40 --nostream')
    logs = stdout.read().decode('utf-8')
    print("\nRemote PM2 Logs:\n", logs)

    ssh.close()

if __name__ == '__main__':
    check_remote_smtp()
