const paramiko = require('child_process');
const fs = require('fs');

// Create remote script content
const scriptContent = `
const admin = require('./services/firebaseAdmin');
const dotenv = require('dotenv');
dotenv.config();

if (!admin.apps.length) {
    admin.initializeApp();
}

async function listAdmins() {
    try {
        const list = await admin.auth().listUsers(100);
        console.log('--- USER ACCOUNTS & CLAIMS ---');
        list.users.forEach(u => {
            console.log(\`Email: \${u.email} | UID: \${u.uid} | Claims: \${JSON.stringify(u.customClaims || {})}\`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}
listAdmins();
`;

fs.writeFileSync('scratch/remote_list_users.js', scriptContent);
console.log('Created scratch/remote_list_users.js');
