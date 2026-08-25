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

async function findMismatches() {
    const pool = getPool();
    const [mysqlRes] = await pool.query('SELECT id, user_id, title FROM resumes');
    const mysqlIds = new Set(mysqlRes.map(r => r.id));

    const fsRes = await firestoreDb.collectionGroup('resumes').get();
    console.log('--- Resumes in Firestore not in MySQL ---');
    for (const doc of fsRes.docs) {
        if (!mysqlIds.has(doc.id)) {
            console.log('Extra FS Resume ID:', doc.id, 'Path:', doc.ref.path, 'Title:', doc.data().title);
        }
    }

    const [mysqlPort] = await pool.query('SELECT id, user_id FROM portfolios');
    const portIds = new Set(mysqlPort.map(p => p.id));
    const fsPorts = await firestoreDb.collectionGroup('portfolios').get();
    console.log('--- Portfolios in Firestore not in MySQL ---');
    for (const doc of fsPorts.docs) {
        if (!portIds.has(doc.id)) {
            console.log('Extra FS Portfolio ID:', doc.id, 'Path:', doc.ref.path);
        }
    }

    const [mysqlUsers] = await pool.query('SELECT id, email FROM users');
    console.log('MySQL Users:', mysqlUsers.length);
    const fsUsers = await firestoreDb.collection('users').get();
    console.log('Firestore Users:', fsUsers.size);

    process.exit(0);
}

findMismatches().catch(console.error);
`;

fs.writeFileSync('scripts/remote_find_mismatches.js', code);
execSync('scp -o BatchMode=yes scripts/remote_find_mismatches.js airesume:~/backend/remote_find_mismatches.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_find_mismatches.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_find_mismatches.js"');
fs.unlinkSync('scripts/remote_find_mismatches.js');
