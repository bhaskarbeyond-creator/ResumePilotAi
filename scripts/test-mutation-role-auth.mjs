import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const adminMod = await import('../backend/services/firebaseAdmin.js');
const admin = adminMod.default || adminMod;

if (!admin.apps.length) {
    const pKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: pKey,
        }),
    });
}

async function testEndpoint() {
    const token = await admin.auth().createCustomToken('OhZdiSIFL7ePA1TMkfu9bnR935D3', {
        role: 'SUPER_ADMIN',
        superAdmin: true,
        email: 'bhaskar.beyond@gmail.com'
    });

    const res = await fetch('http://localhost:8080/api/platform/role-view-audit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetRole: 'SUPPORT' })
    });

    const data = await res.json();
    console.log('HTTP Status:', res.status);
    console.log('Response Body:', data);

    if (res.status === 200 && data.success) {
        console.log('PASS: Endpoint functions correctly!');
        process.exit(0);
    } else {
        console.log('MUTATION DETECTED: Endpoint correctly failed under mutation!');
        process.exit(1);
    }
}

testEndpoint();
