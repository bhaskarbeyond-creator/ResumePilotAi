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

async function insertUserAndResume() {
    const pool = getPool();
    await pool.query(\`
        INSERT INTO users (id, email, displayName, role) 
        VALUES ('ZEc4XE719BdfxnVPPuuUAMGzo3R2', 'bhaskar@beyond.com', 'Bhaskar Babu', 'USER') 
        ON DUPLICATE KEY UPDATE displayName=VALUES(displayName)
    \`);

    const doc = await firestoreDb.collection('users').doc('ZEc4XE719BdfxnVPPuuUAMGzo3R2').collection('resumes').doc('resume_1786036591620').get();
    const data = doc.data() || {};

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

    // Check portfolio
    const fsPorts = await firestoreDb.collectionGroup('portfolios').get();
    for (const pDoc of fsPorts.docs) {
        const parts = pDoc.ref.path.split('/');
        const uId = parts[1];
        await pool.query(\`
            INSERT INTO users (id, email, displayName, role) 
            VALUES (?, 'user@projectdemo.guru', 'Portfolio Owner', 'USER') 
            ON DUPLICATE KEY UPDATE id=id
        \`, [uId]);

        await pool.query(\`
            INSERT INTO portfolios (id, user_id, title, template, status, created_at, updated_at)
            VALUES (?, ?, ?, 'default', 'draft', NOW(), NOW())
            ON DUPLICATE KEY UPDATE title=VALUES(title)
        \`, [pDoc.id, uId, pDoc.data()?.title || 'Portfolio']);
    }

    // Ensure users document exists in Firestore too
    await firestoreDb.collection('users').doc('ZEc4XE719BdfxnVPPuuUAMGzo3R2').set({
        email: 'bhaskar@beyond.com',
        displayName: 'Bhaskar Babu',
        role: 'USER',
        updatedAt: new Date()
    }, { merge: true });

    console.log('Inserted orphaned parent user and resume into MySQL & Firestore.');
    process.exit(0);
}

insertUserAndResume().catch(console.error);
`;

fs.writeFileSync('scripts/remote_insert_user_and_resume.js', code);
execSync('scp -o BatchMode=yes scripts/remote_insert_user_and_resume.js airesume:~/backend/remote_insert_user_and_resume.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_insert_user_and_resume.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_insert_user_and_resume.js"');
fs.unlinkSync('scripts/remote_insert_user_and_resume.js');
