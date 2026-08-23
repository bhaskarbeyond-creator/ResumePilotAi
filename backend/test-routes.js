require('dotenv').config({ path: 'd:/xampp/htdocs/ai-resume-builder/backend/.env' });
const firebaseAdmin = require('d:/xampp/htdocs/ai-resume-builder/backend/services/firebaseAdmin');

const endpoints = [
    // Dashboard & Logs
    { method: 'GET', path: '/api/platform/overview', superAdmin: false },
    { method: 'GET', path: '/api/admin/audit-logs', superAdmin: false },
    { method: 'GET', path: '/api/admin/audit-logs/stats', superAdmin: false },
    { method: 'GET', path: '/api/platform/queues', superAdmin: false },
    { method: 'GET', path: '/api/platform/security-events', superAdmin: false },
    { method: 'GET', path: '/api/platform/attention', superAdmin: false },
    
    // Tenants
    { method: 'GET', path: '/api/enterprise/tenants', superAdmin: false },
    { method: 'POST', path: '/api/platform/tenants/test-tenant/decommission', superAdmin: true, body: { reason: 'forensic audit testing' } },
    
    // Users & Operators
    { method: 'GET', path: '/api/admin/users?limit=10', superAdmin: false },
    { method: 'GET', path: '/api/platform/operators', superAdmin: false },
    
    // Operations & Settings
    { method: 'GET', path: '/api/platform/command-center', superAdmin: false },
    { method: 'POST', path: '/api/admin/settings/general', superAdmin: false, body: {} },
    { method: 'POST', path: '/api/admin/system-health-settings', superAdmin: false, body: {} },
    { method: 'POST', path: '/api/admin/gdpr-settings', superAdmin: false, body: {} },
    { method: 'POST', path: '/api/admin/ai-settings', superAdmin: true, body: {} },
    { method: 'POST', path: '/api/admin/payment-settings', superAdmin: true, body: {} },
    { method: 'POST', path: '/api/admin/twilio-settings', superAdmin: true, body: {} },
    { method: 'POST', path: '/api/admin/firebase-service-account', superAdmin: true, body: {} },

    // Messages, Reviews, Trusted By
    { method: 'POST', path: '/api/admin/trusted-by', superAdmin: false, body: { items: [] } },
    { method: 'POST', path: '/api/admin/reviews', superAdmin: false, body: { items: [] } },
    { method: 'POST', path: '/api/admin/global-rating', superAdmin: false, body: { rating: 5, totalReviews: 100 } },
    
    // CMS / Blog / Phrases
    { method: 'POST', path: '/api/admin/blog/categories', superAdmin: false, body: {} },
    { method: 'POST', path: '/api/admin/landing-content', superAdmin: false, body: { items: [] } },
    { method: 'POST', path: '/api/admin/website-meta', superAdmin: false, body: {} },
];

async function run() {
    try {
        const customToken = await firebaseAdmin.auth().createCustomToken('super-test-forensic');
        console.log("Token acquired.");
        
        // This is a local verification script, we assume a local server is running on port 3000
        const baseUrl = 'http://localhost:3000';
        
        // Exchange custom token for ID token using Firebase REST API
        const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
        if (!apiKey) throw new Error("Missing API Key");
        
        const verifyRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: customToken, returnSecureToken: true })
        });
        const verifyData = await verifyRes.json();
        const idToken = verifyData.idToken;

        let pass = true;
        for (const ep of endpoints) {
            console.log(`Testing ${ep.method} ${ep.path}...`);
            const res = await fetch(`${baseUrl}${ep.path}`, {
                method: ep.method,
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                },
                body: ep.method === 'POST' ? JSON.stringify(ep.body) : undefined
            });
            
            const status = res.status;
            // 404 is bad. 401 is bad. 403 might be expected for some if strict role isn't met but we are super admin.
            // 400 is fine (validation error means route exists). 200/201/204 is fine.
            if (status === 404) {
                console.error(`❌ Route missing (404): ${ep.method} ${ep.path}`);
                pass = false;
            } else if (status === 401) {
                console.error(`❌ Auth failed (401): ${ep.method} ${ep.path}`);
                pass = false;
            } else if (status === 500) {
                console.error(`❌ Server error (500): ${ep.method} ${ep.path}`);
                pass = false;
            } else {
                console.log(`✅ ${status} OK`);
            }
        }
        
        if (pass) console.log("All routes verified successfully.");
        else console.log("Some routes failed zero-tolerance audit.");
        process.exit(pass ? 0 : 1);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
