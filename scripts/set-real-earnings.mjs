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

console.log('\n=== UPDATING DATA/EARNINGS TO TRUE TRANSACTIONAL TOTAL ===\n');

// Real paid order in database:
// BdYk7vs4NhkqVBYaOSHm: amount = 49900 paise = 499 INR
await db.collection('data').doc('earnings').set({
    amount: 499,
    currency: 'INR',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    note: 'Verified from Razorpay payment pay_TTxBxrNES5Uucs (49900 paise = ₹499.00)'
}, { merge: true });

console.log('✓ data/earnings updated to amount: 499, currency: INR');

const snap = await db.collection('data').doc('earnings').get();
console.log('Verified data/earnings content:', JSON.stringify(snap.data(), null, 2));

process.exit(0);
