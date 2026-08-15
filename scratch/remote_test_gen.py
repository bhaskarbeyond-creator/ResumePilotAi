import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('82.112.232.112', port=65002, username='u727965524', key_filename=r'C:\Users\mbhas\.ssh\id_ed25519')

remote_code = r"""
const http = require('http');

function post(path, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = http.request('http://127.0.0.1:8080' + path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function run() {
    console.log('Testing /api/generate-summary ...');
    const res1 = await post('/api/generate-summary', {
        name: 'Test Candidate',
        jobTitle: 'Software Engineer',
        experience: '5 years of React and Node development',
        skills: 'JavaScript, Node.js, React',
        summaryType: 'professional'
    });
    console.log('Status:', res1.status);
    console.log('Response:', res1.body);

    console.log('\nTesting /api/generate-content ...');
    const res2 = await post('/api/generate-content', {
        operation: 'generate-summary',
        payload: {
            name: 'Test Candidate',
            jobTitle: 'Software Engineer',
            experience: '5 years of React and Node development',
            skills: 'JavaScript, Node.js, React'
        }
    });
    console.log('Status:', res2.status);
    console.log('Response:', res2.body);

    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/backend/scratch_test_gen.js', 'w') as f:
    f.write(remote_code)

node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH'
stdin, stdout, stderr = ssh.exec_command(f'{node_env} && cd /home/u727965524/backend && node scratch_test_gen.js')
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

try: sftp.remove('/home/u727965524/backend/scratch_test_gen.js')
except Exception: pass
ssh.close()
