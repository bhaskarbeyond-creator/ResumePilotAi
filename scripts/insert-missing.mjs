import { execSync } from 'child_process';
import fs from 'fs';

const code = `
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const admin = require('./services/firebaseAdmin');
if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\\\n/g, '\\n'),
            }),
            projectId
        });
    } else {
        admin.initializeApp({ projectId });
    }
}
const firestoreDb = admin.firestore();
const { getPool } = require('./database/mysql');

async function insertMissing() {
    const pool = getPool();
    const doc = await firestoreDb.collection('users').doc('ZEc4XE719BdfxnVPPuuUAMGzo3R2').collection('resumes').doc('resume_1786036591620').get();
    const data = doc.data();

    await pool.query(\`
        INSERT INTO resumes (id, user_id, title, template, firstname, lastname, email, phone, occupation, address, summary, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE title = VALUES(title), template = VALUES(template)
    \`, [
        'resume_1786036591620',
        'ZEc4XE719BdfxnVPPuuUAMGzo3R2',
        data.occupation || 'Account Manager Digital Display',
        data.template || 'Cv3',
        data.firstname || 'Bhaskar',
        data.lastname || 'Babu',
        data.email || '',
        data.phone || '',
        data.occupation || 'Account Manager Digital Display',
        data.address || '',
        data.summary || ''
    ]);

    console.log('Inserted resume_1786036591620 into MySQL.');
    process.exit(0);
}

insertMissing().catch(console.error);
`;

fs.writeFileSync('scripts/remote_insert_missing.js', code);
execSync('scp -o BatchMode=yes scripts/remote_insert_missing.js airesume:~/backend/remote_insert_missing.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_insert_missing.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_insert_missing.js"');
fs.unlinkSync('scripts/remote_insert_missing.js');
