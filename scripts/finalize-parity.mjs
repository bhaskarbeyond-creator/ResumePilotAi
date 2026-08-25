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

async function finalizeParity() {
    const pool = getPool();

    // 1. Clean up temporary test probe users from MySQL
    await pool.query("DELETE FROM users WHERE id LIKE 'usr_auth_live_%' OR id LIKE 'probe_%' OR id LIKE 'usr_auto_sync_%'");
    await pool.query("DELETE FROM resumes WHERE user_id LIKE 'usr_auth_live_%' OR user_id LIKE 'probe_%' OR user_id LIKE 'usr_auto_sync_%'");

    // 2. Ensure parent user for portfolios exists
    await pool.query("INSERT INTO users (id, email, displayName, role) VALUES ('XSHsFEteFP14qs9r6nDz', 'bhaskar@beyond.com', 'Bhaskar Babu Madala', 'USER') ON DUPLICATE KEY UPDATE displayName=VALUES(displayName)");

    // 3. Insert 2nd portfolio into MySQL
    await pool.query(\`
        INSERT INTO portfolios (id, user_id, title, theme, is_published, data, created_at, updated_at)
        VALUES ('XSHsFEteFP14qs9r6nDz', 'XSHsFEteFP14qs9r6nDz', 'Bhaskar Babu Madala', 'default', 0, '{}', NOW(), NOW())
        ON DUPLICATE KEY UPDATE title=VALUES(title)
    \`);

    // 4. Ensure all 9 Firestore users exist in MySQL
    const fsUsers = await firestoreDb.collection('users').get();
    for (const uDoc of fsUsers.docs) {
        const u = uDoc.data();
        await pool.query(\`
            INSERT INTO users (id, email, displayName, role)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE displayName=VALUES(displayName), email=VALUES(email)
        \`, [uDoc.id, u.email || 'user@projectdemo.guru', u.displayName || 'User', u.role || 'USER']);
    }

    console.log('Finalized parity.');
    process.exit(0);
}

finalizeParity().catch(console.error);
`;

fs.writeFileSync('scripts/remote_finalize_parity.js', code);
execSync('scp -o BatchMode=yes scripts/remote_finalize_parity.js airesume:~/backend/remote_finalize_parity.js');
const out = execSync('ssh -o BatchMode=yes airesume "cd ~/backend && /opt/alt/alt-nodejs20/root/usr/bin/node remote_finalize_parity.js"').toString();
console.log(out);
execSync('ssh -o BatchMode=yes airesume "rm -f ~/backend/remote_finalize_parity.js"');
fs.unlinkSync('scripts/remote_finalize_parity.js');
