const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_KEY;
const ADMIN_EMAIL = process.env.LIVE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.LIVE_ADMIN_PASSWORD;
if (!API_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('Set FIREBASE_WEB_API_KEY (or VITE_FIREBASE_KEY), LIVE_ADMIN_EMAIL, and LIVE_ADMIN_PASSWORD.');
const BASE_URL = 'https://airesume.projectdemo.guru';

async function fetchJson(url, options = {}) {
    return new Promise((resolve) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
                } catch(e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });
        req.on('error', (e) => {
            resolve({ status: 0, data: e.message });
        });
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function login() {
    const postData = JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        returnSecureToken: true
    });
    const { status, data } = await fetchJson(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, { method: 'POST', body: postData });
    if (status !== 200) throw new Error(`Login failed: ${status}`);
    return data.idToken;
}

// Parse the API catalog
const catalogPath = path.join(__dirname, '../brain/8aa7d69e-4632-4c09-8dab-8777cc31b58c/api_catalog.md');
// Fallback if that path doesn't exist (we'll just use the raw string provided by user)
const rawList = `
- **POST** \`/api/admin/ai/fetch-models\`
- **POST** \`/api/admin/ai/quota-limits\`
- **GET** \`/api/admin/ai/quota-stats\`
- **POST** \`/api/admin/ai/reset-quota\`
- **POST** \`/api/admin/ai/test-provider\`
- **POST** \`/api/admin/blog/categories\`
- **PATCH** \`/api/admin/blog/categories/:categoryId\`
- **DELETE** \`/api/admin/blog/categories/:categoryId\`
- **PATCH** \`/api/admin/blog/posts/:postId\`
- **DELETE** \`/api/admin/blog/posts/:postId\`
- **POST** \`/api/admin/blog/publish-due\`
- **PATCH** \`/api/admin/companies/:companyId\`
- **GET** \`/api/admin/coupons\`
- **PUT** \`/api/admin/coupons/:code\`
- **DELETE** \`/api/admin/coupons/:code\`
- **POST** \`/api/admin/delete-user\`
- **PATCH** \`/api/admin/employer-applications/:uid\`
- **GET** \`/api/admin/firebase-service-account\`
- **POST** \`/api/admin/firebase-service-account\`
- **POST** \`/api/admin/gdpr-settings\`
- **POST** \`/api/admin/global-rating\`
- **GET** \`/api/admin/health-summary\`
- **PATCH** \`/api/admin/jobs/:jobId\`
- **DELETE** \`/api/admin/jobs/:jobId\`
- **POST** \`/api/admin/landing-content\`
- **GET** \`/api/admin/pages\`
- **PUT** \`/api/admin/pages/:slug\`
- **DELETE** \`/api/admin/pages/:slug\`
- **POST** \`/api/admin/payment-settings\`
- **POST** \`/api/admin/payment/test-provider\`
- **POST** \`/api/admin/payments/refund\`
- **POST** \`/api/admin/reviews\`
- **DELETE** \`/api/admin/reviews/:reviewId\`
- **POST** \`/api/admin/settings/:category\`
- **POST** \`/api/admin/system-health-settings\`
- **GET** \`/api/admin/trusted-by\`
- **POST** \`/api/admin/trusted-by\`
- **PATCH** \`/api/admin/trusted-by/:logoId\`
- **DELETE** \`/api/admin/trusted-by/:logoId\`
- **GET** \`/api/admin/twilio-settings\`
- **POST** \`/api/admin/twilio-settings\`
- **PATCH** \`/api/admin/users/:uid\`
- **POST** \`/api/admin/website-meta\`
- **POST** \`/api/auth/custom-password-reset\`
- **GET** \`/api/auth/github\`
- **GET** \`/api/auth/github/callback\`
- **GET** \`/api/auth/github/test-credentials\`
- **GET** \`/api/auth/linkedin\`
- **GET** \`/api/auth/linkedin/callback\`
- **GET** \`/api/auth/linkedin/test-credentials\`
- **POST** \`/api/auth/oauth/exchange\`
- **POST** \`/api/auth/purge-orphaned-auth\`
- **POST** \`/api/auth/send-verification-email\`
- **POST** \`/api/auth/set-user-password\`
- **POST** \`/api/auth/verify-email-token\`
- **POST** \`/api/check\`
- **POST** \`/api/contact\`
- **POST** \`/api/employer/companies\`
- **PATCH** \`/api/employer/companies/:companyId\`
- **DELETE** \`/api/employer/companies/:companyId\`
- **POST** \`/api/employer/jobs\`
- **PATCH** \`/api/employer/jobs/:jobId\`
- **DELETE** \`/api/employer/jobs/:jobId\`
- **POST** \`/api/export\`
- **POST** \`/api/export-docx\`
- **GET** \`/api/export-render-data\`
- **POST** \`/api/generate-ai-cover-letter\`
- **GET** \`/api/health\`
- **GET** \`/api/healthz\`
- **POST** \`/api/invoice\`
- **POST** \`/api/invoice/generate\`
- **PATCH** \`/api/job-applications/:applicationId/status\`
- **POST** \`/api/jobs/:jobId/applications\`
- **POST** \`/api/jobs/naukri\`
- **GET** \`/api/linkedin-scraper\`
- **POST** \`/api/messages/conversations\`
- **GET** \`/api/messages/conversations/:conversationId/participant-profile\`
- **POST** \`/api/messages/send\`
- **POST** \`/api/notify/email-otp\`
- **POST** \`/api/notify/job-application\`
- **POST** \`/api/notify/job-posted\`
- **POST** \`/api/notify/job-status-update\`
- **POST** \`/api/notify/password-changed\`
- **POST** \`/api/notify/password-reset\`
- **POST** \`/api/notify/portfolio-published\`
- **POST** \`/api/notify/security-alert\`
- **POST** \`/api/notify/send-verification-email\`
- **POST** \`/api/notify/subscription-cancelled\`
- **POST** \`/api/notify/user-signup\`
- **POST** \`/api/pay\`
- **GET** \`/api/payment-orders/:orderId\`
- **POST** \`/api/payment/razorpay-order\`
- **POST** \`/api/paypal/create-order\`
- **POST** \`/api/paypal/verify\`
- **POST** \`/api/paytm/initiate-transaction\`
- **POST** \`/api/paytm/verify-transaction\`
- **POST** \`/api/phonepe/initiate\`
- **POST** \`/api/phonepe/status\`
- **POST** \`/api/public-export\`
- **POST** \`/api/razorpay/create-order\`
- **POST** \`/api/razorpay/verify-payment\`
- **GET** \`/api/readyz\`
- **GET** \`/api/rtl-font-config\`
- **POST** \`/api/send-sms\`
- **POST** \`/api/stripe-webhook\`
- **POST** \`/api/subscription/preferences\`
- **GET** \`/healthz\`
- **GET** \`/llms.txt\`
- **GET** \`/public/custom-pages.json\`
- **GET** \`/public/trusted-by.json\`
- **GET** \`/readyz\`
- **GET** \`/api/admin/audit-logs\`
- **GET** \`/api/admin/audit-logs/:id\`
- **GET** \`/api/admin/audit-logs/stats\`
- **POST** \`/api/check-grammar\`
- **POST** \`/api/generate-content\`
- **POST** \`/api/generate-education-description\`
- **POST** \`/api/generate-interview\`
- **POST** \`/api/generate-resume\`
- **POST** \`/api/generate-skills\`
- **POST** \`/api/generate-summary\`
- **POST** \`/api/generate-work-description\`
- **POST** \`/api/parse-resume\`
- **GET** \`/api/email/admin/circuit-breaker-status\`
- **GET** \`/api/email/admin/custom-templates\`
- **POST** \`/api/email/admin/reset-circuit-breaker\`
- **POST** \`/api/email/admin/save-smtp\`
- **POST** \`/api/email/admin/save-template-customization\`
- **GET** \`/api/email/admin/settings\`
- **POST** \`/api/email/admin/test-connection\`
- **POST** \`/api/email/admin/test-imap\`
- **GET** \`/api/email/logs\`
- **POST** \`/api/email/resend\`
- **POST** \`/api/email/send-email\`
- **POST** \`/api/email/send-invoice-email\`
- **GET** \`/api/email/templates\`
- **POST** \`/api/email/templates\`
- **POST** \`/api/enterprise/ai/generate-content\`
- **GET** \`/api/enterprise/audit\`
- **GET** \`/api/enterprise/configuration\`
- **PATCH** \`/api/enterprise/configuration\`
- **GET** \`/api/enterprise/context\`
- **POST** \`/api/enterprise/context\`
- **GET** \`/api/enterprise/data-plane/status\`
- **GET** \`/api/enterprise/data/export\`
- **POST** \`/api/enterprise/lifecycle/suspend\`
- **GET** \`/api/enterprise/memberships\`
- **POST** \`/api/enterprise/memberships\`
- **PATCH** \`/api/enterprise/memberships/:principalId\`
- **DELETE** \`/api/enterprise/memberships/:principalId\`
- **POST** \`/api/enterprise/memberships/:principalId/invitation-resend\`
- **GET** \`/api/enterprise/observability/metrics\`
- **GET** \`/api/enterprise/platform/tenants\`
- **POST** \`/api/enterprise/platform/tenants/:tenantId/reactivate\`
- **POST** \`/api/enterprise/platform/tenants/:tenantId/suspend\`
- **GET** \`/api/enterprise/queue/jobs\`
- **POST** \`/api/enterprise/queue/jobs\`
- **POST** \`/api/enterprise/queue/replay\`
- **GET** \`/api/enterprise/queue/status\`
- **GET** \`/api/enterprise/resources\`
- **POST** \`/api/enterprise/resources\`
- **GET** \`/api/enterprise/resources/:resourceId\`
- **PATCH** \`/api/enterprise/resources/:resourceId\`
- **DELETE** \`/api/enterprise/resources/:resourceId\`
- **GET** \`/api/enterprise/roles-matrix\`
- **POST** \`/api/enterprise/service-accounts\`
- **GET** \`/api/enterprise/service-accounts\`
- **POST** \`/api/enterprise/service-accounts/:serviceAccountId/revoke\`
- **POST** \`/api/enterprise/service-accounts/:serviceAccountId/rotate\`
- **GET** \`/api/enterprise/status\`
- **POST** \`/api/enterprise/storage/token\`
- **POST** \`/api/enterprise/storage/verify\`
- **POST** \`/api/enterprise/support-grants\`
- **GET** \`/api/enterprise/support-grants\`
- **POST** \`/api/enterprise/support-grants/:grantId/revoke\`
- **GET** \`/api/enterprise/support/context\`
- **GET** \`/api/enterprise/teams\`
- **POST** \`/api/enterprise/teams\`
- **PATCH** \`/api/enterprise/teams/:teamId\`
- **POST** \`/api/enterprise/teams/:teamId/archive\`
- **GET** \`/api/enterprise/teams/:teamId/members\`
- **POST** \`/api/enterprise/teams/:teamId/members\`
- **DELETE** \`/api/enterprise/teams/:teamId/members/:principalId\`
- **POST** \`/api/enterprise/teams/:teamId/restore\`
- **PATCH** \`/api/enterprise/tenant\`
- **GET** \`/api/enterprise/tenants\`
- **POST** \`/api/enterprise/tenants\`
- **POST** \`/api/enterprise/tenants/:tenantId/reactivate\`
- **POST** \`/api/enterprise/test-email\`
- **GET** \`/api/enterprise/usage/ai\`
- **GET** \`/api/enterprise/usage/ai/events\`
- **GET** \`/api/enterprise/workspaces\`
- **POST** \`/api/enterprise/workspaces\`
- **PATCH** \`/api/enterprise/workspaces/:workspaceId\`
- **POST** \`/api/enterprise/workspaces/:workspaceId/archive\`
- **GET** \`/api/enterprise/workspaces/:workspaceId/members\`
- **POST** \`/api/enterprise/workspaces/:workspaceId/members\`
- **DELETE** \`/api/enterprise/workspaces/:workspaceId/members/:principalId\`
- **POST** \`/api/enterprise/workspaces/:workspaceId/restore\`
- **GET** \`/api/enterpriseM2m/context\`
- **GET** \`/api/platform/announcements\`
- **POST** \`/api/platform/announcements\`
- **PATCH** \`/api/platform/announcements/:id\`
- **DELETE** \`/api/platform/announcements/:id\`
- **GET** \`/api/platform/attention\`
- **GET** \`/api/platform/backup-status\`
- **GET** \`/api/platform/command-center\`
- **GET** \`/api/platform/encryption\`
- **GET** \`/api/platform/enterprise-queue\`
- **GET** \`/api/platform/health\`
- **GET** \`/api/platform/maintenance\`
- **POST** \`/api/platform/maintenance\`
- **GET** \`/api/platform/observability\`
- **GET** \`/api/platform/operators\`
- **POST** \`/api/platform/operators\`
- **GET** \`/api/platform/overview\`
- **GET** \`/api/platform/payments-health\`
- **GET** \`/api/platform/queues\`
- **POST** \`/api/platform/queues/retry\`
- **GET** \`/api/platform/search\`
- **GET** \`/api/platform/security-events\`
- **GET** \`/api/platform/tenants/:tenantId\`
- **POST** \`/api/platform/tenants/:tenantId/decommission\`
`;

