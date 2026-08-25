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

console.log('=== 1. DATA/EARNINGS DOCUMENT ===');
const earningsSnap = await db.collection('data').doc('earnings').get();
console.log('data/earnings:', earningsSnap.exists ? earningsSnap.data() : 'DOES NOT EXIST');

console.log('\n=== 2. ALL COLLECTIONS IN FIRESTORE ===');
const collections = await db.listCollections();
console.log('Collections:', collections.map(c => c.id).join(', '));

console.log('\n=== 3. ALL PAYMENT ORDERS ===');
const ordersSnap = await db.collection('payment_orders').get();
console.log(`Total payment orders found: ${ordersSnap.size}`);
ordersSnap.forEach(doc => {
    console.log(`- ID: ${doc.id}`);
    console.log('  Data:', JSON.stringify(doc.data(), null, 2));
});

console.log('\n=== 4. USERS AND SUBSCRIPTIONS ===');
const usersSnap = await db.collection('users').get();
console.log(`Total users: ${usersSnap.size}`);
usersSnap.forEach(doc => {
    const d = doc.data();
    console.log(`- User ${doc.id} (${d.email || d.displayName || 'no-email'}): plan=${d.subscription?.planId || d.plan || d.membership || 'free'}, role=${d.role || 'user'}`);
});

process.exit(0);
