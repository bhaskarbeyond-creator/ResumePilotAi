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

console.log('\n=== EARNINGS FORENSIC DIAGNOSTIC ===\n');

// 1. Check data/earnings document
const earningsSnap = await db.collection('data').doc('earnings').get();
console.log('--- data/earnings ---');
console.log(JSON.stringify(earningsSnap.data(), null, 2));

// 2. Check ALL payment_orders documents
const allPayments = await db.collection('payment_orders').get();
console.log(`\n--- payment_orders (total: ${allPayments.size}) ---`);
let totalAll = 0;
allPayments.forEach(doc => {
    const d = doc.data();
    totalAll += Number(d.amount || 0);
    console.log(`  ${doc.id}: status=${d.status}, amount=${d.amount}, currency=${d.currency}, planType=${d.planType || d.plan || 'N/A'}`);
});
console.log(`  TOTAL (all statuses): ${totalAll}`);

// 3. Check only ACTIVE/COMPLETED/PAID payment_orders (what the code queries)
const paidPayments = await db.collection('payment_orders').where('status', 'in', ['ACTIVE', 'COMPLETED', 'PAID']).get();
console.log(`\n--- payment_orders WHERE status IN (ACTIVE, COMPLETED, PAID) (total: ${paidPayments.size}) ---`);
let totalPaid = 0;
paidPayments.forEach(doc => {
    const d = doc.data();
    totalPaid += Number(d.amount || 0);
    console.log(`  ${doc.id}: status=${d.status}, amount=${d.amount}, price=${d.price}, currency=${d.currency}`);
});
console.log(`  TOTAL (paid): ${totalPaid}`);

// 4. Check the code path calculation
console.log('\n--- CODE PATH ANALYSIS ---');
const earningsData = earningsSnap.exists ? earningsSnap.data() : {};
console.log(`earningsData.amount = ${earningsData.amount}`);
console.log(`realPaidEarnings (from payment_orders) = ${totalPaid}`);
console.log(`Condition: realPaidEarnings > 0 || !earningsData.amount = ${totalPaid > 0 || !earningsData.amount}`);
if (totalPaid > 0 || !earningsData.amount) {
    const finalAmount = totalPaid > 0 ? totalPaid : Number(earningsData.amount || earningsData.total || 0);
    console.log(`RESULT (code branch 1): ${finalAmount}`);
} else {
    console.log(`RESULT (code branch 2): ${earningsData.amount}`);
}

process.exit(0);