const lines = rawList.split('\n').filter(line => line.trim().startsWith('- **'));
const endpoints = lines.map(line => {
    const match = line.match(/- \*\*(.*?)\*\* `(.*?)`/);
    return {
        method: match[1],
        url: match[2]
    };
});

async function run() {
    try {
        console.log('Logging in as Super Admin...');
        const token = await login();
        console.log('Token acquired. Testing 187 endpoints sequentially...');

        const results = [];
        let count = 0;

        for (const ep of endpoints) {
            count++;
            // Replace path parameters like :id with dummy strings
            const parsedUrl = ep.url.replace(/:[a-zA-Z]+/g, 'test-dummy-id');
            const fullUrl = `${BASE_URL}${parsedUrl}`;
            
            const options = {
                method: ep.method,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            };
            
            if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
                options.headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify({});
            }

            process.stdout.write(`[${count}/${endpoints.length}] ${ep.method.padEnd(6)} ${parsedUrl.padEnd(60)}`);
            const { status } = await fetchJson(fullUrl, options);
            process.stdout.write(` => ${status}\n`);
            results.push({ ...ep, status });
        }

        const summary = {
            '200': 0, '201': 0, '204': 0,
            '400': 0, '401': 0, '403': 0, '404': 0, '405': 0,
            '500': 0, '502': 0, '0': 0
        };

        results.forEach(r => {
            if (summary[r.status] !== undefined) summary[r.status]++;
            else summary[r.status] = 1;
        });

        console.log('\n================ SUMMARY ================');
        Object.entries(summary).filter(([k,v]) => v > 0).forEach(([status, count]) => {
            console.log(`HTTP ${status}: ${count} endpoints`);
        });

        const errors = results.filter(r => r.status >= 500 || r.status === 0);
        if (errors.length > 0) {
            console.log('\nErrors (500+):');
            errors.forEach(e => console.log(`- ${e.method} ${e.url} => ${e.status}`));
        }

        fs.writeFileSync(path.join(__dirname, 'api-test-results.json'), JSON.stringify(results, null, 2));
        console.log('Detailed results saved to scripts/api-test-results.json');

    } catch (e) {
        console.error('Fatal Error:', e.message);
    }
}

run();
