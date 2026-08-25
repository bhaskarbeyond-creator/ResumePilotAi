import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const adminModule = await import('../backend/services/firebaseAdmin.js');
const admin = adminModule.default;
if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf';
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
            projectId,
        });
    } else {
        admin.initializeApp({ projectId });
    }
}
const db = admin.firestore();

const [statsSnap, earningsSnap, usersSnap] = await Promise.all([
    db.collection('data').doc('stats').get(),
    db.collection('data').doc('earnings').get(),
    db.collection('users').get()
]);

console.log('=== REAL FIRESTORE RAW DATA ===');
console.log('Firestore data/stats exists:', statsSnap.exists, statsSnap.data());
console.log('Firestore data/earnings exists:', earningsSnap.exists, earningsSnap.data());
console.log('Firestore total users count:', usersSnap.size);
console.log('===============================');
process.exit(0);
