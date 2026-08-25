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

console.log('\n=== FIXING FIRESTORE CURRENCY & STATS ===\n');

// The user's intended currency is INR (set via Subscription Settings → subscriptions.currency = "INR")
// But data/system_settings.currency was overwritten to "USD" by a previous operation.
// Also data/public_config.currency is "USD".
// Fix: Set both to "INR" to align with the user's subscription settings.

const batch = db.batch();

// 1. Fix data/system_settings.currency → INR
const sysRef = db.collection('data').doc('system_settings');
batch.set(sysRef, {
    currency: 'INR',
    currencyMeta: {
        code: 'INR',
        symbol: '₹',
        name: 'Indian Rupee',
        subunit: 'Paise',
        decimals: 2,
        defaultLocale: 'en-IN',
    },
    currencyUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    currencyUpdatedBy: 'system-fix-align-to-subscription-settings',
}, { merge: true });
console.log('✓ data/system_settings.currency → INR');

// 2. Fix data/public_config.currency → INR
const pubRef = db.collection('data').doc('public_config');
batch.set(pubRef, {
    currency: 'INR',
    currencySymbol: '₹',
}, { merge: true });
console.log('✓ data/public_config.currency → INR');

// 3. Fix data/stats — set correct live counts
const sRef = db.collection('data').doc('stats');
batch.set(sRef, {
    numberOfUsers: 9,
    numberOfResumesCreated: 1, // 0 resumes + 1 portfolio + 0 covers = 1
    numberOfResumesDownloaded: 124,
}, { merge: false }); // full overwrite to remove stale negative values
console.log('✓ data/stats → numberOfUsers:9, numberOfResumesCreated:1, numberOfResumesDownloaded:124');

// 4. Fix data/earnings — add currency field
const eRef = db.collection('data').doc('earnings');
batch.set(eRef, {
    amount: 2000,
    currency: 'INR',
}, { merge: true });
console.log('✓ data/earnings.currency → INR');

await batch.commit();
console.log('\n✅ All Firestore documents fixed.\n');

// Verify
const { getPlatformCurrencyConfig } = await import('../backend/services/platformCurrency.js');
const result = await getPlatformCurrencyConfig(db);
console.log('--- getPlatformCurrencyConfig RESULT (post-fix) ---');
console.log(JSON.stringify(result, null, 2));

const statsSnap = await db.collection('data').doc('stats').get();
console.log('\n--- data/stats (post-fix) ---');
console.log(JSON.stringify(statsSnap.data(), null, 2));

const earningsSnap = await db.collection('data').doc('earnings').get();
console.log('\n--- data/earnings (post-fix) ---');
console.log(JSON.stringify(earningsSnap.data(), null, 2));

process.exit(0);
