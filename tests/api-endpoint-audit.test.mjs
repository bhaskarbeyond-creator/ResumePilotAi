/**
 * API Endpoint Audit Test Harness
 * 
 * Tests that all documented API endpoints exist and have proper middleware.
 * 
 * Run: node --test tests/api-endpoint-audit.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

function readBackendIndex() {
    return readFileSync('backend/index.js', 'utf8');
}

function readHealthRoutes() {
    return readFileSync('backend/routes/health.js', 'utf8');
}

function readPaymentsRoutes() {
    return readFileSync('backend/routes/payments.js', 'utf8');
}

function readMiscRoutes() {
    return readFileSync('backend/routes/misc.js', 'utf8');
}

function readExportRoutes() {
    return readFileSync('backend/routes/exports.js', 'utf8');
}

function readOAuthRoutes() {
    return readFileSync('backend/routes/oauth.js', 'utf8');
}

function readMessagingRoutes() {
    return readFileSync('backend/routes/messaging.js', 'utf8');
}

describe('API Endpoint Audit', () => {
    
    describe('Health Endpoints', () => {
        it('has liveness endpoint /healthz', () => {
            const code = readBackendIndex() + readHealthRoutes();
            assert.ok(code.includes("'/healthz'") || code.includes("'/healthz'"), 'Should have /healthz endpoint');
        });

        it('has readiness endpoint /readyz', () => {
            const code = readBackendIndex() + readHealthRoutes();
            assert.ok(code.includes("'/readyz'") || code.includes("'/readyz'"), 'Should have /readyz endpoint');
        });

        it('has health endpoint /api/health', () => {
            const code = readBackendIndex() + readHealthRoutes();
            assert.ok(code.includes("'/api/health'") || code.includes("'/health'"), 'Should have /api/health endpoint');
        });

        it('has database health endpoint /api/health/databases', () => {
            const code = readBackendIndex() + readHealthRoutes();
            assert.ok(code.includes("'/api/health/databases'") || code.includes("'/health/databases'"), 'Should have /api/health/databases endpoint');
        });

        it('has AI provider health endpoint /api/health/ai-providers', () => {
            const code = readBackendIndex() + readHealthRoutes();
            assert.ok(code.includes("'/api/health/ai-providers'") || code.includes("'/health/ai-providers'"), 'Should have /api/health/ai-providers endpoint');
        });
    });

    describe('Authentication Endpoints', () => {
        it('has password reset endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/auth/custom-password-reset'"), 'Should have password reset endpoint');
        });

        it('has email verification endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/auth/send-verification-email'"), 'Should have email verification endpoint');
        });

        it('has verify email token endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/auth/verify-email-token'"), 'Should have verify email token endpoint');
        });

        it('has set password endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/auth/set-user-password'"), 'Should have set password endpoint');
        });

        it('has OAuth exchange endpoint', () => {
            const code = readBackendIndex() + readOAuthRoutes();
            assert.ok(code.includes("'/api/auth/oauth/exchange'") || code.includes("'/auth/oauth/exchange'"), 'Should have OAuth exchange endpoint');
        });

        it('has preview login endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/auth/preview-login'"), 'Should have preview login endpoint');
        });
    });

    describe('OAuth Endpoints', () => {
        it('has LinkedIn OAuth begin', () => {
            const code = readBackendIndex() + readOAuthRoutes();
            assert.ok(code.includes("'/api/auth/linkedin'") || code.includes("'/auth/linkedin'"), 'Should have LinkedIn OAuth begin');
        });

        it('has LinkedIn OAuth callback', () => {
            const code = readBackendIndex() + readOAuthRoutes();
            assert.ok(code.includes("'/api/auth/linkedin/callback'") || code.includes("'/auth/linkedin/callback'"), 'Should have LinkedIn OAuth callback');
        });

        it('has GitHub OAuth begin', () => {
            const code = readBackendIndex() + readOAuthRoutes();
            assert.ok(code.includes("'/api/auth/github'") || code.includes("'/auth/github'"), 'Should have GitHub OAuth begin');
        });

        it('has GitHub OAuth callback', () => {
            const code = readBackendIndex() + readOAuthRoutes();
            assert.ok(code.includes("'/api/auth/github/callback'") || code.includes("'/auth/github/callback'"), 'Should have GitHub OAuth callback');
        });
    });

    describe('Payment Endpoints', () => {
        it('has Stripe payment endpoint', () => {
            const code = readBackendIndex() + readPaymentsRoutes();
            assert.ok(code.includes("'/api/pay'") || code.includes("'/pay'"), 'Should have Stripe payment endpoint');
        });

        it('has Stripe webhook endpoint', () => {
            const code = readBackendIndex() + readPaymentsRoutes();
            assert.ok(code.includes("'/api/stripe-webhook'") || code.includes("'/stripe-webhook'"), 'Should have Stripe webhook endpoint');
        });

        it('has PayPal create order endpoint', () => {
            const code = readBackendIndex() + readPaymentsRoutes();
            assert.ok(code.includes("'/api/paypal/create-order'") || code.includes("'/paypal/create-order'"), 'Should have PayPal create order endpoint');
        });

        it('has PayPal verify endpoint', () => {
            const code = readBackendIndex() + readPaymentsRoutes();
            assert.ok(code.includes("'/api/paypal/verify'") || code.includes("'/paypal/verify'"), 'Should have PayPal verify endpoint');
        });

        it('has Razorpay create order endpoint', () => {
            const code = readBackendIndex() + readPaymentsRoutes();
            assert.ok(code.includes("'/api/razorpay/create-order'") || code.includes("'/razorpay/create-order'"), 'Should have Razorpay create order endpoint');
        });

        it('has Razorpay verify payment endpoint', () => {
            const code = readBackendIndex() + readPaymentsRoutes();
            assert.ok(code.includes("'/api/razorpay/verify-payment'") || code.includes("'/razorpay/verify-payment'"), 'Should have Razorpay verify payment endpoint');
        });

        it('has payment orders endpoint', () => {
            const code = readBackendIndex() + readPaymentsRoutes();
            assert.ok(code.includes("'/api/payment-orders'") || code.includes("'/payment-orders'"), 'Should have payment orders endpoint');
        });
    });

    describe('Entitlement Endpoints', () => {
        it('has entitlement check endpoint', () => {
            const code = readBackendIndex() + readPaymentsRoutes();
            assert.ok(code.includes("'/api/check'") || code.includes("'/check'"), 'Should have entitlement check endpoint');
        });
    });

    describe('Export Endpoints', () => {
        it('has PDF export endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/export'"), 'Should have PDF export endpoint');
        });

        it('has public export endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/public-export'"), 'Should have public export endpoint');
        });

        it('has DOCX export endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/export-docx'"), 'Should have DOCX export endpoint');
        });

        it('has export render data endpoint', () => {
            const code = readBackendIndex() + readExportRoutes();
            assert.ok(code.includes("'/api/export-render-data'") || code.includes("'/export-render-data'"), 'Should have export render data endpoint');
        });
    });

    describe('AI Endpoints', () => {
        it('has AI cover letter endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/generate-ai-cover-letter'"), 'Should have AI cover letter endpoint');
        });
    });

    describe('Messaging Endpoints', () => {
        it('has conversations list endpoint', () => {
            const code = readMessagingRoutes();
            assert.ok(code.includes("'/messages/conversations'"), 'Should have conversations list endpoint');
        });

        it('has send message endpoint', () => {
            const code = readMessagingRoutes();
            assert.ok(code.includes("'/messages/send'"), 'Should have send message endpoint');
        });
    });

    describe('Contact Endpoint', () => {
        it('has contact endpoint', () => {
            const code = readMessagingRoutes();
            assert.ok(code.includes("'/contact'"), 'Should have contact endpoint');
        });
    });

    describe('Service Availability', () => {
        it('has service availability endpoint', () => {
            const code = readBackendIndex() + readMiscRoutes();
            assert.ok(code.includes("'/api/service-availability'") || code.includes("'/service-availability'"), 'Should have service availability endpoint');
        });
    });

    describe('Account Endpoints', () => {
        it('has account export endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/account/export'"), 'Should have account export endpoint');
        });

        it('has account delete endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/account/delete'"), 'Should have account delete endpoint');
        });
    });

    describe('Invoice Endpoints', () => {
        it('has invoice generate endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/invoice/generate'"), 'Should have invoice generate endpoint');
        });

        it('has invoices list endpoint', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/invoices'"), 'Should have invoices list endpoint');
        });
    });

    describe('Route Files Mounted', () => {
        it('mounts resumes router', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/resumes'"), 'Should mount resumes router');
        });

        it('mounts portfolios router', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/portfolios'"), 'Should mount portfolios router');
        });

        it('mounts covers router', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/covers'"), 'Should mount covers router');
        });

        it('mounts support router', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/support'"), 'Should mount support router');
        });

        it('mounts jobs data router', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/jobs-data'"), 'Should mount jobs data router');
        });

        it('mounts blog data router', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/blog-data'"), 'Should mount blog data router');
        });

        it('mounts notifications data router', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/notifications-data'"), 'Should mount notifications data router');
        });

        it('mounts users data router', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/users-data'"), 'Should mount users data router');
        });

        it('mounts enterprise router', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/enterprise'"), 'Should mount enterprise router');
        });

        it('mounts admin router', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/admin'"), 'Should mount admin router');
        });

        it('mounts platform router', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("'/api/platform'"), 'Should mount platform router');
        });

        it('mounts messaging router', () => {
            const code = readBackendIndex();
            assert.ok(code.includes("messagingRouter"), 'Should mount messaging router');
        });
    });

    describe('Rate Limiting', () => {
        it('has global rate limiter', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('globalLimiter'), 'Should have global rate limiter');
        });

        it('has auth rate limiter', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('authLimiter'), 'Should have auth rate limiter');
        });

        it('has AI account limiter', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('aiAccountLimiter'), 'Should have AI account limiter');
        });

        it('has export account limiter', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('exportAccountLimiter'), 'Should have export account limiter');
        });
    });

    describe('Security Middleware', () => {
        it('has CORS configuration', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('cors('), 'Should have CORS configuration');
        });

        it('has Helmet security headers', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('helmet()'), 'Should have Helmet security headers');
        });

        it('has request ID middleware', () => {
            const code = readBackendIndex();
            assert.ok(code.includes('X-Request-Id'), 'Should have request ID middleware');
        });
    });
});
