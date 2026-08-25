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
console.log('\n=== FIRESTORE CURRENCY DIAGNOSTIC ===\n');

// Check all possible currency configuration sources
const docs = [
    { path: 'data/system_settings', label: 'data/system_settings' },
    { path: 'data/public_config', label: 'data/public_config' },
    { path: 'data/subscriptions', label: 'data/subscriptions' },
    { path: 'settings/payment_providers', label: 'settings/payment_providers' },
    { path: 'data/earnings', label: 'data/earnings' },
    { path: 'data/stats', label: 'data/stats' },
];

for (const { path: docPath, label } of docs) {
    const [collection, docId] = docPath.split('/');
    const snap = await db.collection(collection).doc(docId).get();
    console.log(`\n--- ${label} ---`);
    console.log(`  exists: ${snap.exists}`);
    if (snap.exists) {
        const data = snap.data();
        console.log(`  keys: ${Object.keys(data).join(', ')}`);
        // Print currency-related fields
        if (data.currency) console.log(`  currency: "${data.currency}"`);
        if (data.defaultCurrency) console.log(`  defaultCurrency: "${data.defaultCurrency}"`);
        if (data.currencyMeta) console.log(`  currencyMeta: ${JSON.stringify(data.currencyMeta)}`);
        if (data.subscriptions?.currency) console.log(`  subscriptions.currency: "${data.subscriptions.currency}"`);
        if (data.subscriptions) console.log(`  subscriptions keys: ${Object.keys(data.subscriptions).join(', ')}`);
        // Print stats-related fields
        if (data.numberOfUsers !== undefined) console.log(`  numberOfUsers: ${data.numberOfUsers}`);
        if (data.users !== undefined) console.log(`  users: ${data.users}`);
        if (data.numberOfResumesCreated !== undefined) console.log(`  numberOfResumesCreated: ${data.numberOfResumesCreated}`);
        if (data.resumes !== undefined) console.log(`  resumes: ${data.resumes}`);
        if (data.numberOfResumesDownloaded !== undefined) console.log(`  numberOfResumesDownloaded: ${data.numberOfResumesDownloaded}`);
        if (data.downloads !== undefined) console.log(`  downloads: ${data.downloads}`);
        if (data.amount !== undefined) console.log(`  amount: ${data.amount}`);
        if (data.total !== undefined) console.log(`  total: ${data.total}`);
    }
}

// Live collection counts
console.log('\n--- LIVE COLLECTION COUNTS ---');
const usersCnt = (await db.collection('users').count().get()).data().count;
const resumesCnt = (await db.collection('resumes').count().get()).data().count;
const portfoliosCnt = (await db.collection('portfolios').count().get()).data().count;
const coversCnt = (await db.collection('covers').count().get()).data().count;
const paymentsCnt = (await db.collection('payment_orders').count().get()).data().count;
console.log(`  users: ${usersCnt}`);
console.log(`  resumes: ${resumesCnt}`);
console.log(`  portfolios: ${portfoliosCnt}`);
console.log(`  covers: ${coversCnt}`);
console.log(`  payment_orders: ${paymentsCnt}`);

// Now run getPlatformCurrencyConfig
const { getPlatformCurrencyConfig } = await import('../backend/services/platformCurrency.js');
const result = await getPlatformCurrencyConfig(db);
console.log('\n--- getPlatformCurrencyConfig RESULT ---');
console.log(JSON.stringify(result, null, 2));

process.exit(0);
