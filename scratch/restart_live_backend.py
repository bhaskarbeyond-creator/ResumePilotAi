import paramiko, sys, time
sys.stdout.reconfigure(encoding='utf-8')

hostname = '82.112.232.112'
port = 65002
username = 'u727965524'
key_filename = r'C:\Users\mbhas\.ssh\id_ed25519'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, port=port, username=username, key_filename=key_filename)

# Check current running node process
print("[1] Checking running node processes...")
stdin, stdout, stderr = ssh.exec_command("ps aux | grep 'node.*backend' | grep -v grep")
out = stdout.read().decode('utf-8', errors='replace').strip()
print(f"    {out or '(no node backend process found)'}")

# Kill old and restart
print("\n[2] Restarting backend with new index.js...")
cmd = "pkill -f 'node /home/u727965524/backend/index.js' 2>/dev/null; sleep 2; cd /home/u727965524/backend && nohup node index.js >> /home/u727965524/backend/app.log 2>&1 & echo $!"
stdin2, stdout2, stderr2 = ssh.exec_command(cmd)
out2 = stdout2.read().decode('utf-8', errors='replace').strip()
err2 = stderr2.read().decode('utf-8', errors='replace').strip()
print(f"    New PID: {out2 or '(none)'}")
if err2:
    print(f"    STDERR: {err2}")

# Wait a moment then verify
time.sleep(4)
print("\n[3] Verifying backend started...")
stdin3, stdout3, stderr3 = ssh.exec_command("ps aux | grep 'node.*backend/index' | grep -v grep | head -3")
out3 = stdout3.read().decode('utf-8', errors='replace').strip()
print(f"    {out3 or '(no process found - check logs)'}")

# Show last few lines of log
print("\n[4] Last 5 lines of backend log...")
stdin4, stdout4, stderr4 = ssh.exec_command("tail -5 /home/u727965524/backend/app.log 2>/dev/null || echo 'No log file yet'")
out4 = stdout4.read().decode('utf-8', errors='replace').strip()
print(f"    {out4}")

ssh.close()
print("\n✅ Backend restart complete!")
