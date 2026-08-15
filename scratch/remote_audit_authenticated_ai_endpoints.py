import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('82.112.232.112', port=65002, username='u727965524', key_filename=r'C:\Users\mbhas\.ssh\id_ed25519')

remote_code = r"""
require('dotenv').config();
const admin = require('./services/firebaseAdmin');

const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

if (clientEmail && privateKey) {
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }), projectId });
} else {
    admin.initializeApp({ projectId });
}

const http = require('http');

function post(path, body, token) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        };
        if (token) {
            headers['Authorization'] = 'Bearer ' + token;
        }
        const req = http.request('http://127.0.0.1:8080' + path, {
            method: 'POST',
            headers
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

async function auditAllEndpoints() {
    console.log('====================================================');
    console.log('🤖 AUTHENTICATED AI INTEGRATION ENDPOINTS AUDIT');
    console.log('====================================================\n');

    const { setTokenVerifierForTests } = require('./security/auth');
    setTokenVerifierForTests(async (token) => {
        return {
            uid: 'test-admin-uid',
            email: 'bhaskar.beyond@gmail.com',
            email_verified: true,
            role: 'ADMIN',
            permissions: ['*']
        };
    });

    const mockToken = 'mock-valid-id-token';

    const tests = [
        {
            name: '1. POST /api/generate-summary',
            path: '/api/generate-summary',
            body: { name: 'Bhaskar', jobTitle: 'Full Stack Engineer', experience: '8 years', skills: ['React', 'Node.js', 'Python'], language: 'en' }
        },
        {
            name: '2. POST /api/generate-work-description',
            path: '/api/generate-work-description',
            body: { jobTitle: 'Senior Software Engineer', employer: 'Tech Corp', language: 'en' }
        },
        {
            name: '3. POST /api/generate-education-description',
            path: '/api/generate-education-description',
            body: { degree: 'Bachelor of Science in Computer Science', school: 'University', language: 'en' }
        },
        {
            name: '4. POST /api/generate-skills',
            path: '/api/generate-skills',
            body: { occupation: 'Frontend Developer', category: 'Technical Skills' }
        },
        {
            name: '5. POST /api/check-grammar',
            path: '/api/check-grammar',
            body: { text: 'I has been working as engineer for five years.' }
        },
        {
            name: '6. POST /api/generate-content (enhance-single-bullet)',
            path: '/api/generate-content',
            body: { operation: 'enhance-single-bullet', payload: { bullet: 'Fixed bugs and improved performance', jobTitle: 'Software Developer' } }
        },
        {
            name: '7. POST /api/generate-content (generate-certifications)',
            path: '/api/generate-content',
            body: { operation: 'generate-certifications', payload: { jobTitle: 'DevOps Engineer' } }
        },
        {
            name: '8. POST /api/generate-content (autocomplete)',
            path: '/api/generate-content',
            body: { operation: 'autocomplete', payload: { type: 'skill', query: 'React' } }
        },
        {
            name: '9. POST /api/generate-resume',
            path: '/api/generate-resume',
            body: { occupation: 'Full Stack Developer', experienceLevel: 'senior-level', skills: ['React', 'Node.js'], education: ['BS CS'] }
        },
        {
            name: '10. POST /api/parse-resume',
            path: '/api/parse-resume',
            body: { rawText: 'Bhaskar Beyond\nFull Stack Engineer\nExperience: 8 years building web applications with React and Node.js.\nSkills: JavaScript, React, Node.js, Python, PostgreSQL.' }
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const t of tests) {
        try {
            console.log(`Testing ${t.name} ...`);
            const res = await post(t.path, t.body, mockToken);
            let parsed = {};
            try { parsed = JSON.parse(res.body); } catch (_) {}
            
            if (res.status === 200) {
                console.log(`  ✅ PASSED (HTTP 200) - Sample output:`, JSON.stringify(parsed).slice(0, 150) + '...\n');
                passed++;
            } else {
                console.log(`  ❌ FAILED (HTTP ${res.status}):`, res.body.slice(0, 200) + '\n');
                failed++;
            }
        } catch (e) {
            console.log(`  ❌ EXCEPTION: ${e.message}\n`);
            failed++;
        }
    }

    console.log(`====================================================`);
    console.log(`AUTHENTICATED AUDIT SUMMARY: ${passed}/${tests.length} ENDPOINTS PASSED CLEANLY`);
    console.log(`====================================================`);
    process.exit(failed > 0 ? 1 : 0);
}

auditAllEndpoints().catch(e => { console.error(e); process.exit(1); });
"""

sftp = ssh.open_sftp()
with sftp.file('/home/u727965524/backend/scratch_audit_ai_endpoints_auth.js', 'w') as f:
    f.write(remote_code)

node_env = 'export PATH=/home/u727965524/.local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH && export NODE_ENV=test'
stdin, stdout, stderr = ssh.exec_command(f'{node_env} && cd /home/u727965524/backend && node scratch_audit_ai_endpoints_auth.js')
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

try: sftp.remove('/home/u727965524/backend/scratch_audit_ai_endpoints_auth.js')
except Exception: pass
ssh.close()
