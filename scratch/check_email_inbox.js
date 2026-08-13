const path = require('path');
const admin = require(path.join(__dirname, '../backend/node_modules/firebase-admin'));
const serviceAccount = require(path.join(__dirname, '../backend/serviceAccountKey.json'));

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function checkLogs() {
    console.log('Querying email_logs for password_changed_confirm or messageId d12421c7...');
    const snap = await db.collection('email_logs').get();
    console.log(`Total email logs found: ${snap.size}`);
    
    let found = false;
    snap.forEach(doc => {
        const d = doc.data();
        if ((d.messageId && d.messageId.includes('d12421c7')) || d.templateType === 'password_changed_confirm' || (d.subject && d.subject.includes('password'))) {
            found = true;
            console.log('\n--- MATCH FOUND ---');
            console.log('Doc ID:', doc.id);
            console.log('Recipient:', d.recipient);
            console.log('Subject:', d.subject);
            console.log('Template:', d.templateType);
            console.log('Status:', d.status);
            console.log('SentAt:', d.sentAt);
            console.log('Message ID:', d.messageId);
        }
    });

    if (!found) {
        console.log('No specific match found. Displaying latest 5 logs:');
        const latestSnap = await db.collection('email_logs').orderBy('sentAt', 'desc').limit(5).get();
        latestSnap.forEach(doc => {
            console.log(doc.id, '->', doc.data());
        });
    }
}

checkLogs().then(() => process.exit(0)).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
