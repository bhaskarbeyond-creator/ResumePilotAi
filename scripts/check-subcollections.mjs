import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../backend/.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

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

console.log('=== FIRESTORE SUBCOLLECTION INSPECTION ===');
const usersSnap = await db.collection('users').get();
let totalResumes = 0;
let totalPortfolios = 0;
let totalCovers = 0;

for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const [rSnap, pSnap, cSnap] = await Promise.all([
        db.collection('users').doc(userId).collection('resumes').get(),
        db.collection('users').doc(userId).collection('portfolios').get(),
        db.collection('users').doc(userId).collection('covers').get(),
    ]);
    totalResumes += rSnap.size;
    totalPortfolios += pSnap.size;
    totalCovers += cSnap.size;
    if (rSnap.size > 0 || pSnap.size > 0 || cSnap.size > 0) {
        console.log(`User ${userId} (${userDoc.data().email || 'no-email'}):`);
        console.log(`  - Resumes: ${rSnap.size}`);
        console.log(`  - Portfolios: ${pSnap.size}`);
        console.log(`  - Covers: ${cSnap.size}`);
    }
}

console.log('\n--- TOTAL SUBCOLLECTIONS ACROSS ALL USERS ---');
console.log(`Total Resumes: ${totalResumes}`);
console.log(`Total Portfolios: ${totalPortfolios}`);
console.log(`Total Covers: ${totalCovers}`);
console.log(`Total Combined Engineered Artifacts: ${totalResumes + totalPortfolios + totalCovers}`);

process.exit(0);
