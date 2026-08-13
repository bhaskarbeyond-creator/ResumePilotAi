const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function run() {
    console.log('Fetching logs...');
    const snap = await db.collection('email_logs').get();
    console.log('Total email logs in DB:', snap.size);
    snap.forEach(doc => {
        const d = doc.data();
        if ((d.messageId && d.messageId.includes('d12421c7')) || d.templateType === 'password_changed_confirm' || (d.subject && d.subject.includes('Password'))) {
            console.log('\n--- MATCH FOUND ---');
            console.log('Doc ID:', doc.id);
            console.log('Recipient:', d.recipient);
            console.log('Subject:', d.subject);
            console.log('Template:', d.templateType);
            console.log('Status:', d.status);
            console.log('Message ID:', d.messageId);
        }
    });
}

run().then(() => process.exit(0)).catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
