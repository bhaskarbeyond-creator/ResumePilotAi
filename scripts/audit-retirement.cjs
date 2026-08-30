'use strict';
const fs = require('fs');
const indexCode = fs.readFileSync('backend/index.js', 'utf8');

const extractedPaths = [
    'healthz', 'health', 'health/databases', 'readyz',
    'messages/conversations', 'messages/send', 'contact',
    'export-render-data', 'export-docx', 'export',
    'auth/linkedin', 'auth/github', 'auth/linkedin/callback', 'auth/github/callback',
    'auth/oauth/exchange', 'auth/linkedin/test-credentials', 'auth/github/test-credentials',
    'jobs/:jobId/applications', 'job-applications/:applicationId/status',
    'employer-applications', 'public/featured-companies',
    'employer/companies', 'employer/jobs',
    'pay', 'payment-orders', 'stripe-webhook',
    'paypal/create-order', 'paypal/verify',
    'razorpay/create-order', 'razorpay/verify-payment',
    'paytm/initiate-transaction', 'paytm/verify-transaction', 'paytm/callback',
    'phonepe/initiate', 'phonepe/status', 'phonepe/callback',
    'subscription/preferences', 'check', 'payment/razorpay-order',
    'invoice', 'jobs/naukri', 'rtl-font-config', 'llms.txt',
    'service-availability', 'send-sms',
];

let duplicates = 0;
let shadows = 0;

for (const path of extractedPaths) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const directRegex = new RegExp("app\\.(get|post|put|patch|delete)\\s*\\(\\s*['\"`]/api/" + escaped + "['\"`]", 'g');
    const directMatches = indexCode.match(directRegex);
    
    const commentRegex = new RegExp("//.*app\\.(get|post|put|patch|delete).*" + escaped, 'g');
    const commentMatches = indexCode.match(commentRegex);
    
    if (directMatches && directMatches.length > 0) {
        console.log('DUPLICATE: /api/' + path + ' (' + directMatches.length + ' registrations)');
        duplicates++;
    }
    
    if (commentMatches && commentMatches.length > 0) {
        console.log('COMMENTED-OUT: /api/' + path + ' (' + commentMatches.length + ' comments)');
        shadows++;
    }
}

console.log('');
console.log('Duplicates found: ' + duplicates);
console.log('Commented-out old code: ' + shadows);

if (duplicates === 0 && shadows === 0) {
    console.log('All old implementations completely removed from index.js');
}
