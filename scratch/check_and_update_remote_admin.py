import paramiko
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

node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH'

remote_script = '''
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
require('firebase/compat/auth');

const config = {
    apiKey: "YOUR_FIREBASE_WEB_API_KEY",
    authDomain: "ai-resume-builder-424cf.firebaseapp.com",
    databaseURL: "https://ai-resume-builder-424cf-default-rtdb.firebaseio.com",
    projectId: "ai-resume-builder-424cf",
    storageBucket: "ai-resume-builder-424cf.firebasestorage.app",
    messagingSenderId: "211275319433",
    appId: "1:211275319433:web:74ed0f5b652865422e1e58",
};

firebase.initializeApp(config);
const db = firebase.firestore();

async function run() {
    console.log("Checking Firestore for admin@admin.com...");
    const snapshot = await db.collection('users').get();
    let count = 0;
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.email === 'admin@admin.com' || (data.email && data.email.includes('admin@admin'))) {
            console.log("Found admin@admin.com in user document:", doc.id);
            db.collection('users').doc(doc.id).update({
                email: 'bhaskar.beyond@gmail.com',
                isA: true
            });
            count++;
        }
    });

    // Check data/meta or system settings
    const metaDoc = await db.collection('data').doc('meta').get();
    if (metaDoc.exists) {
        const meta = metaDoc.data();
        if (meta.adminEmail === 'admin@admin.com') {
            await db.collection('data').doc('meta').update({ adminEmail: 'bhaskar.beyond@gmail.com' });
            console.log("Updated data/meta adminEmail to bhaskar.beyond@gmail.com");
        }
    }

    console.log(`Finished updating ${count} Firestore records.`);
    process.exit(0);
}

run().catch(err => {
    console.error("Firestore Error:", err.message);
    process.exit(1);
});
'''

with sftp.open('/home/u727965524/update_admin_db.js', 'w') as f:
    f.write(remote_script)

sftp.close()

commands = [
    f'grep -rn "admin@admin.com" /home/u727965524/domains/ /home/u727965524/backend/ 2>/dev/null || echo "No files matched admin@admin.com on remote filesystem."',
    f'{node_env} && cd /home/u727965524/backend && node /home/u727965524/update_admin_db.js 2>&1'
]

for cmd in commands:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    print(f"\n$ {cmd}")
    if out:
        print(out)
    if err:
        print(f"STDERR: {err}")

ssh.close()
