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

async function checkUsers() {
    const pool = getPool();
    const [mysqlUsers] = await pool.query('SELECT id, email, displayName FROM users');
    const fsUsers = await firestoreDb.collection('users').get();
    const fsIds = new Set(fsUsers.docs.map(d => d.id));

    console.log('MySQL Users (11):');
    for (const u of mysqlUsers) {
        console.log('  -', u.id, u.email, fsIds.has(u.id) ? '(In Firestore)' : '(NOT in Firestore)');
    }

    console.log('\\nFirestore Users (9):');
    for (const d of fsUsers.docs) {
        console.log('  -', d.id, d.data().email);
    }
    process.exit(0);
}

checkUsers().catch(console.error);
`;

fs.writeFileSync('scripts/remote_check_users.js', code);
execSync('scp -o BatchMode=yes scripts/remote_check_users.js airesume:~/backend/remote_check_users.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_check_users.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_check_users.js"');
fs.unlinkSync('scripts/remote_check_users.js');
