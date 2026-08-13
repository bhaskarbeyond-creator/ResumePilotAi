const admin = require('firebase-admin');

// Initialize Firebase Admin with default or env config if available
// Let's check Firestore REST endpoint for user profile
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function inspectUser() {
    const email = "bhaskar.beyond@gmail.com";
    console.log(`Checking account status for: ${email}`);

    // Check backend API endpoints
    try {
        const res = await fetch(`https://airesume.projectdemo.guru/api/index.php?path=check-user&email=${encodeURIComponent(email)}`);
        const data = await res.json().catch(() => ({}));
        printData("Backend response:", data);
    } catch (e) {
        console.log("Backend check note:", e.message);
    }
}

inspectUser();
